import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { ACCOUNT_NAME_RE } from './cw-types.js'
import type { CWProject, CWSession, SkillEntry, SkillDetail, StackDetection } from './cw-types.js'

export interface ToolMcp { name: string; type: string; source: 'local' | 'project' | 'account' | 'cw'; url?: string }
export interface ToolPlugin { name: string; enabled: boolean; hasMcp: boolean; mcpName?: string; mcpType?: string; marketplace: string }

type JsonObject = Record<string, unknown>
const isObject = (v: unknown): v is JsonObject => typeof v === 'object' && v !== null && !Array.isArray(v)
const mcpType = (cfg: JsonObject): string => cfg.url ? 'url' : cfg.type === 'sse' ? 'sse' : 'command'
function readJsonObject(path: string): JsonObject {
  try {
    const data: unknown = JSON.parse(readFileSync(path, 'utf-8'))
    return isObject(data) ? data : {}
  } catch {
    return {}
  }
}

// The project is one path segment and sessionDir may nest (task-task/form-header),
// but neither may climb out of <cwDir>/sessions: route params are percent-decoded, so `..%2F` arrives as `../`
export function sessionFolder(cwDir: string, project: string, sessionDir = ''): string | null {
  if (typeof project !== 'string' || typeof sessionDir !== 'string') return null
  if (!project || project === '.' || project === '..' || /[\\/\0]/.test(project)) return null
  const segments = sessionDir ? sessionDir.split('/') : []
  if (segments.some((s) => s === '' || s === '.' || s === '..' || /[\\\0]/.test(s))) return null
  const root = resolve(cwDir, 'sessions')
  const dir = resolve(root, project, ...segments)
  return dir.startsWith(root + sep) ? dir : null
}

const withHarnessDefaults = (session: CWSession): CWSession =>
  ({ ...session, harness: session.harness ?? 'claude', provider: session.provider ?? 'native' })

export class CWReader {
  private cwDir: string

  constructor(cwDir?: string) {
    this.cwDir = cwDir ?? join(process.env.HOME ?? '', '.cw')
  }

  get cwHome(): string { return this.cwDir }

  getProjects(): Record<string, CWProject> {
    const path = join(this.cwDir, 'projects.json')
    if (!existsSync(path)) return {}
    return JSON.parse(readFileSync(path, 'utf-8'))
  }

  getSpaces(projectFilter?: string): CWSession[] {
    const sessionsDir = join(this.cwDir, 'sessions')
    if (!existsSync(sessionsDir)) return []

    const sessions: CWSession[] = []
    const projects = readdirSync(sessionsDir, { withFileTypes: true })

    for (const proj of projects) {
      if (!proj.isDirectory()) continue
      if (projectFilter && proj.name !== projectFilter) continue

      const projDir = join(sessionsDir, proj.name)
      for (const { relPath, absPath } of walkSessionDirs(projDir)) {
        try {
          const data = JSON.parse(readFileSync(absPath, 'utf-8')) as CWSession
          data.sessionDir = relPath
          sessions.push(withHarnessDefaults(data))
        } catch {
          // skip corrupt session files
        }
      }
    }

    return sessions.sort((a, b) =>
      new Date(b.last_opened).getTime() - new Date(a.last_opened).getTime()
    )
  }

  getSession(project: string, sessionDir: string): CWSession | null {
    const dir = sessionFolder(this.cwDir, project, sessionDir)
    if (!dir) return null
    const path = join(dir, 'session.json')
    if (!existsSync(path)) return null
    try {
      const data = JSON.parse(readFileSync(path, 'utf-8')) as CWSession
      data.sessionDir = sessionDir
      return withHarnessDefaults(data)
    } catch {
      return null
    }
  }

  getNotes(project: string, sessionDir: string): string {
    const baseDir = sessionFolder(this.cwDir, project, sessionDir)
    if (!baseDir) return ''
    // Try session.json notes path first
    const sessionPath = join(baseDir, 'session.json')
    if (existsSync(sessionPath)) {
      try {
        const session = JSON.parse(readFileSync(sessionPath, 'utf-8')) as CWSession
        if (existsSync(session.notes)) return readFileSync(session.notes, 'utf-8')
      } catch {}
    }
    // Fall back to notes files directly (may exist before session.json is created)
    for (const name of ['TASK_NOTES.md', 'REVIEW_NOTES.md']) {
      const p = join(baseDir, name)
      if (existsSync(p)) return readFileSync(p, 'utf-8')
    }
    return ''
  }

  getAccounts(): string[] {
    const dir = join(this.cwDir, 'accounts')
    if (!existsSync(dir)) return []
    return readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name)
  }

  getMCPs(project?: string, account?: string): { account: string | null; global: Record<string, unknown>; project: string[]; cw: string[]; plugins: string[] } {
    const tools = this.getTools(project, account)
    return {
      account: tools.account,
      global: Object.fromEntries(tools.mcps.filter(m => m.source === 'account').map(m => [m.name, {}])),
      project: tools.mcps.filter(m => m.source === 'local' || m.source === 'project').map(m => m.name),
      cw: tools.mcps.filter(m => m.source === 'cw').map(m => m.name),
      plugins: tools.plugins.map(p => p.name),
    }
  }

  // the folder Claude Code runs with for an account: CW keeps the flat dir unless a claude/ subdir exists
  accountConfigDir(account: string): string {
    const root = join(this.cwDir, 'accounts', account)
    return existsSync(join(root, 'claude')) ? join(root, 'claude') : root
  }

  /**
   * What Claude Code will load for a project under an account: MCPs from the account's .claude.json
   * (user and local scope), the repo's .mcp.json and .claude/settings.json, CW's mcps/, and the account's plugins.
   * The account defaults to the project's; with neither, it reads ~/.claude as Claude Code does without CW.
   */
  getTools(project?: string, account?: string): { account: string | null; mcps: ToolMcp[]; plugins: ToolPlugin[] } {
    const home = process.env.HOME ?? ''
    const projects = this.getProjects()
    const projPath = project ? projects[project]?.path ?? '' : ''
    const wanted = account ?? (project ? projects[project]?.account : undefined)
    const acct = wanted && ACCOUNT_NAME_RE.test(wanted) && existsSync(join(this.cwDir, 'accounts', wanted)) ? wanted : null
    const configDir = acct ? this.accountConfigDir(acct) : join(home, '.claude')
    // `claude mcp add` writes .claude.json: inside CLAUDE_CONFIG_DIR, or ~/.claude.json without it
    const state = readJsonObject(acct ? join(configDir, '.claude.json') : join(home, '.claude.json'))
    const settings = readJsonObject(join(configDir, 'settings.json'))

    const mcps: ToolMcp[] = []
    // the first source to name an MCP wins, in Claude Code's order: local, project, user
    const add = (servers: unknown, source: ToolMcp['source']) => {
      if (!isObject(servers)) return
      for (const [name, cfg] of Object.entries(servers)) {
        if (!isObject(cfg) || mcps.some(m => m.name === name)) continue
        mcps.push({ name, type: mcpType(cfg), source, url: typeof cfg.url === 'string' ? cfg.url : undefined })
      }
    }
    const projectEntry = (holder: JsonObject): unknown => {
      const byPath = holder.projects
      return isObject(byPath) && isObject(byPath[projPath]) ? byPath[projPath].mcpServers : undefined
    }

    if (projPath) {
      add(projectEntry(state), 'local')
      add(projectEntry(settings), 'local')
      // .mcp.json may be flat; a settings.json only counts its mcpServers key
      const mcpJson = readJsonObject(join(projPath, '.mcp.json'))
      add(mcpJson.mcpServers ?? mcpJson, 'project')
      add(readJsonObject(join(projPath, '.claude', 'settings.json')).mcpServers, 'project')
    }
    add(state.mcpServers, 'account')
    add(settings.mcpServers, 'account')

    const mcpsDir = join(this.cwDir, 'mcps')
    if (existsSync(mcpsDir)) {
      for (const f of readdirSync(mcpsDir).filter(f => f.endsWith('.json'))) {
        const name = f.replace('.json', '')
        if (!mcps.some(m => m.name === name)) mcps.push({ name, type: 'cw', source: 'cw' })
      }
    }

    const plugins: ToolPlugin[] = []
    const enabledPlugins = isObject(settings.enabledPlugins) ? settings.enabledPlugins : {}
    const installed = readJsonObject(join(configDir, 'plugins', 'installed_plugins.json')).plugins
    if (isObject(installed)) {
      for (const [key, entries] of Object.entries(installed)) {
        const name = key.split('@')[0]
        const marketplace = key.includes('@') ? key.split('@').slice(1).join('@') : 'unknown'
        const entry: unknown = Array.isArray(entries) ? entries[0] : undefined
        const installPath = isObject(entry) && typeof entry.installPath === 'string' ? entry.installPath : ''
        const raw = installPath ? readJsonObject(join(installPath, '.mcp.json')) : {}
        const servers = isObject(raw.mcpServers) ? raw.mcpServers : raw
        const first = Object.keys(servers).find(k => k !== 'mcpServers')
        const cfg = first ? servers[first] : undefined
        plugins.push({
          name, marketplace, enabled: enabledPlugins[key] === true,
          hasMcp: Boolean(first), mcpName: first, mcpType: isObject(cfg) ? mcpType(cfg) : undefined,
        })
      }
    }

    return { account: acct, mcps, plugins }
  }

  parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
    const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
    if (!match) return { frontmatter: {}, body: content }

    const rawBlock = match[1]
    const body = match[2]
    const frontmatter: Record<string, unknown> = {}

    let inMetadata = false
    const metadataObj: Record<string, unknown> = {}

    for (const line of rawBlock.split('\n')) {
      if (line.match(/^metadata:\s*$/)) {
        inMetadata = true
        continue
      }
      if (inMetadata) {
        const nested = line.match(/^\s+(\w[\w-]*):\s*(.*)$/)
        if (nested) {
          metadataObj[nested[1]] = nested[2].replace(/^['"]|['"]$/g, '')
          continue
        }
        // line is not indented — stop nested block
        inMetadata = false
      }
      const kv = line.match(/^(\w[\w-]*):\s*(.*)$/)
      if (kv) {
        frontmatter[kv[1]] = kv[2].replace(/^['"]|['"]$/g, '')
      }
    }

    if (Object.keys(metadataObj).length > 0) frontmatter['metadata'] = metadataObj

    return { frontmatter, body }
  }

  // directory whose skills/ holds a scope's skills; an unregistered project ref is used as a path
  getSkillConfigDir(scope: 'global' | 'account' | 'project', scopeRef: string): string {
    if (scope === 'global') return join(process.env.HOME ?? '', '.claude')
    if (scope === 'account') return join(this.cwDir, 'accounts', scopeRef)
    return join(this.getProjects()[scopeRef]?.path ?? scopeRef, '.claude')
  }

  getSkillDir(scope: 'global' | 'account' | 'project', scopeRef: string, name: string): string {
    return join(this.getSkillConfigDir(scope, scopeRef), 'skills', name)
  }

  // global, every account and every registered project
  getSkills(): SkillEntry[] {
    return [
      ...this.scanSkills(join(this.getSkillConfigDir('global', 'global'), 'skills'), 'global', 'global'),
      ...this.getAccounts().flatMap(a => this.scanSkills(join(this.getSkillConfigDir('account', a), 'skills'), 'account', a)),
      ...Object.entries(this.getProjects()).flatMap(([name, p]) => this.scanSkills(join(p.path, '.claude', 'skills'), 'project', name)),
    ]
  }

  private scanSkills(dir: string, scope: SkillEntry['scope'], scopeRef: string): SkillEntry[] {
    const results: SkillEntry[] = []
    if (!existsSync(dir)) return results
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name.startsWith('acct--')) continue
      const fullPath = join(dir, entry.name)
      const skillMd = join(fullPath, 'SKILL.md')
      if (!existsSync(skillMd)) continue
      try {
        const content = readFileSync(skillMd, 'utf-8')
        const { frontmatter } = this.parseFrontmatter(content)
        const refsDir = join(fullPath, 'references')
        const hasReferences = existsSync(refsDir) &&
          readdirSync(refsDir).some(f => f.endsWith('.md'))
        results.push({
          name: String(frontmatter['name'] ?? entry.name),
          dirName: entry.name,
          scope,
          scopeRef,
          description: String(frontmatter['description'] ?? ''),
          domain: frontmatter['domain'] ? String(frontmatter['domain']) : undefined,
          triggers: frontmatter['triggers'] ? String(frontmatter['triggers']) : undefined,
          hasReferences,
        })
      } catch {
        // skip unreadable skill
      }
    }
    return results
  }

  getSkill(scope: 'global' | 'account' | 'project', scopeRef: string, name: string): SkillDetail | null {
    const dir = this.getSkillDir(scope, scopeRef, name)
    const skillMd = join(dir, 'SKILL.md')
    if (!existsSync(skillMd)) return null

    try {
      const content = readFileSync(skillMd, 'utf-8')
      const { frontmatter, body } = this.parseFrontmatter(content)

      const references: { name: string; content: string }[] = []
      const refsDir = join(dir, 'references')
      if (existsSync(refsDir)) {
        for (const f of readdirSync(refsDir)) {
          if (!f.endsWith('.md')) continue
          try {
            references.push({ name: f, content: readFileSync(join(refsDir, f), 'utf-8') })
          } catch {
            // skip unreadable reference
          }
        }
      }

      return { name: String(frontmatter['name'] ?? name), scope, scopeRef, frontmatter, body, references }
    } catch {
      return null
    }
  }

  detectStack(project: string): StackDetection {
    const projects = this.getProjects()
    const projPath = projects[project]?.path ?? ''

    const has = (file: string) => existsSync(join(projPath, file))

    let framework: string | null = null
    if (has('next.config.js') || has('next.config.ts') || has('next.config.mjs')) framework = 'nextjs'
    else if (has('vite.config.ts') || has('vite.config.js')) framework = 'vite'
    else if (has('astro.config.mjs')) framework = 'astro'
    else if (has('nuxt.config.ts')) framework = 'nuxt'

    let testRunner: string | null = null
    if (has('vitest.config.ts') || has('vitest.config.js')) testRunner = 'vitest'
    else if (has('jest.config.js') || has('jest.config.ts')) testRunner = 'jest'
    else if (has('pytest.ini') || has('pyproject.toml')) testRunner = 'pytest'

    return {
      hasPackageJson: has('package.json'),
      hasTests: testRunner !== null || has('tests') || has('__tests__'),
      hasTailwind: has('tailwind.config.js') || has('tailwind.config.ts'),
      hasShadcn: has('components.json'),
      hasTokens: has('tokens') || has('src/tokens'),
      hasFigmaConfig: has('.figma.json') || has('figma.config.ts'),
      hasPlaywright: has('playwright.config.ts'),
      hasDockerfile: has('Dockerfile'),
      framework,
      testRunner
    }
  }
}

// Branch-style task names (e.g. `task/form-header`) produce nested session dirs
// like `task-task/form-header/session.json` (CW uses `mkdir -p`), so we descend
// past any dir that doesn't already hold a session.json.
const MAX_SESSION_DEPTH = 5

function* walkSessionDirs(baseDir: string, rel = '', depth = 0): Generator<{ relPath: string; absPath: string }> {
  if (depth >= MAX_SESSION_DEPTH) return
  let entries
  try { entries = readdirSync(join(baseDir, rel), { withFileTypes: true }) } catch { return }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const childRel = rel ? `${rel}/${entry.name}` : entry.name
    const sessionPath = join(baseDir, childRel, 'session.json')
    if (existsSync(sessionPath)) yield { relPath: childRel, absPath: sessionPath }
    else yield* walkSessionDirs(baseDir, childRel, depth + 1)
  }
}
