import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, join, resolve, sep } from 'node:path'
import type { CWReader } from './cw-reader.js'
import type { MarketplaceEntry, MarketplacePlugin, PluginCommand, PluginEntry, PluginInstall, PluginSkill, PluginTarget } from './cw-types.js'
import type { Runner } from './task-review.js'
import type { PluginInstallRef } from './kioku-versions.js'

// origin URL of a project's repository, or null when it has none
export type RemoteLookup = (projectPath: string) => Promise<string | null>

type Json = Record<string, unknown>

const isRecord = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)

function readJson(path: string): Json {
  try {
    const value: unknown = JSON.parse(readFileSync(path, 'utf-8'))
    return isRecord(value) ? value : {}
  } catch {
    return {}
  }
}

// "owner/repo", lowercased, for GitHub shorthands and SSH/HTTPS URLs; anything else is not comparable
export function normalizeRepo(value: string | undefined): string | undefined {
  if (!value) return undefined
  const m = value.trim().match(/^(?:git@github\.com:|(?:https?|ssh|git):\/\/(?:[^@/]+@)?github\.com\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i)
  return m ? `${m[1]}/${m[2]}`.toLowerCase() : undefined
}

export function createRemoteLookup(run: Runner): RemoteLookup {
  const cache = new Map<string, Promise<string | null>>()
  return (projectPath) => {
    let hit = cache.get(projectPath)
    if (!hit) {
      hit = run('git', ['remote', 'get-url', 'origin'], projectPath)
        .then(r => (r.code === 0 && r.stdout.trim()) || null)
        .catch(() => null)
      cache.set(projectPath, hit)
    }
    return hit
  }
}

const inside = (root: string, path: string) => {
  const r = resolve(root)
  const p = resolve(path)
  return p === r || p.startsWith(r + sep)
}

// the plugin.json "skills" array when present (Claude Code does not scan nested areas), otherwise skills/*
function scanDirs(root: string): string[] {
  if (!existsSync(root)) return []
  return readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => join(root, e.name))
}

function skillDirs(installPath: string, manifest: Json): string[] {
  const listed = manifest['skills']
  if (Array.isArray(listed)) {
    return listed
      .filter((p): p is string => typeof p === 'string')
      .map(p => resolve(installPath, p))
      .filter(p => inside(installPath, p))
  }
  if (typeof listed === 'string') {
    const root = resolve(installPath, listed)
    return inside(installPath, root) ? scanDirs(root) : []
  }
  return scanDirs(join(installPath, 'skills'))
}

function readSkill(reader: CWReader, dir: string): PluginSkill | null {
  try {
    const { frontmatter } = reader.parseFrontmatter(readFileSync(join(dir, 'SKILL.md'), 'utf-8'))
    return { name: String(frontmatter['name'] ?? basename(dir)), description: String(frontmatter['description'] ?? ''), path: dir }
  } catch {
    return null
  }
}

// commands/*.md, each named by its file; Claude Code reads description and argument-hint from the frontmatter
function readCommands(reader: CWReader, installPath: string): PluginCommand[] {
  const dir = join(installPath, 'commands')
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter(f => f.endsWith('.md')).sort().flatMap((file): PluginCommand[] => {
    try {
      const { frontmatter } = reader.parseFrontmatter(readFileSync(join(dir, file), 'utf-8'))
      const hint = frontmatter['argument-hint']
      return [{ name: `/${basename(file, '.md')}`, description: String(frontmatter['description'] ?? ''), ...(typeof hint === 'string' && hint ? { argumentHint: hint } : {}) }]
    } catch {
      return []
    }
  })
}

function manifestRepo(manifest: Json): string | undefined {
  const repo = manifest['repository']
  if (typeof repo === 'string') return repo
  if (isRecord(repo) && typeof repo['url'] === 'string') return repo['url']
  return undefined
}

// what `claude plugin marketplace add` takes: a GitHub repo, a git or JSON URL, or a local path
function marketplaceSource(entry: unknown): string | undefined {
  const source = isRecord(entry) ? entry['source'] : undefined
  if (!isRecord(source)) return undefined
  const value = source['repo'] ?? source['url'] ?? source['path']
  return typeof value === 'string' ? value : undefined
}

// "name@marketplace"; the name may itself hold an @
export function splitPluginId(id: string): { name: string; marketplace: string } {
  const at = id.lastIndexOf('@')
  return { name: id.slice(0, at), marketplace: id.slice(at + 1) }
}

const pluginScopes = (reader: CWReader): PluginTarget[] => [
  { scope: 'global', scopeRef: 'global' },
  ...reader.getAccounts().map(a => ({ scope: 'account' as const, scopeRef: a })),
]

const knownMarketplaces = (configDir: string) => readJson(join(configDir, 'plugins', 'known_marketplaces.json'))

interface Found { install: PluginInstall; repo?: string }

// Claude Code keeps a clone of each marketplace; its catalog entry, or the plugin.json at the entry's
// relative source, says the newest version. Remote sources and versionless entries say nothing.
function catalogVersion(configDir: string, marketplaces: Json, marketplace: string, name: string): string | undefined {
  const known = marketplaces[marketplace]
  const location = isRecord(known) && typeof known['installLocation'] === 'string'
    ? known['installLocation']
    : join(configDir, 'plugins', 'marketplaces', marketplace)
  const entries = readJson(join(location, '.claude-plugin', 'marketplace.json'))['plugins']
  if (!Array.isArray(entries)) return undefined
  const entry = entries.find((e): e is Json => isRecord(e) && e['name'] === name)
  if (!entry) return undefined
  if (typeof entry['version'] === 'string') return entry['version']
  const source = entry['source']
  if (typeof source !== 'string') return undefined
  const dir = resolve(location, source)
  if (!inside(location, dir)) return undefined
  const version = readJson(join(dir, '.claude-plugin', 'plugin.json'))['version']
  return typeof version === 'string' ? version : undefined
}

const numeric = (v: string) => /^\d+(\.\d+)*$/.test(v) ? v.split('.').map(Number) : null

// dotted versions compare by number; anything else (commit SHAs) counts as an update when it differs
export function hasUpdate({ latest, version }: { latest?: string; version: string }): boolean {
  if (!latest || latest === version) return false
  const a = numeric(latest)
  const b = numeric(version)
  if (!a || !b) return true
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0)
    if (d !== 0) return d > 0
  }
  return false
}

function projectSkillNames(projectPath: string): string[] {
  const dir = join(projectPath, '.claude', 'skills')
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory() && existsSync(join(dir, e.name, 'SKILL.md')))
    .map(e => e.name)
    .sort()
}

// what `claude` runs to update a plugin: its marketplace clone first, so a newer release is seen
export const pluginUpdateArgs = (id: string): string[][] => [['plugin', 'marketplace', 'update', splitPluginId(id).marketplace], ['plugin', 'update', id]]

// each config dir's user install of a plugin, by its name in any marketplace
export function installsOf(reader: CWReader, name: string): PluginInstallRef[] {
  return pluginScopes(reader).flatMap(({ scope, scopeRef }) => {
    const configDir = reader.getSkillConfigDir(scope, scopeRef)
    const installed = readJson(join(configDir, 'plugins', 'installed_plugins.json'))['plugins']
    if (!isRecord(installed)) return []
    return Object.entries(installed).flatMap(([id, entries]) => {
      const user = Array.isArray(entries) ? entries.find((e): e is Json => isRecord(e) && e['scope'] === 'user') : undefined
      if (!user || splitPluginId(id).name !== name) return []
      return [{ id, scope, scopeRef, version: String(user['version'] ?? ''), configDir, update: pluginUpdateArgs(id) }]
    })
  })
}

export async function listPlugins(reader: CWReader, remoteOf: RemoteLookup): Promise<PluginEntry[]> {
  const found = new Map<string, Found[]>()

  for (const { scope, scopeRef } of pluginScopes(reader)) {
    const configDir = reader.getSkillConfigDir(scope, scopeRef)
    const installed = readJson(join(configDir, 'plugins', 'installed_plugins.json'))['plugins']
    if (!isRecord(installed)) continue
    const marketplaces = knownMarketplaces(configDir)
    const enabledPlugins = readJson(join(configDir, 'settings.json'))['enabledPlugins']
    for (const [id, entries] of Object.entries(installed)) {
      if (!Array.isArray(entries)) continue
      // project and local scopes belong to one project, not the account
      const user = entries.find((e): e is Json => isRecord(e) && e['scope'] === 'user' && typeof e['installPath'] === 'string')
      if (!user) continue
      const { name, marketplace } = splitPluginId(id)
      const version = String(user['version'] ?? '')
      const latest = catalogVersion(configDir, marketplaces, marketplace, name)
      const install: PluginInstall = {
        scope,
        scopeRef,
        version,
        enabled: !isRecord(enabledPlugins) || enabledPlugins[id] !== false,
        installPath: String(user['installPath']),
        lastUpdated: typeof user['lastUpdated'] === 'string' ? user['lastUpdated'] : undefined,
        latest,
        update: hasUpdate({ latest, version }),
      }
      const list = found.get(id) ?? []
      list.push({ install, repo: marketplaceSource(marketplaces[marketplace]) })
      found.set(id, list)
    }
  }

  const projects = Object.entries(reader.getProjects())
  const remotes = await Promise.all(projects.map(async ([name, p]) => ({ name, path: p.path, repo: normalizeRepo((await remoteOf(p.path)) ?? undefined) })))

  const plugins: PluginEntry[] = []
  for (const [id, list] of found) {
    const newest = [...list].sort((a, b) => (b.install.lastUpdated ?? '').localeCompare(a.install.lastUpdated ?? ''))[0]!
    const manifest = readJson(join(newest.install.installPath, '.claude-plugin', 'plugin.json'))
    const repo = [manifestRepo(manifest), ...list.map(f => f.repo)].map(normalizeRepo).find(Boolean)
    const match = repo ? remotes.find(r => r.repo === repo) : undefined
    plugins.push({
      id,
      ...splitPluginId(id),
      description: String(manifest['description'] ?? ''),
      repo,
      installs: list.map(f => f.install),
      skills: skillDirs(newest.install.installPath, manifest).flatMap(dir => readSkill(reader, dir) ?? []),
      commands: readCommands(reader, newest.install.installPath),
      project: match?.name,
      contributing: match ? existsSync(join(match.path, 'CONTRIBUTING.md')) : false,
      projectSkills: match ? projectSkillNames(match.path) : [],
    })
  }
  return plugins.sort((a, b) => a.name.localeCompare(b.name))
}

export function readPluginSkill(plugin: PluginEntry, name: string): { name: string; description: string; content: string } | null {
  const skill = plugin.skills.find(s => s.name === name)
  if (!skill) return null
  try {
    return { name: skill.name, description: skill.description, content: readFileSync(join(skill.path, 'SKILL.md'), 'utf-8') }
  } catch {
    return null
  }
}

function readCatalog(location: string, marketplace: string): MarketplacePlugin[] {
  const listed = readJson(join(location, '.claude-plugin', 'marketplace.json'))['plugins']
  return (Array.isArray(listed) ? listed : [])
    .filter((p): p is Json => isRecord(p) && typeof p['name'] === 'string')
    .map(p => ({
      id: `${String(p['name'])}@${marketplace}`,
      name: String(p['name']),
      description: String(p['description'] ?? ''),
      category: typeof p['category'] === 'string' ? p['category'] : undefined,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

// every marketplace a config dir knows, with the plugins the first readable clone lists
export function listMarketplaces(reader: CWReader): MarketplaceEntry[] {
  const byName = new Map<string, MarketplaceEntry>()
  for (const target of pluginScopes(reader)) {
    for (const [name, entry] of Object.entries(knownMarketplaces(reader.getSkillConfigDir(target.scope, target.scopeRef)))) {
      const source = marketplaceSource(entry)
      if (!source) continue
      const known = byName.get(name) ?? { name, source, scopes: [], plugins: [] }
      known.scopes.push(target)
      const location = isRecord(entry) ? entry['installLocation'] : undefined
      if (known.plugins.length === 0 && typeof location === 'string') known.plugins = readCatalog(location, name)
      byName.set(name, known)
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export const knowsMarketplace = (configDir: string, marketplace: string) => isRecord(knownMarketplaces(configDir)[marketplace])

// the source any config dir registered this marketplace from
export function marketplaceSourceOf(reader: CWReader, marketplace: string): string | undefined {
  for (const { scope, scopeRef } of pluginScopes(reader)) {
    const source = marketplaceSource(knownMarketplaces(reader.getSkillConfigDir(scope, scopeRef))[marketplace])
    if (source) return source
  }
  return undefined
}
