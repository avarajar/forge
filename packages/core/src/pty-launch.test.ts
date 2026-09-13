import { describe, it, expect, afterEach } from 'vitest'
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
})
