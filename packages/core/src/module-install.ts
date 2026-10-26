import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import type { LegacyManifest, ModuleManifestV1 } from '@forge-dev/sdk'
import { checkManifest } from './module-manifest.js'
import type { Runner } from './task-review.js'

export const TRUST_NOTE = 'Modules run inside Forge with your access. Forge checks every call against these permissions, but it is not a sandbox: install only modules you trust.'

export interface ManifestPreview {
  kind: 'v1' | 'legacy'
  manifest: ModuleManifestV1 | LegacyManifest
}

const isPathSpec = (spec: string, cwd: string) =>
  spec.startsWith('.') || spec.startsWith('~') || isAbsolute(spec) || (existsSync(resolve(cwd, spec)) && !spec.startsWith('@'))

const expand = (spec: string, cwd: string) => (spec.startsWith('~/') ? join(homedir(), spec.slice(2)) : resolve(cwd, spec))

// the manifest of what would be installed, read without running any of the package's code
export async function previewManifest(spec: string, opts: { cwd: string; run: Runner }): Promise<ManifestPreview> {
  if (isPathSpec(spec, opts.cwd)) return readFolder(expand(spec, opts.cwd))
  const tmp = mkdtempSync(join(tmpdir(), 'forge-module-pack-'))
  try {
    const packed = await opts.run('npm', ['pack', spec, '--pack-destination', tmp, '--ignore-scripts', '--json'], opts.cwd)
    if (packed.code !== 0) throw new Error(`npm pack ${spec} failed: ${(packed.stderr || packed.stdout).trim()}`)
    const filename = (JSON.parse(packed.stdout) as Array<{ filename: string }>)[0]?.filename
    if (!filename) throw new Error(`npm pack ${spec} produced no tarball`)
    const untar = await opts.run('tar', ['-xzf', join(tmp, filename), '-C', tmp], opts.cwd)
    if (untar.code !== 0) throw new Error(`could not unpack ${filename}: ${untar.stderr.trim()}`)
    return readFolder(join(tmp, 'package'))
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

function readFolder(dir: string): ManifestPreview {
  let manifestFile = join(dir, 'forge-module.json')
  try {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8')) as { forge?: { manifest?: unknown } }
    if (typeof pkg.forge?.manifest === 'string') manifestFile = join(dir, pkg.forge.manifest)
  } catch { /* a folder without package.json is fine */ }
  if (!existsSync(manifestFile)) throw new Error(`${dir} has no forge-module.json`)
  const raw = JSON.parse(readFileSync(manifestFile, 'utf-8')) as unknown
  const check = checkManifest(raw, dir)
  if (check.kind === 'invalid') throw new Error(`invalid manifest: ${check.reason}`)
  return check
}

export function describePermissions(manifest: ModuleManifestV1 | LegacyManifest): string {
  const p = 'permissions' in manifest ? manifest.permissions ?? {} : {}
  const lines: string[] = []
  for (const key of ['network', 'fs:read', 'fs:write', 'shell'] as const) {
    for (const value of p[key] ?? []) lines.push(`  ${key.padEnd(9)} ${value}`)
  }
  if (p.pty) lines.push(`  ${'pty'.padEnd(9)} yes`)
  const legacy = 'actions' in manifest && (manifest.actions ?? []).some(a => 'command' in a)
  if (legacy) lines.push('  shell     runs the shell commands in its manifest')
  return [lines.length ? 'It asks for:' : 'It asks for no permissions.', ...lines, '', TRUST_NOTE].join('\n')
}

export function installArgs(spec: string, prefix: string): string[] {
  return ['install', '--ignore-scripts', '--prefix', prefix, spec]
}
