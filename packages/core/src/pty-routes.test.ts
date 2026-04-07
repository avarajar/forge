import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { PTYManager } from './pty-manager.js'
import { CWReader } from './cw-reader.js'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const TEST_CW = join(import.meta.dirname, '../.test-pty-routes')

let manager: PTYManager

beforeAll(() => {
  mkdirSync(join(TEST_CW, 'sessions/testproj/task-mytask'), { recursive: true })
  writeFileSync(join(TEST_CW, 'projects.json'), JSON.stringify({
    testproj: { path: '/tmp/testproj', account: 'default', type: 'fullstack', registered: '2026-01-01T00:00:00Z' }
  }))
  writeFileSync(join(TEST_CW, 'sessions/testproj/task-mytask/session.json'), JSON.stringify({
    project: 'testproj', task: 'mytask', type: 'task', account: 'default',
    worktree: '/tmp/testproj/.tasks/mytask', notes: '',
    status: 'active', created: '2026-04-01T10:00:00Z', last_opened: '2026-04-02T15:00:00Z', opens: 2
  }))
  manager = new PTYManager()
})

afterAll(() => {
  manager.dispose()
  rmSync(TEST_CW, { recursive: true, force: true })
})

describe('PTY Routes', () => {
  it('PTYManager creates session for valid CW session', () => {
    const reader = new CWReader(TEST_CW)
    const session = reader.getSession('testproj', 'task-mytask')
    expect(session).not.toBeNull()

    const ptySession = manager.getOrCreate('testproj', 'task-mytask', session!)
    expect(ptySession).toBeDefined()
    expect(ptySession.command).toContain('cw work testproj mytask')
  })

  it('general session with skipPermissions passes flag directly to claude', () => {
    const sessionId = '__general::general-test'
    if (manager.has(sessionId)) manager.kill(sessionId)

    const session = {
      project: '__general', type: 'general' as const, account: 'default',
      workflow: '', worktree: '', notes: '', status: 'active' as const,
      created: '', last_opened: '', opens: 0, skipPermissions: true,
    }
    const ptySession = manager.getOrCreate('__general', 'general-test', session)
    expect(ptySession).toBeDefined()
    expect(ptySession.command).toContain('--dangerously-skip-permissions')
    expect(ptySession.command).not.toContain('--skip-permissions')
    manager.kill(sessionId)
  })

  it('PTYManager returns undefined for missing session ID', () => {
    expect(manager.get('nonexistent::session')).toBeUndefined()
  })

  it('attach sends scrollback to new client', () => {
    const reader = new CWReader(TEST_CW)
    const session = reader.getSession('testproj', 'task-mytask')!
    const ptySession = manager.getOrCreate('testproj', 'task-mytask', session)

    // Simulate some scrollback data
    ptySession.scrollback.push('line1\r\n', 'line2\r\n')

    const sent: string[] = []
    const fakeClient = {
      send: (data: string) => { sent.push(data) },
      close: () => {}
    }

    manager.attach('testproj::task-mytask', fakeClient)

    expect(sent.length).toBe(1)
    const parsed = JSON.parse(sent[0])
    expect(parsed.type).toBe('scrollback')
    expect(parsed.data).toContain('line1')
    expect(parsed.data).toContain('line2')
  })
})

describe('PTY Routes — integration', () => {
  it('getOrCreate + attach + detach lifecycle', () => {
    const reader = new CWReader(TEST_CW)
    const session = reader.getSession('testproj', 'task-mytask')!
    const sessionId = 'testproj::task-mytask'

    // Ensure clean state
    if (manager.has(sessionId)) manager.kill(sessionId)

    // Create
    const ptySession = manager.getOrCreate('testproj', 'task-mytask', session)
    expect(ptySession.clients.size).toBe(0)

    // Attach two clients
    const client1 = { send: vi.fn(), close: vi.fn() }
    const client2 = { send: vi.fn(), close: vi.fn() }
    manager.attach(sessionId, client1)
    manager.attach(sessionId, client2)
    expect(ptySession.clients.size).toBe(2)

    // Detach one — PTY stays
    manager.detach(sessionId, client1)
    expect(ptySession.clients.size).toBe(1)
    expect(manager.has(sessionId)).toBe(true)

    // Detach last — PTY still stays (just marks lastClientDisconnect)
    manager.detach(sessionId, client2)
    expect(ptySession.clients.size).toBe(0)
    expect(manager.has(sessionId)).toBe(true)
    expect(ptySession.lastClientDisconnect).not.toBeNull()
  })

  it('reconnects to running PTY without session metadata', () => {
    const reader = new CWReader(TEST_CW)
    const session = reader.getSession('testproj', 'task-mytask')!
    const sessionId = 'testproj::task-mytask'

    // Ensure clean state and create a PTY
    if (manager.has(sessionId)) manager.kill(sessionId)
    manager.getOrCreate('testproj', 'task-mytask', session)

    // Attach first client, then detach (simulating initial connect + disconnect)
    const client1 = { send: vi.fn(), close: vi.fn() }
    manager.attach(sessionId, client1)
    manager.detach(sessionId, client1)

    // PTY should still be running with 0 clients
    expect(manager.has(sessionId)).toBe(true)
    expect(manager.get(sessionId)!.clients.size).toBe(0)

    // Second client connects — should be able to reattach via manager.get()
    // even if pendingSessions and reader.getSession both miss
    const existingPty = manager.get(sessionId)
    expect(existingPty).toBeDefined()

    const client2 = { send: vi.fn(), close: vi.fn() }
    manager.attach(sessionId, client2)
    expect(existingPty!.clients.size).toBe(1)
  })

  it('kill removes session completely', () => {
    const reader = new CWReader(TEST_CW)
    const session = reader.getSession('testproj', 'task-mytask')!
    const sessionId = 'testproj::task-mytask'

    if (!manager.has(sessionId)) {
      manager.getOrCreate('testproj', 'task-mytask', session)
    }

    manager.kill(sessionId)
    expect(manager.has(sessionId)).toBe(false)
  })
})
