import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { isAbsolute, join, resolve, sep } from 'node:path'
import type { LegacyManifest, ModuleManifestV1, ModuleStatus } from '@forge-dev/sdk'
import { checkManifest, manifestFileFor } from './module-manifest.js'
import type { ModuleHost } from './module-host.js'
import { tailOutput } from './output.js'
import { expandHome } from './state-log.js'
import type { Runner } from './task-review.js'

export const TRUST_NOTE = 'Modules run inside Forge with your access. Forge checks every call against these permissions, but it is not a sandbox: install only modules you trust.'

export interface ManifestPreview {
  kind: 'v1' | 'legacy'
  manifest: ModuleManifestV1 | LegacyManifest
  // what npm resolved the spec to, for a spec npm had to fetch
  packed?: { name: string; version: string }
}

const isPathSpec = (spec: string, cwd: string) =>
  spec.startsWith('.') || spec.startsWith('~') || isAbsolute(spec) || (existsSync(resolve(cwd, spec)) && !spec.startsWith('@'))

const expand = (spec: string, cwd: string) => resolve(cwd, expandHome(spec))

// the manifest of what would be installed, read without running any of the package's code
export async function previewManifest(spec: string, opts: { cwd: string; run: Runner }): Promise<ManifestPreview> {
  if (isPathSpec(spec, opts.cwd)) return readFolder(expand(spec, opts.cwd))
  const tmp = mkdtempSync(join(tmpdir(), 'forge-module-pack-'))
  try {
    const packed = await opts.run('npm', ['pack', spec, '--pack-destination', tmp, '--ignore-scripts', '--json'], opts.cwd)
    if (packed.code !== 0) throw new Error(npmPackError(spec, packed.stderr || packed.stdout))
    const info = (JSON.parse(packed.stdout) as Array<{ filename?: string; name?: string; version?: string }>)[0]
    const filename = info?.filename
    if (!filename) throw new Error(`npm pack ${spec} produced no tarball`)
    const untar = await opts.run('tar', ['-xzf', join(tmp, filename), '-C', tmp], opts.cwd)
    if (untar.code !== 0) throw new Error(`could not unpack ${filename}: ${untar.stderr.trim()}`)
    const preview = readFolder(join(tmp, 'package'))
    return info.name && info.version ? { ...preview, packed: { name: info.name, version: info.version } } : preview
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

// npm's own words without the debug log line; a missing package is said plainly
function npmPackError(spec: string, output: string): string {
  if (/\bE404\b/.test(output)) return `${spec} is not on npm`
  const lines = output.trim().split('\n').filter(l => !l.includes('A complete log of this run'))
  return `npm pack ${spec} failed: ${lines.join('\n')}`
}

function readFolder(dir: string): ManifestPreview {
  const manifestFile = manifestFileFor(dir).file
  if (!existsSync(manifestFile)) throw new Error(`${dir} has no forge-module.json`)
  const raw = JSON.parse(readFileSync(manifestFile, 'utf-8')) as unknown
  const check = checkManifest(raw, dir)
  if (check.kind === 'invalid') throw new Error(`invalid manifest: ${check.reason}`)
  return check
}

export interface PermissionLine { kind: 'network' | 'fs:read' | 'fs:write' | 'shell' | 'pty'; value: string }

export function permissionLines(manifest: ModuleManifestV1 | LegacyManifest): PermissionLine[] {
  const p = 'permissions' in manifest ? manifest.permissions ?? {} : {}
  const lines: PermissionLine[] = []
  for (const kind of ['network', 'fs:read', 'fs:write', 'shell'] as const) {
    for (const value of p[kind] ?? []) lines.push({ kind, value })
  }
  if (p.pty) lines.push({ kind: 'pty', value: 'yes' })
  const legacy = 'actions' in manifest && (manifest.actions ?? []).some(a => 'command' in a)
  if (legacy) lines.push({ kind: 'shell', value: 'runs the shell commands in its manifest' })
  return lines
}

export function describePermissions(manifest: ModuleManifestV1 | LegacyManifest): string {
  const lines = permissionLines(manifest).map(l => `  ${l.kind.padEnd(9)} ${l.value}`)
  return [lines.length ? 'It asks for:' : 'It asks for no permissions.', ...lines, '', TRUST_NOTE].join('\n')
}

export function installArgs(spec: string, prefix: string): string[] {
  return ['install', '--ignore-scripts', '--prefix', prefix, spec]
}

export class InstallError extends Error {
  constructor(readonly code: 'bad_request' | 'not_found' | 'busy' | 'confirmation_required' | 'install_failed', message: string) {
    super(message)
  }
}

export interface InstallPreview {
  token: string
  kind: 'v1' | 'legacy'
  name: string
  version: string
  displayName: string
  description?: string
  // what npm installs: the exact version read, a folder's absolute path, or a git or tarball url as given
  spec: string
  permissions: PermissionLine[]
  trustNote: string
}

interface InstallerOptions { modulesDir: string; host: ModuleHost; run: Runner; cwd?: string; now?: () => number }

const PREVIEW_TTL_MS = 10 * 60_000
const REGISTRY_SPEC = /^(@[^/@\s]+\/)?[^/@\s:]+(@[^\s/:]*)?$/

// installs only what a preview showed, one change at a time, and rescans so the module shows without a restart
export class ModuleInstaller {
  private previews = new Map<string, { spec: string; name: string; expires: number }>()
  private busy = false

  constructor(private readonly opts: InstallerOptions) {}

  private get now() { return (this.opts.now ?? Date.now)() }

  async preview(spec: string): Promise<InstallPreview> {
    const cwd = this.opts.cwd ?? homedir()
    const trimmed = spec.trim()
    if (!trimmed) throw new InstallError('bad_request', 'Give an npm package, a folder or a git url')
    let preview: ManifestPreview
    try {
      preview = await previewManifest(trimmed, { cwd, run: this.opts.run })
    } catch (err) {
      throw new InstallError('bad_request', (err as Error).message)
    }
    const m = preview.manifest
    const pinned = isPathSpec(trimmed, cwd) ? expand(trimmed, cwd)
      : preview.packed && REGISTRY_SPEC.test(trimmed) ? `${preview.packed.name}@${preview.packed.version}`
      : trimmed
    for (const [t, p] of this.previews) if (p.expires < this.now) this.previews.delete(t)
    const token = randomBytes(24).toString('base64url')
    this.previews.set(token, { spec: pinned, name: m.name, expires: this.now + PREVIEW_TTL_MS })
    return {
      token, kind: preview.kind, name: m.name, version: m.version, displayName: m.displayName,
      description: 'description' in m && typeof m.description === 'string' ? m.description : undefined,
      spec: pinned, permissions: permissionLines(m), trustNote: TRUST_NOTE,
    }
  }

  async install(token: string): Promise<ModuleStatus | undefined> {
    const p = this.previews.get(token)
    this.previews.delete(token)
    if (!p || p.expires < this.now) throw new InstallError('confirmation_required', 'Preview the module again before installing it')
    return this.exclusive(async () => {
      mkdirSync(this.opts.modulesDir, { recursive: true })
      const res = await this.opts.run('npm', installArgs(p.spec, this.opts.modulesDir), this.opts.modulesDir)
      if (res.code !== 0) throw new InstallError('install_failed', `npm install failed: ${tailOutput(res.stderr || res.stdout, 6)}`)
      const list = await this.opts.host.scan()
      return list.find(s => s.name === p.name)
    })
  }

  remove(id: string): Promise<void> {
    return this.exclusive(async () => {
      const found = this.opts.host.locate(id)
      if (!found) throw new InstallError('not_found', `No module ${id}`)
      if (!found.removable) throw new InstallError('bad_request', `${id} was not installed into Forge's modules folder; a dev folder unloads when forge module dev stops`)
      const packages = join(this.opts.modulesDir, 'node_modules') + sep
      if (found.dir.startsWith(packages)) {
        const name = packageName(found.dir) ?? found.dir.slice(packages.length)
        const res = await this.opts.run('npm', ['uninstall', '--prefix', this.opts.modulesDir, name], this.opts.modulesDir)
        if (res.code !== 0) throw new InstallError('install_failed', `npm uninstall failed: ${tailOutput(res.stderr || res.stdout, 6)}`)
      } else {
        rmSync(found.dir, { recursive: true, force: true })
      }
      await this.opts.host.scan()
    })
  }

  private async exclusive<T>(fn: () => Promise<T>): Promise<T> {
    if (this.busy) throw new InstallError('busy', 'Another module is being installed or removed')
    this.busy = true
    try {
      return await fn()
    } finally {
      this.busy = false
    }
  }
}

function packageName(dir: string): string | undefined {
  try {
    const name = (JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8')) as { name?: unknown }).name
    return typeof name === 'string' ? name : undefined
  } catch {
    return undefined
  }
}
