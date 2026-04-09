import { readdirSync, readFileSync, existsSync, lstatSync } from 'node:fs'
import { join } from 'node:path'
import type { CWProject, CWSession, SkillEntry, SkillDetail, StackDetection } from './cw-types.js'

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
      const entries = readdirSync(projDir, { withFileTypes: true })

      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const sessionPath = join(projDir, entry.name, 'session.json')
        if (!existsSync(sessionPath)) continue

        try {
          const data = JSON.parse(readFileSync(sessionPath, 'utf-8')) as CWSession
          data.sessionDir = entry.name
          sessions.push(data)
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
    const path = join(this.cwDir, 'sessions', project, sessionDir, 'session.json')
    if (!existsSync(path)) return null
    try {
      const data = JSON.parse(readFileSync(path, 'utf-8')) as CWSession
      data.sessionDir = sessionDir
      return data
    } catch {
      return null
    }
  }

  getNotes(project: string, sessionDir: string): string {
    const baseDir = join(this.cwDir, 'sessions', project, sessionDir)
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

  getMCPs(project?: string): { global: Record<string, unknown>; project: string[]; cw: string[]; plugins: string[] } {
    const tools = this.getTools(project)
    return {
      global: Object.fromEntries(tools.mcps.filter(m => m.source === 'global').map(m => [m.name, {}])),
      project: tools.mcps.filter(m => m.source === 'project').map(m => m.name),
      cw: tools.mcps.filter(m => m.source === 'cw').map(m => m.name),
      plugins: tools.plugins.map(p => p.name),
    }
  }

  /** Rich tool/MCP/plugin info for the dashboard */
  getTools(project?: string): {
    mcps: Array<{ name: string; type: string; source: string; url?: string }>
    plugins: Array<{ name: string; enabled: boolean; hasMcp: boolean; mcpName?: string; mcpType?: string; marketplace: string }>
  } {
    const home = process.env.HOME ?? ''
    const mcps: Array<{ name: string; type: string; source: string; url?: string }> = []
    const plugins: Array<{ name: string; enabled: boolean; hasMcp: boolean; mcpName?: string; mcpType?: string; marketplace: string }> = []

    // --- Global MCPs from ~/.claude/settings.json ---
    const claudeSettings = join(home, '.claude', 'settings.json')
    let enabledPlugins: Record<string, boolean> = {}
    if (existsSync(claudeSettings)) {
      try {
        const data = JSON.parse(readFileSync(claudeSettings, 'utf-8'))
        if (data.mcpServers) {
          for (const [name, cfg] of Object.entries(data.mcpServers as Record<string, Record<string, unknown>>)) {
            const type = cfg.url ? 'url' : cfg.type === 'sse' ? 'sse' : 'command'
            mcps.push({ name, type, source: 'global', url: cfg.url as string | undefined })
          }
        }
        if (data.enabledPlugins) enabledPlugins = data.enabledPlugins as Record<string, boolean>
      } catch {}
    }

    // --- Per-project MCPs from global settings.json `projects` key ---
    if (project) {
      const projects = this.getProjects()
      const projPath = projects[project]?.path ?? ''

      if (projPath) {
        // Check global settings.json projects.<path>.mcpServers
        if (existsSync(claudeSettings)) {
          try {
            const globalData = JSON.parse(readFileSync(claudeSettings, 'utf-8'))
            const projSettings = globalData.projects?.[projPath]
            if (projSettings?.mcpServers) {
              for (const [name, cfg] of Object.entries(projSettings.mcpServers as Record<string, Record<string, unknown>>)) {
                if (!mcps.some(m => m.name === name)) {
                  const type = cfg.url ? 'url' : cfg.type === 'sse' ? 'sse' : 'command'
                  mcps.push({ name, type, source: 'project', url: cfg.url as string | undefined })
                }
              }
            }
          } catch {}
        }

        // Check .mcp.json / .claude/settings.json inside the project directory
        for (const configPath of [
          join(projPath, '.mcp.json'),
          join(projPath, '.claude', 'settings.json'),
        ]) {
          if (existsSync(configPath)) {
            try {
              const data = JSON.parse(readFileSync(configPath, 'utf-8'))
              const servers = data.mcpServers ?? data
              if (servers && typeof servers === 'object') {
                for (const [name, cfg] of Object.entries(servers as Record<string, Record<string, unknown>>)) {
                  if (name === 'mcpServers') continue // skip if still nested
                  if (!mcps.some(m => m.name === name)) {
                    const type = cfg.url ? 'url' : cfg.type === 'sse' ? 'sse' : 'command'
                    mcps.push({ name, type, source: 'project', url: cfg.url as string | undefined })
                  }
                }
              }
            } catch {}
          }
        }
      }
    }

    // --- CW managed MCPs ---
    const mcpsDir = join(this.cwDir, 'mcps')
    if (existsSync(mcpsDir)) {
      const files = readdirSync(mcpsDir).filter(f => f.endsWith('.json'))
      for (const f of files) {
        const name = f.replace('.json', '')
        if (!mcps.some(m => m.name === name)) {
          mcps.push({ name, type: 'cw', source: 'cw' })
        }
      }
    }

    // --- Plugins from installed_plugins.json ---
    const pluginsFile = join(home, '.claude', 'plugins', 'installed_plugins.json')
    if (existsSync(pluginsFile)) {
      try {
        const data = JSON.parse(readFileSync(pluginsFile, 'utf-8'))
        if (data.plugins) {
          for (const key of Object.keys(data.plugins as Record<string, unknown>)) {
            const name = key.split('@')[0]
            const marketplace = key.includes('@') ? key.split('@').slice(1).join('@') : 'unknown'
            const enabled = enabledPlugins[key] ?? false

            // Check if plugin has its own MCP server (.mcp.json in plugin dir)
            let hasMcp = false
            let mcpName: string | undefined
            let mcpType: string | undefined
            const entries = (data.plugins as Record<string, Array<{ installPath: string }>>)[key]
            if (entries?.[0]?.installPath) {
              const pluginMcpFile = join(entries[0].installPath, '.mcp.json')
              if (existsSync(pluginMcpFile)) {
                try {
                  const raw = JSON.parse(readFileSync(pluginMcpFile, 'utf-8')) as Record<string, Record<string, unknown>>
                  const mcpData = raw.mcpServers ?? raw
                  const mcpKeys = Object.keys(mcpData).filter(k => k !== 'mcpServers')
                  if (mcpKeys.length > 0) {
                    hasMcp = true
                    mcpName = mcpKeys[0]
                    const cfg = mcpData[mcpKeys[0]] as Record<string, unknown>
                    mcpType = cfg.url ? 'url' : cfg.type === 'sse' ? 'sse' : 'command'
                  }
                } catch {}
              }
            }

            plugins.push({ name, enabled, hasMcp, mcpName, mcpType, marketplace })
          }
        }
      } catch {}
    }

    return { mcps, plugins }
  }

  private parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
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

  getSkillDir(scope: 'global' | 'account' | 'project', scopeRef: string, name: string): string {
    const home = process.env.HOME ?? ''
    if (scope === 'global') {
      return join(home, '.claude', 'skills', name)
    }
    if (scope === 'account') {
      return join(this.cwDir, 'accounts', scopeRef, 'skills', name)
    }
    // project
    const projects = this.getProjects()
    const projPath = projects[scopeRef]?.path ?? scopeRef
    return join(projPath, '.claude', 'skills', name)
  }

  getSkills(account?: string, project?: string): SkillEntry[] {
    const home = process.env.HOME ?? ''
    const results: SkillEntry[] = []

    const scanDir = (dir: string, scope: SkillEntry['scope'], scopeRef: string) => {
      if (!existsSync(dir)) return
      const entries = readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        // Skip symlinks that are account skills symlinked by CW
        const fullPath = join(dir, entry.name)
        try {
          const stat = lstatSync(fullPath)
          if (stat.isSymbolicLink() && entry.name.startsWith('acct--')) continue
        } catch {
          continue
        }
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
    }

    scanDir(join(home, '.claude', 'skills'), 'global', 'global')

    if (account) {
      scanDir(join(this.cwDir, 'accounts', account, 'skills'), 'account', account)
    }

    if (project) {
      const projects = this.getProjects()
      const projPath = projects[project]?.path ?? project
      scanDir(join(projPath, '.claude', 'skills'), 'project', project)
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
