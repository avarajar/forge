// releases, updates and labs as kioku and GitHub answer them; Forge keeps no list of its own

export const KIOKU_REPO = 'monoku/kioku'
export const RELEASES_ARGS = ['api', `repos/${KIOKU_REPO}/releases`]
// kioku's release versions: 5.0.0 or 5.0.0-rc.1
export const VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/
// a lab's name reaches kioku inside a config key
export const LAB_NAME = /^[A-Za-z0-9][\w-]*$/

export interface KiokuRelease {
  version: string
  prerelease: boolean
  date: string
  notes: string
  notesUrl: string
  // the command that installs it
  install: string
}

export interface KiokuReleases {
  installed: string | null
  stable: KiokuRelease | null
  // pre-releases newer than the installed version and the stable one, newest first
  prereleases: KiokuRelease[]
  // every release, newest first, so the console can find one by major
  all: KiokuRelease[]
  command: string
  error: string | null
}

export interface KiokuAgentChange {
  host: string
  name: string
  from: string | null
  to: string | null
  changed: boolean
  error: string | null
}

export interface KiokuUpdate {
  status: string
  version: string | null
  was: string | null
  latest: string | null
  agents: KiokuAgentChange[]
  refreshed: unknown
  finishError: string | null
  command: string
}

export interface KiokuLab {
  name: string
  title: string
  about: string
  enabled: boolean
  settings?: Record<string, unknown>
  command?: string
  // the commands that turn it on and off
  toggle: { on: string; off: string }
  // per setting, the command that sets its current value
  set?: Record<string, string>
}

export interface KiokuLabs {
  // null when the installed kioku has no labs verb
  labs: KiokuLab[] | null
  command: string
}

export const commandLine = (bin: string, args: string[]): string => [bin, ...args].map(a => /^[\w./@:=-]+$/.test(a) ? a : `'${a.replace(/'/g, `'\\''`)}'`).join(' ')

export const updateArgs = (version: string, check = false): string[] => ['update', version, ...(check ? ['--check'] : []), '--json']
export const labArgs = (name: string, enabled: boolean): string[] => ['config', 'set', `labs.${name}.enabled`, String(enabled)]
export const LABS_ARGS = ['labs', 'list', '--json']

const parts = (v: string) => {
  const [core, pre] = v.replace(/^v/, '').split('-', 2) as [string, string | undefined]
  return { core: core.split('.').map(Number), pre: pre?.split('.') }
}

// semver order: a pre-release sorts before its release, rc.10 after rc.9
export function compareVersions(a: string, b: string): number {
  const x = parts(a)
  const y = parts(b)
  for (let i = 0; i < 3; i++) {
    const d = (x.core[i] ?? 0) - (y.core[i] ?? 0)
    if (d !== 0) return Math.sign(d)
  }
  if (!x.pre || !y.pre) return x.pre ? -1 : y.pre ? 1 : 0
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i]
    const q = y.pre[i]
    if (p === undefined || q === undefined) return p === undefined ? -1 : 1
    const n = Number(p)
    const m = Number(q)
    const d = Number.isInteger(n) && Number.isInteger(m) ? n - m : p.localeCompare(q)
    if (d !== 0) return Math.sign(d)
  }
  return 0
}

export const major = (v: string): number | null => {
  const m = /^v?(\d+)\./.exec(v)
  return m ? Number(m[1]) : null
}

type Json = Record<string, unknown>
const isRecord = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
const text = (v: unknown): string | null => typeof v === 'string' ? v : null

// GitHub's release list, drafts and foreign tags left out, split around the installed version
export function pickReleases(listed: unknown, installed: string | null, bin: string): Omit<KiokuReleases, 'command' | 'error'> {
  const all = (Array.isArray(listed) ? listed : [])
    .filter(isRecord)
    .filter(r => r['draft'] !== true && VERSION.test(String(r['tag_name'] ?? '').replace(/^v/, '')))
    .map((r): KiokuRelease => {
      const version = String(r['tag_name']).replace(/^v/, '')
      return {
        version,
        prerelease: r['prerelease'] === true,
        date: text(r['published_at']) ?? '',
        notes: text(r['body'])?.trim() ?? '',
        notesUrl: text(r['html_url']) ?? `https://github.com/${KIOKU_REPO}/releases/tag/v${version}`,
        install: commandLine(bin, ['update', version]),
      }
    })
    .sort((a, b) => compareVersions(b.version, a.version))
  const stable = all.find(r => !r.prerelease) ?? null
  // a pre-release older than the stable release has nothing left to try
  const newer = (v: string) => (!installed || compareVersions(v, installed) > 0) && (!stable || compareVersions(v, stable.version) > 0)
  return { installed, stable, prereleases: all.filter(r => r.prerelease && newer(r.version)), all }
}

// kioku update's answer with only the fields Forge shows
export function readUpdate(out: Json, command: string): KiokuUpdate {
  const agents = (Array.isArray(out['agents']) ? out['agents'] : []).filter(isRecord).map((a): KiokuAgentChange => ({
    host: String(a['host'] ?? ''),
    name: String(a['name'] ?? ''),
    from: text(a['from']),
    to: text(a['to']),
    changed: a['changed'] === true,
    error: text(a['error']) ?? (isRecord(a['error']) ? text(a['error']['message']) : null),
  }))
  const finish = out['finishError']
  return {
    status: String(out['status'] ?? ''),
    version: text(out['version']),
    was: text(out['was']),
    latest: text(out['latest']),
    agents,
    refreshed: out['refreshed'] ?? null,
    finishError: text(finish) ?? (isRecord(finish) ? text(finish['message']) : null),
    command,
  }
}

// kioku labs list's answer, passed on as it comes, plus the commands that toggle each lab
export function readLabs(out: unknown, bin: string): KiokuLab[] {
  const listed = isRecord(out) && Array.isArray(out['labs']) ? out['labs'] : []
  return listed.filter(isRecord).filter(l => LAB_NAME.test(String(l['name'] ?? ''))).map((l): KiokuLab => {
    const name = String(l['name'])
    const settings = isRecord(l['settings']) ? l['settings'] : undefined
    return {
      name,
      title: text(l['title']) ?? name,
      about: text(l['about']) ?? '',
      enabled: l['enabled'] === true,
      ...(settings ? { settings, set: Object.fromEntries(Object.entries(settings).map(([key, value]) => [key, commandLine(bin, ['config', 'set', `labs.${name}.${key}`, typeof value === 'string' ? value : JSON.stringify(value)])])) } : {}),
      ...(text(l['command']) ? { command: text(l['command'])! } : {}),
      toggle: { on: commandLine(bin, labArgs(name, true)), off: commandLine(bin, labArgs(name, false)) },
    }
  })
}
