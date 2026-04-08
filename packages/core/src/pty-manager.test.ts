import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { PTYManager } from './pty-manager.js'
import type { CWSession } from './cw-types.js'

const makeSession = (overrides?: Partial<CWSession>): CWSession => ({
  project: 'testproj',
  task: 'fix-bug',
  type: 'task',
  account: 'default',
  worktree: '/tmp/testproj/.tasks/fix-bug',
  notes: '/tmp/notes.md',
  status: 'active',
  created: '2026-04-01T00:00:00Z',
  last_opened: '2026-04-02T00:00:00Z',
  opens: 1,
  ...overrides
})

describe('PTYManager', () => {
  let manager: PTYManager

  beforeEach(() => {
    manager = new PTYManager()
  })

  afterEach(() => {
    manager.dispose()
  })

  it('creates a new PTY session', () => {
    const session = makeSession()
    const ptySession = manager.getOrCreate('testproj', 'task-fix-bug', session)
    expect(ptySession).toBeDefined()
    expect(ptySession.pty).toBeDefined()
    expect(ptySession.clients.size).toBe(0)
  })

  it('returns existing PTY session on second call', () => {
    const session = makeSession()
    const first = manager.getOrCreate('testproj', 'task-fix-bug', session)
    const second = manager.getOrCreate('testproj', 'task-fix-bug', session)
    expect(first).toBe(second)
  })

  it('tracks attached clients', () => {
    const session = makeSession()
    const ptySession = manager.getOrCreate('testproj', 'task-fix-bug', session)
    const fakeWs = { send: vi.fn(), close: vi.fn() }

    manager.attach('testproj::task-fix-bug', fakeWs)
    expect(ptySession.clients.size).toBe(1)

    manager.detach('testproj::task-fix-bug', fakeWs)
    expect(ptySession.clients.size).toBe(0)
  })

  it('PTY stays alive after detach', () => {
    const session = makeSession()
    const ptySession = manager.getOrCreate('testproj', 'task-fix-bug', session)
    const fakeWs = { send: vi.fn(), close: vi.fn() }

    manager.attach('testproj::task-fix-bug', fakeWs)
    manager.detach('testproj::task-fix-bug', fakeWs)

    expect(manager.has('testproj::task-fix-bug')).toBe(true)
  })

  it('kill removes PTY from map', () => {
    const session = makeSession()
    manager.getOrCreate('testproj', 'task-fix-bug', session)
    manager.kill('testproj::task-fix-bug')
    expect(manager.has('testproj::task-fix-bug')).toBe(false)
  })

  it('stores scrollback data', () => {
    const session = makeSession()
    const ptySession = manager.getOrCreate('testproj', 'task-fix-bug', session)
    expect(Array.isArray(ptySession.scrollback)).toBe(true)
  })

  it('builds correct command for task sessions', () => {
    const session = makeSession({ project: 'myapp', task: 'fix-login', account: 'work', workflow: 'bugfix' })
    const ptySession = manager.getOrCreate('myapp', 'task-fix-login', session)
    expect(ptySession.command).toContain('cw work myapp fix-login')
    expect(ptySession.command).toContain('--account work')
    expect(ptySession.command).toContain('--workflow bugfix')
  })

  it('builds correct command for review sessions', () => {
    const session = makeSession({ type: 'review', pr: '42', task: undefined })
    const ptySession = manager.getOrCreate('testproj', 'review-pr-42', session)
    expect(ptySession.command).toContain('cw review testproj 42')
  })

  it('passes source_url to CW for Linear tasks so CW uses Linear branchName', () => {
    const url = 'https://linear.app/team/issue/ENG-123-fix-auth-bug'
    const session = makeSession({
      project: 'myapp',
      task: 'ENG-123',
      source: 'linear',
      source_url: url,
      account: 'work',
    })
    const ptySession = manager.getOrCreate('myapp', 'task-ENG-123', session)
    expect(ptySession.command).toContain(`cw work myapp ${url}`)
  })

  it('passes GitHub PR URL to CW so its init_prompt fetches the PR and uses the correct branch', () => {
    const url = 'https://github.com/org/repo/pull/42'
    const session = makeSession({
      project: 'myapp',
      task: '42',
      source: 'github',
      source_url: url,
      account: 'work',
    })
    const ptySession = manager.getOrCreate('myapp', 'task-42', session)
    expect(ptySession.command).toContain(`cw work myapp ${url}`)
  })

  it('uses pr number directly for review sessions (no source_url needed)', () => {
    const session = makeSession({
      type: 'review',
      task: undefined,
      pr: '42',
      source: 'github',
      source_url: 'https://github.com/org/repo/pull/42',
    })
    const ptySession = manager.getOrCreate('testproj', 'review-pr-42', session)
    expect(ptySession.command).toContain('cw review testproj 42')
    expect(ptySession.command).not.toContain('github.com')
  })

  it('builds correct command for create sessions', () => {
    const session = makeSession({
      type: 'create',
      project: '__creating',
      task: 'my-saas',
      notes: 'A SaaS for team collaboration',
      account: 'work',
      worktree: '',
    })
    const ptySession = manager.getOrCreate('__creating', 'create-my-saas-123', session)
    expect(ptySession.command).toContain('cw create')
    expect(ptySession.command).toContain('my-saas')
    expect(ptySession.command).toContain('A SaaS for team collaboration')
    expect(ptySession.command).toContain('--account work')
  })

  it('cleanup kills idle sessions', () => {
    vi.useFakeTimers()
    const session = makeSession()
    manager.getOrCreate('testproj', 'task-fix-bug', session)

    vi.advanceTimersByTime(31 * 60 * 1000)
    manager.cleanup()

    expect(manager.has('testproj::task-fix-bug')).toBe(false)
    vi.useRealTimers()
  })

  it('cleanup does NOT kill sessions with active clients', () => {
    vi.useFakeTimers()
    const session = makeSession()
    manager.getOrCreate('testproj', 'task-fix-bug', session)
    const fakeWs = { send: vi.fn(), close: vi.fn() }
    manager.attach('testproj::task-fix-bug', fakeWs)

    vi.advanceTimersByTime(31 * 60 * 1000)
    manager.cleanup()

    expect(manager.has('testproj::task-fix-bug')).toBe(true)
    vi.useRealTimers()
  })
})
