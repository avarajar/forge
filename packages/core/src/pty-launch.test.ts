import { describe, it, expect, afterEach } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildLaunch } from './pty-manager.js'
import type { CWSession } from './cw-types.js'

const session = (overrides: Partial<CWSession>): CWSession => ({
  project: 'app', task: 'fix', type: 'task', account: 'work', worktree: '', notes: '',
  status: 'active', created: '', last_opened: '', opens: 0, ...overrides,
})

describe('buildLaunch', () => {
  const previous = process.env.CW_HARNESS
  afterEach(() => {
    if (previous === undefined) delete process.env.CW_HARNESS
    else process.env.CW_HARNESS = previous
  })

  it('adds --harness to a new task', () => {
    expect(buildLaunch(session({ harness: 'codex' }), true).command)
      .toBe("cw work 'app' 'fix' --account 'work' --harness 'codex'")
  })

  it('never adds --harness when resuming', () => {
    expect(buildLaunch(session({ harness: 'codex' }), false).command).not.toContain('--harness')
  })

  it('adds nothing when no harness was chosen', () => {
    expect(buildLaunch(session({}), true).command).toBe("cw work 'app' 'fix' --account 'work'")
  })

  it('adds --harness to a new review', () => {
    expect(buildLaunch(session({ type: 'review', task: undefined, pr: '42', harness: 'codex' }), true).command)
      .toBe("cw review 'app' '42' --account 'work' --harness 'codex'")
  })

  it('adds --harness to a new loop', () => {
    const loop = session({ type: 'loop', task: 'watch', sessionDir: 'loop-watch', loop_prompt: 'run tests', harness: 'claude' })
    expect(buildLaunch(loop, true).command).toBe("cw loop 'app' 'run tests' --name 'watch' --account 'work' --harness 'claude'")
  })

  it('passes --team to create only when the harness has agent teams', () => {
    const create = { type: 'create' as const, project: '__creating', task: 'saas', notes: 'A SaaS' }
    expect(buildLaunch(session({ ...create, harness: 'claude' }), true).command).toContain('--team')
    const codex = buildLaunch(session({ ...create, harness: 'codex' }), true).command
    expect(codex).not.toContain('--team')
    expect(codex).toContain("--harness 'codex'")
  })

  it('launches General on codex through CW_HARNESS without Claude-only flags', () => {
    const launch = buildLaunch(session({ type: 'general', harness: 'codex', model: 'gpt-5-codex', skipPermissions: true }), true)
    expect(launch.command).toBe("cw launch 'work'")
    expect(launch.env.CW_HARNESS).toBe('codex')
  })

  it('keeps Claude flags for General on claude', () => {
    const launch = buildLaunch(session({ type: 'general', harness: 'claude', model: 'opus', skipPermissions: true }), true)
    expect(launch.command).toBe("cw launch 'work' --model 'opus' --dangerously-skip-permissions")
    expect(launch.env.CW_HARNESS).toBe('claude')
  })

  it('drops an inherited CW_HARNESS from every launch', () => {
    process.env.CW_HARNESS = 'pi'
    expect(buildLaunch(session({}), false).env.CW_HARNESS).toBeUndefined()
    expect(buildLaunch(session({ type: 'general' }), true).env.CW_HARNESS).toBeUndefined()
  })

  it('builds the account login command', () => {
    const login = session({ type: 'login', project: '__accounts', task: undefined, harness: 'opencode' })
    expect(buildLaunch(login, true).command).toBe("cw account login 'work' --harness 'opencode'")
  })

  describe('Claude Code hooks', () => {
    const hook = { key: 'app::fix', token: 't0k', settingsPath: '/home/me/.forge/hooks/claude-3000.json', skipPermissionsDefault: false }
    const saved = { flags: process.env.CW_CLAUDE_FLAGS, token: process.env.FORGE_HOOK_TOKEN }
    afterEach(() => {
      if (saved.flags === undefined) delete process.env.CW_CLAUDE_FLAGS
      else process.env.CW_CLAUDE_FLAGS = saved.flags
      if (saved.token === undefined) delete process.env.FORGE_HOOK_TOKEN
      else process.env.FORGE_HOOK_TOKEN = saved.token
    })

    it('loads the hook settings and the session token into a claude task', () => {
      delete process.env.CW_CLAUDE_FLAGS
      const launch = buildLaunch(session({}), false, hook)
      expect(launch.command).toBe("cw work 'app' 'fix' --account 'work'")
      expect(launch.env.CW_CLAUDE_FLAGS).toBe('--settings /home/me/.forge/hooks/claude-3000.json')
      expect(launch.env.FORGE_HOOK_TOKEN).toBe('t0k')
      expect(launch.env.FORGE_HOOK_SESSION).toBe('app%3A%3Afix')
    })

    it('encodes the session key, since project names can have any letter', () => {
      expect(buildLaunch(session({}), false, { ...hook, key: 'diseño::fix' }).env.FORGE_HOOK_SESSION).toBe('dise%C3%B1o%3A%3Afix')
    })

    it('never passes Forge secrets to an agent', () => {
      const saved = { a: process.env.FORGE_AUTH_TOKEN, d: process.env.FORGE_DB_URL, t: process.env.TYPESAFE_API_KEY }
      process.env.FORGE_AUTH_TOKEN = 'global-secret-0123456789'
      process.env.FORGE_DB_URL = 'postgres://u:p@h/db'
      process.env.TYPESAFE_API_KEY = 'ts-key'
      try {
        for (const launch of [buildLaunch(session({}), false, hook), buildLaunch(session({ harness: 'codex' }), true), buildLaunch(session({ type: 'general' }), true)]) {
          expect(launch.env.FORGE_AUTH_TOKEN).toBeUndefined()
          expect(launch.env.FORGE_DB_URL).toBeUndefined()
          expect(launch.env.TYPESAFE_API_KEY).toBeUndefined()
        }
      } finally {
        for (const [k, v] of [['FORGE_AUTH_TOKEN', saved.a], ['FORGE_DB_URL', saved.d], ['TYPESAFE_API_KEY', saved.t]] as const) {
          if (v === undefined) delete process.env[k]
          else process.env[k] = v
        }
      }
    })

    it('keeps CW_CLAUDE_FLAGS the user set and appends the settings', () => {
      process.env.CW_CLAUDE_FLAGS = '--verbose'
      expect(buildLaunch(session({}), false, hook).env.CW_CLAUDE_FLAGS).toBe('--verbose --settings /home/me/.forge/hooks/claude-3000.json')
    })

    it('keeps config.yaml skip_permissions, which CW reads only while CW_CLAUDE_FLAGS is empty', () => {
      delete process.env.CW_CLAUDE_FLAGS
      const launch = buildLaunch(session({ type: 'review', task: undefined, pr: '42' }), false, { ...hook, skipPermissionsDefault: true })
      expect(launch.env.CW_CLAUDE_FLAGS).toBe('--dangerously-skip-permissions --settings /home/me/.forge/hooks/claude-3000.json')
    })

    it('leaves the skip flag to CW when the launch already asks for it', () => {
      delete process.env.CW_CLAUDE_FLAGS
      const launch = buildLaunch(session({ skipPermissions: true }), false, { ...hook, skipPermissionsDefault: true })
      expect(launch.command.startsWith('cw --skip-permissions work')).toBe(true)
      expect(launch.env.CW_CLAUDE_FLAGS).toBe('--settings /home/me/.forge/hooks/claude-3000.json')
    })

    it('adds --settings to the command line of a General session', () => {
      const launch = buildLaunch(session({ type: 'general', harness: 'claude', model: 'opus' }), true, hook)
      expect(launch.command).toBe("cw launch 'work' --model 'opus' --settings '/home/me/.forge/hooks/claude-3000.json'")
      expect(launch.env.FORGE_HOOK_TOKEN).toBe('t0k')
    })

    it('gives other harnesses and logins neither settings nor token', () => {
      delete process.env.CW_CLAUDE_FLAGS
      for (const s of [session({ harness: 'codex' }), session({ type: 'login', project: '__accounts', task: undefined, harness: 'claude' })]) {
        const launch = buildLaunch(s, true, hook)
        expect(launch.env.CW_CLAUDE_FLAGS).toBeUndefined()
        expect(launch.env.FORGE_HOOK_TOKEN).toBeUndefined()
        expect(launch.command).not.toContain('--settings')
      }
    })

    it('drops hook settings and a token inherited from a Forge session', () => {
      process.env.CW_CLAUDE_FLAGS = '--dangerously-skip-permissions --settings /home/me/.forge/hooks/claude-3000.json'
      process.env.FORGE_HOOK_TOKEN = 'parent'
      const plain = buildLaunch(session({ harness: 'codex' }), true)
      expect(plain.env.CW_CLAUDE_FLAGS).toBe('--dangerously-skip-permissions')
      expect(plain.env.FORGE_HOOK_TOKEN).toBeUndefined()
      expect(buildLaunch(session({}), false, { ...hook, settingsPath: '/x/claude-4000.json' }).env.CW_CLAUDE_FLAGS)
        .toBe('--dangerously-skip-permissions --settings /x/claude-4000.json')
    })
  })
})

describe('disabled MCPs', () => {
  const hook = { key: 'app::fix', token: 't0k', settingsPath: '/home/me/.forge/hooks/claude-3000.json', skipPermissionsDefault: false }
  const saved = process.env.CW_CLAUDE_FLAGS
  const CW_HOME = join(import.meta.dirname, '../.test-disabled-mcps')
  afterEach(() => {
    if (saved === undefined) delete process.env.CW_CLAUDE_FLAGS
    else process.env.CW_CLAUDE_FLAGS = saved
    rmSync(CW_HOME, { recursive: true, force: true })
  })

  it('takes their tools away in one = token, after the hook settings', () => {
    delete process.env.CW_CLAUDE_FLAGS
    const launch = buildLaunch(session({ disabledMcps: ['mcp__bitwarden', 'mcp__plugin_playwright_playwright'] }), false, hook)
    expect(launch.env.CW_CLAUDE_FLAGS).toBe('--settings /home/me/.forge/hooks/claude-3000.json --disallowedTools=mcp__bitwarden,mcp__plugin_playwright_playwright')
  })

  it('works without hooks and keeps config.yaml skip_permissions', () => {
    delete process.env.CW_CLAUDE_FLAGS
    mkdirSync(CW_HOME, { recursive: true })
    writeFileSync(join(CW_HOME, 'config.yaml'), 'skip_permissions: true\n')
    const launch = buildLaunch(session({ disabledMcps: ['mcp__linear'] }), true, undefined, CW_HOME)
    expect(launch.env.CW_CLAUDE_FLAGS).toBe('--dangerously-skip-permissions --disallowedTools=mcp__linear')
    expect(launch.env.FORGE_HOOK_TOKEN).toBeUndefined()
  })

  it('leaves CW_CLAUDE_FLAGS alone without hooks or disabled MCPs', () => {
    delete process.env.CW_CLAUDE_FLAGS
    expect(buildLaunch(session({}), true).env.CW_CLAUDE_FLAGS).toBeUndefined()
  })

  it('adds the flag to the command line of a General session', () => {
    const launch = buildLaunch(session({ type: 'general', harness: 'claude', disabledMcps: ['mcp__linear'] }), true)
    expect(launch.command).toBe("cw launch 'work' '--disallowedTools=mcp__linear'")
  })

  it('drops prefixes that are not MCP tool prefixes and ignores other harnesses', () => {
    delete process.env.CW_CLAUDE_FLAGS
    expect(buildLaunch(session({ disabledMcps: ['Bash', 'mcp__a b'] }), true).env.CW_CLAUDE_FLAGS).toBeUndefined()
    expect(buildLaunch(session({ harness: 'codex', disabledMcps: ['mcp__linear'] }), true, hook).env.CW_CLAUDE_FLAGS).toBeUndefined()
  })
})
