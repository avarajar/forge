import semver from 'semver'

// releases, updates and labs as kioku and GitHub answer them; Forge keeps no list of its own

export const KIOKU_REPO = 'monoku/kioku'
export const RELEASES_ARGS = ['api', `repos/${KIOKU_REPO}/releases`]
// a lab's name reaches kioku inside a config key
export const LAB_NAME = /^[A-Za-z0-9][\w-]*$/

// kioku's release versions: 5.0.0 or 5.0.0-rc.1, never a flag
export const isVersion = (v: string): boolean => semver.valid(v) === v

export interface KiokuRelease {
  version: string
  prerelease: boolean
  date: string
  notes: string
  notesUrl: string
  // the command that installs it
  install: string
}

// one account whose kioku plugin has another major than the tool, and what fixes it
export interface KiokuMismatch {
  scope: 'global' | 'account'
  scopeRef: string
  plugin: string
  version: string
  // a release of the plugin's major when it is ahead, the plugin's own update when it is behind
  fix: { kind: 'release'; version: string; command: string } | { kind: 'plugin'; command: string } | null
}

export interface KiokuReleases {
  installed: string | null
  stable: KiokuRelease | null
  // what the stable release is to the installed one: newer, or the way back from a pre-release
  stableAction: 'update' | 'back' | null
  // pre-releases newer than the installed version and the stable one, newest first
  prereleases: KiokuRelease[]
  mismatches: KiokuMismatch[]
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
  agents: KiokuAgentChange[]
  finishError: string | null
  // the command that ran, and for a check the one that installs
  command: string
  install?: string
}

export interface KiokuLab {
  name: string
  title: string
  about: string
  enabled: boolean
  settings?: Record<string, unknown>
  command?: string
  // the command that flips it
  toggle: string
  // per setting, the command that sets its current value
  set?: Record<string, string>
}

export interface KiokuLabs {
  // null when the installed kioku has no labs verb
  labs: KiokuLab[] | null
  command: string
}

// an account's install of kioku's Claude Code plugin, as plugins.ts reads it
export interface PluginInstallRef {
  id: string
  scope: 'global' | 'account'
  scopeRef: string
  version: string
  configDir: string
  // the claude commands that update it, as skill-routes runs them
  update: string[][]
}

export const quote = (arg: string): string => /^[\w./@:=-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, `'\\''`)}'`
export const commandLine = (bin: string, args: string[]): string => [bin, ...args].map(quote).join(' ')

export const updateArgs = (version: string, check = false): string[] => ['update', version, ...(check ? ['--check'] : [])]
export const labArgs = (name: string, enabled: boolean): string[] => ['config', 'set', `labs.${name}.enabled`, String(enabled)]
export const LABS_ARGS = ['labs', 'list']

// a plugin pinned to a commit has no major
const majorOf = (v: string): number | null => semver.parse(v)?.major ?? null

type Json = Record<string, unknown>
const isRecord = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
const text = (v: unknown): string | null => typeof v === 'string' ? v : null
// kioku writes an error as a string or as { message }
const message = (v: unknown): string | null => text(v) ?? (isRecord(v) ? text(v['message']) : null)

function readRelease(r: Json, bin: string): KiokuRelease {
  const version = String(r['tag_name']).replace(/^v/, '')
  return {
    version,
    prerelease: r['prerelease'] === true,
    date: text(r['published_at']) ?? '',
    notes: text(r['body'])?.trim() ?? '',
    notesUrl: text(r['html_url']) ?? `https://github.com/${KIOKU_REPO}/releases/tag/v${version}`,
    install: commandLine(bin, ['update', version]),
  }
}

function mismatches(installed: string | null, all: KiokuRelease[], plugins: PluginInstallRef[]): KiokuMismatch[] {
  const tool = installed ? majorOf(installed) : null
  if (tool === null) return []
  return plugins.flatMap((p): KiokuMismatch[] => {
    const plugin = majorOf(p.version)
    if (plugin === null || plugin === tool) return []
    const env = p.scope === 'global' ? '' : `CLAUDE_CONFIG_DIR=${quote(p.configDir)} `
    // the plugin follows kioku's main branch, so when it is ahead the tool catches up with a release of its major
    const release = all.find(r => majorOf(r.version) === plugin)
    const fix: KiokuMismatch['fix'] = plugin < tool
      ? { kind: 'plugin', command: p.update.map(args => env + commandLine('claude', args)).join(' && ') }
      : release ? { kind: 'release', version: release.version, command: release.install } : null
    return [{ scope: p.scope, scopeRef: p.scopeRef, plugin: p.id, version: p.version, fix }]
  })
}

function stableActionFor(installed: string | null, stable: KiokuRelease | null): KiokuReleases['stableAction'] {
  if (!stable || !installed || installed === stable.version) return null
  if (semver.prerelease(installed)) return 'back'
  return semver.gt(stable.version, installed) ? 'update' : null
}

// GitHub's release list, drafts and foreign tags left out, split around the installed version
export function pickReleases(listed: unknown, installed: string | null, plugins: PluginInstallRef[], bin: string): Omit<KiokuReleases, 'command' | 'error'> {
  const all = (Array.isArray(listed) ? listed : [])
    .filter(isRecord)
    .filter(r => r['draft'] !== true && isVersion(String(r['tag_name'] ?? '').replace(/^v/, '')))
    .map(r => readRelease(r, bin))
    .sort((a, b) => semver.rcompare(a.version, b.version))
  const stable = all.find(r => !r.prerelease) ?? null
  // a pre-release older than the stable release has nothing left to try
  const newer = (v: string) => (!installed || semver.gt(v, installed)) && (!stable || semver.gt(v, stable.version))
  return {
    installed,
    stable,
    stableAction: stableActionFor(installed, stable),
    prereleases: all.filter(r => r.prerelease && newer(r.version)),
    mismatches: mismatches(installed, all, plugins),
  }
}

// kioku update's answer with only the fields Forge shows
export function readUpdate(out: Json, command: string): KiokuUpdate {
  const agents = (Array.isArray(out['agents']) ? out['agents'] : []).filter(isRecord).map((a): KiokuAgentChange => ({
    host: String(a['host'] ?? ''),
    name: String(a['name'] ?? ''),
    from: text(a['from']),
    to: text(a['to']),
    changed: a['changed'] === true,
    error: message(a['error']),
  }))
  return { status: String(out['status'] ?? ''), version: text(out['version']), was: text(out['was']), agents, finishError: message(out['finishError']), command }
}

// kioku labs list's answer, passed on as it comes, plus the commands that change each lab
export function readLabs(out: unknown, bin: string): KiokuLab[] {
  const listed = isRecord(out) && Array.isArray(out['labs']) ? out['labs'] : []
  return listed.filter(isRecord).filter(l => LAB_NAME.test(String(l['name'] ?? ''))).map((l): KiokuLab => {
    const name = String(l['name'])
    const enabled = l['enabled'] === true
    const settings = isRecord(l['settings']) ? l['settings'] : undefined
    const set = settings && Object.fromEntries(Object.entries(settings).map(([key, value]) => [key, commandLine(bin, ['config', 'set', `labs.${name}.${key}`, typeof value === 'string' ? value : JSON.stringify(value)])]))
    return {
      name,
      title: text(l['title']) ?? name,
      about: text(l['about']) ?? '',
      enabled,
      ...(settings ? { settings, set } : {}),
      ...(text(l['command']) ? { command: text(l['command'])! } : {}),
      toggle: commandLine(bin, labArgs(name, !enabled)),
    }
  })
}
