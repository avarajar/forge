import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { CWProject, CWSession, StackDetection } from './cw-types.js'

export class CWReader {
  private cwDir: string

  constructor(cwDir?: string) {
    this.cwDir = cwDir ?? join(process.env.HOME ?? '', '.cw')
  }

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
      return JSON.parse(readFileSync(path, 'utf-8'))
    } catch {
      return null
    }
  }

  getNotes(project: string, sessionDir: string): string {
    const sessionPath = join(this.cwDir, 'sessions', project, sessionDir, 'session.json')
    if (!existsSync(sessionPath)) return ''
    try {
      const session = JSON.parse(readFileSync(sessionPath, 'utf-8')) as CWSession
      if (existsSync(session.notes)) return readFileSync(session.notes, 'utf-8')
    } catch {}
    // Try TASK_NOTES.md or REVIEW_NOTES.md directly
    for (const name of ['TASK_NOTES.md', 'REVIEW_NOTES.md']) {
      const p = join(this.cwDir, 'sessions', project, sessionDir, name)
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

  getMCPs(): { global: Record<string, unknown>; cw: string[]; plugins: string[] } {
    const result: { global: Record<string, unknown>; cw: string[]; plugins: string[] } = { global: {}, cw: [], plugins: [] }
    const home = process.env.HOME ?? ''

    // Global Claude MCP servers from ~/.claude/settings.json
    const claudeSettings = join(home, '.claude', 'settings.json')
    if (existsSync(claudeSettings)) {
      try {
        const data = JSON.parse(readFileSync(claudeSettings, 'utf-8'))
        if (data.mcpServers) result.global = data.mcpServers
      } catch {}
    }

    // Claude plugins from ~/.claude/plugins/installed_plugins.json
    const pluginsFile = join(home, '.claude', 'plugins', 'installed_plugins.json')
    if (existsSync(pluginsFile)) {
      try {
        const data = JSON.parse(readFileSync(pluginsFile, 'utf-8'))
        if (data.plugins) {
          result.plugins = Object.keys(data.plugins).map(k => k.split('@')[0])
        }
      } catch {}
    }

    // CW managed MCPs from ~/.cw/mcps/
    const mcpsDir = join(this.cwDir, 'mcps')
    if (existsSync(mcpsDir)) {
      const files = readdirSync(mcpsDir).filter(f => f.endsWith('.json'))
      result.cw = files.map(f => f.replace('.json', ''))
    }

    return result
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
