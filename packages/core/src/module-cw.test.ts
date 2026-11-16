import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ModuleError } from '@forge-dev/sdk'
import { createCwDeps } from './module-cw.js'
import { pendingSessions } from './cw-start.js'
import type { CWReader } from './cw-reader.js'
import type { PTYManager } from './pty-manager.js'
import type { StateTracker } from './session-state.js'
import type { GeneralSessions } from './general-sessions.js'

const session = (harness: string) => ({ project: 'p', sessionDir: 's', type: 'task', harness, account: 'a', status: 'active' })

describe('createCwDeps', () => {
  let live: boolean
  let typeLine: ReturnType<typeof vi.fn>
  let getOrCreate: ReturnType<typeof vi.fn>
  let stored: ReturnType<typeof session> | null
  let state: string | undefined
  let reader: CWReader
  let manager: PTYManager
  let states: StateTracker
  const general = { remember: vi.fn(), get: vi.fn(), forget: vi.fn() } as unknown as GeneralSessions

  beforeEach(() => {
    pendingSessions.clear()
    live = false
    state = undefined
    stored = session('claude')
    typeLine = vi.fn(() => live)
    getOrCreate = vi.fn(() => ({}))
    reader = {
      getSession: () => stored,
      getAccounts: () => ['mono'],
      getProjects: () => ({ p: { path: '/tmp/p', account: 'mono' } }),
      cwHome: '/tmp/cw',
    } as unknown as CWReader
    manager = { typeLine, getOrCreate } as unknown as PTYManager
    states = { snapshot: () => (state ? { 'p::s': { state } } : {}) } as unknown as StateTracker
  })

  const make = (waitMs?: number) => createCwDeps({ reader, manager, states, general, waitMs })

  it('send types into a live claude session', async () => {
    live = true
    expect(await make().send('p', 's', 'hi')).toBe('typed')
    expect(typeLine).toHaveBeenCalledWith('p', 's', 'hi')
  })

  it('send to a codex session is unsupported', async () => {
    stored = session('codex')
    expect(await make().send('p', 's', 'hi')).toBe('unsupported')
    expect(typeLine).not.toHaveBeenCalled()
  })

  it('send without a session file is unavailable', async () => {
    stored = null
    expect(await make().send('p', 's', 'hi')).toBe('unavailable')
  })

  it('send resumes a dead session and types once it waits', async () => {
    vi.useFakeTimers()
    try {
      getOrCreate.mockImplementation(() => { live = true; return {} })
      const promise = make().send('p', 's', 'hi')
      await vi.advanceTimersByTimeAsync(500)
      expect(typeLine).toHaveBeenCalledTimes(1)
      state = 'waiting'
      await vi.advanceTimersByTimeAsync(500)
      expect(await promise).toBe('resumed')
      expect(getOrCreate).toHaveBeenCalledWith('p', 's', stored, { isNew: false, headless: true })
      expect(typeLine).toHaveBeenCalledTimes(2)
      expect(typeLine).toHaveBeenLastCalledWith('p', 's', 'hi')
    } finally {
      vi.useRealTimers()
    }
  })

  it('send resumes and gives up when the session never waits', async () => {
    vi.useFakeTimers()
    try {
      const promise = make(50).send('p', 's', 'hi')
      const assertion = expect(promise).rejects.toMatchObject({ name: 'ModuleError', code: 'unreachable' })
      await vi.advanceTimersByTimeAsync(1000)
      await assertion
      await expect(promise).rejects.toBeInstanceOf(ModuleError)
      expect(typeLine).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('start general runs prepareStart then launchHeadless', async () => {
    getOrCreate.mockReturnValue({})
    const result = await make().start({ type: 'general', project: 'p', task: 'look around' })
    expect(result.project).toBe('p')
    expect(result.sessionDir).toMatch(/^general-mono-/)
    expect(getOrCreate).toHaveBeenCalledWith('p', result.sessionDir, expect.objectContaining({ type: 'general', task: 'look around' }), { isNew: true, headless: true })
  })

  it('start turns a refused start into bad_request', async () => {
    await expect(make().start({ type: 'work', task: 'x' })).rejects.toMatchObject({ code: 'bad_request' })
  })
})
