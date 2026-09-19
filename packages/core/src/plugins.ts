import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, join, resolve, sep } from 'node:path'
import type { CWReader } from './cw-reader.js'
import type { PluginEntry, PluginInstall, PluginSkill } from './cw-types.js'
import type { Runner } from './task-review.js'

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

function manifestRepo(manifest: Json): string | undefined {
  const repo = manifest['repository']
  if (typeof repo === 'string') return repo
  if (isRecord(repo) && typeof repo['url'] === 'string') return repo['url']
  return undefined
}

function marketplaceRepo(marketplaces: Json, marketplace: string): string | undefined {
  const entry = marketplaces[marketplace]
  const source = isRecord(entry) ? entry['source'] : undefined
  if (!isRecord(source)) return undefined
  const value = source['repo'] ?? source['url']
  return typeof value === 'string' ? value : undefined
}

interface Found { install: PluginInstall; repo?: string }

function projectSkillNames(projectPath: string): string[] {
  const dir = join(projectPath, '.claude', 'skills')
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory() && existsSync(join(dir, e.name, 'SKILL.md')))
    .map(e => e.name)
    .sort()
}

export async function listPlugins(reader: CWReader, remoteOf: RemoteLookup): Promise<PluginEntry[]> {
  const scopes: Array<Pick<PluginInstall, 'scope' | 'scopeRef'>> = [
    { scope: 'global', scopeRef: 'global' },
    ...reader.getAccounts().map(a => ({ scope: 'account' as const, scopeRef: a })),
  ]
  const found = new Map<string, Found[]>()

  for (const { scope, scopeRef } of scopes) {
    const configDir = reader.getSkillConfigDir(scope, scopeRef)
    const installed = readJson(join(configDir, 'plugins', 'installed_plugins.json'))['plugins']
    if (!isRecord(installed)) continue
    const marketplaces = readJson(join(configDir, 'plugins', 'known_marketplaces.json'))
    const enabledPlugins = readJson(join(configDir, 'settings.json'))['enabledPlugins']
    for (const [id, entries] of Object.entries(installed)) {
      if (!Array.isArray(entries)) continue
      // project and local scopes belong to one project, not the account
      const user = entries.find((e): e is Json => isRecord(e) && e['scope'] === 'user' && typeof e['installPath'] === 'string')
      if (!user) continue
      const marketplace = id.slice(id.lastIndexOf('@') + 1)
      const install: PluginInstall = {
        scope,
        scopeRef,
        version: String(user['version'] ?? ''),
        enabled: !isRecord(enabledPlugins) || enabledPlugins[id] !== false,
        installPath: String(user['installPath']),
        lastUpdated: typeof user['lastUpdated'] === 'string' ? user['lastUpdated'] : undefined,
      }
      const list = found.get(id) ?? []
      list.push({ install, repo: marketplaceRepo(marketplaces, marketplace) })
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
      name: id.slice(0, id.lastIndexOf('@')),
      marketplace: id.slice(id.lastIndexOf('@') + 1),
      description: String(manifest['description'] ?? ''),
      repo,
      installs: list.map(f => f.install),
      skills: skillDirs(newest.install.installPath, manifest).flatMap(dir => readSkill(reader, dir) ?? []),
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
