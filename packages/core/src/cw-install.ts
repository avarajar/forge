import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { accessSync, constants, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { delimiter, join } from 'node:path'

// The npm package carries a copy of CW (packages/platform/cw). On start Forge installs it into
// CW_HOME when CW is missing and keeps it current, without touching a CW someone installed by hand.

export interface CwBundle { dir: string; version: string; ref: string }

// written next to the CW Forge installed, to tell it apart from one installed by hand
export interface CwInstallMarker { version: string; ref: string; sha256: string }

export interface InstalledCw { version: string | null; sha256: string }

export interface CwInstallInput {
  bundle: CwBundle | null
  installed: InstalledCw | null
  marker: CwInstallMarker | null
  cwOnPath: boolean
  skip: boolean
}

export interface CwInstallDecision { action: 'install' | 'update' | 'skip'; reason: string }

export interface CwInstallResult {
  action: 'installed' | 'updated' | 'skipped' | 'failed'
  version?: string
  message: string
}

export type InstallRunner = (script: string, args: string[], env: NodeJS.ProcessEnv) => Promise<{ code: number; output: string }>

const MARKER_FILE = '.forge-cw.json'
const INSTALL_TIMEOUT_MS = 120_000
const ANSI_RE = /\u001b\[[0-9;?]*[A-Za-z]/g

export function readCwVersion(file: string): string | null {
  try {
    const match = /^CW_VERSION="([^"]+)"/m.exec(readFileSync(file, 'utf-8'))
    return match ? match[1] : null
  } catch {
    return null
  }
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(n => parseInt(n, 10) || 0)
  const pb = b.split('.').map(n => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

export function readCwBundle(dir: string): CwBundle | null {
  try {
    const { ref } = JSON.parse(readFileSync(join(dir, '.bundle.json'), 'utf-8')) as { ref?: string }
    const version = readCwVersion(join(dir, 'cw'))
    if (!ref || !version || !existsSync(join(dir, 'install.sh'))) return null
    return { dir, version, ref }
  } catch {
    return null
  }
}

export function decideCwInstall({ bundle, installed, marker, cwOnPath, skip }: CwInstallInput): CwInstallDecision {
  if (skip) return { action: 'skip', reason: 'FORGE_SKIP_CW_INSTALL is set' }
  if (!bundle) return { action: 'skip', reason: 'this Forge carries no CW' }
  if (!installed) {
    return cwOnPath
      ? { action: 'skip', reason: 'using the cw found on PATH' }
      : { action: 'install', reason: 'CW is not installed' }
  }
  if (!installed.version) return { action: 'skip', reason: 'cannot read the installed CW version' }

  const newer = compareVersions(bundle.version, installed.version)
  const ownedByForge = marker !== null && marker.sha256 === installed.sha256
  if (ownedByForge) {
    if (marker.ref === bundle.ref) return { action: 'skip', reason: `CW ${installed.version} is current` }
    return newer >= 0
      ? { action: 'update', reason: `CW ${installed.version} → ${bundle.version}` }
      : { action: 'skip', reason: `installed CW ${installed.version} is newer than ${bundle.version}` }
  }
  return newer > 0
    ? { action: 'update', reason: `CW ${installed.version} → ${bundle.version}` }
    : { action: 'skip', reason: `CW ${installed.version} is current` }
}

export function findOnPath(name: string, pathVar: string | undefined, excludeDir?: string): string | null {
  for (const dir of (pathVar ?? '').split(delimiter)) {
    if (!dir || dir === excludeDir) continue
    const candidate = join(dir, name)
    try {
      if (!statSync(candidate).isFile()) continue
      accessSync(candidate, constants.X_OK)
      return candidate
    } catch { /* not here */ }
  }
  return null
}

// Sessions run `cw …` through `$SHELL -c`, which does not read ~/.zshrc, so CW's bin goes on Forge's PATH
export function pathWithCw(cwHome: string, pathVar: string | undefined): string {
  const bin = join(cwHome, 'bin')
  const rest = (pathVar ?? '').split(delimiter).filter(dir => dir && dir !== bin)
  return [bin, ...rest].join(delimiter)
}

const sha256Of = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex')

function readMarker(cwHome: string): CwInstallMarker | null {
  try {
    return JSON.parse(readFileSync(join(cwHome, MARKER_FILE), 'utf-8')) as CwInstallMarker
  } catch {
    return null
  }
}

const runInstall: InstallRunner = (script, args, env) => new Promise((resolve) => {
  execFile('bash', [script, ...args], { env, timeout: INSTALL_TIMEOUT_MS, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
    const output = `${String(stdout)}${String(stderr)}`
    if (!err) return resolve({ code: 0, output })
    const code = (err as NodeJS.ErrnoException & { code?: number | string }).code
    resolve({ code: typeof code === 'number' ? code : 1, output: output || err.message })
  })
})

// the installer's own error lines, without colors, else its last lines
function failureMessage(output: string): string {
  const lines = output.replace(ANSI_RE, '').split('\n').map(l => l.trim()).filter(Boolean)
  const errors = lines.filter(l => l.startsWith('[✗]')).map(l => l.slice(3).trim())
  return (errors.length > 0 ? errors : lines.slice(-3)).join(' ') || 'the CW installer failed'
}

export async function ensureCw(options: {
  cwHome: string
  bundleDir: string
  env?: NodeJS.ProcessEnv
  run?: InstallRunner
}): Promise<CwInstallResult> {
  const { cwHome, bundleDir } = options
  const env = options.env ?? process.env
  const run = options.run ?? runInstall
  const bin = join(cwHome, 'bin', 'cw')
  const bundle = readCwBundle(bundleDir)
  const installed = existsSync(bin) ? { version: readCwVersion(bin), sha256: sha256Of(bin) } : null

  const decision = decideCwInstall({
    bundle,
    installed,
    marker: readMarker(cwHome),
    cwOnPath: findOnPath('cw', env.PATH, join(cwHome, 'bin')) !== null,
    skip: env.FORGE_SKIP_CW_INSTALL === '1',
  })
  if (decision.action === 'skip' || !bundle) return { action: 'skipped', message: decision.reason }

  const { code, output } = await run(join(bundle.dir, 'install.sh'), ['--no-shell'], { ...env, CW_HOME: cwHome })
  if (code !== 0 || !existsSync(bin)) return { action: 'failed', message: failureMessage(output) }

  const marker: CwInstallMarker = { version: bundle.version, ref: bundle.ref, sha256: sha256Of(bin) }
  writeFileSync(join(cwHome, MARKER_FILE), JSON.stringify(marker, null, 2) + '\n')
  return {
    action: decision.action === 'install' ? 'installed' : 'updated',
    version: bundle.version,
    message: decision.reason,
  }
}
