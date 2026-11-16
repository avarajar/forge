import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
  let generalSession: ReturnType<typeof session> | undefined
  const general = { remember: vi.fn(), get: () => generalSession, forget: vi.fn() } as unknown as GeneralSessions

  beforeEach(() => {
    pendingSessions.clear()
    live = false
    generalSession = undefined
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
    manager = { typeLine, getOrCreate, has: () => live } as unknown as PTYManager
    states = { get: () => (state ? { state } : undefined) } as unknown as StateTracker
  })

  const make = (waitMs?: number) => createCwDeps({ reader, manager, states, general, waitMs })

  it('send types into a live claude session', async () => {
    live = true
    state = 'waiting'
    expect(await make().send('p', 's', 'hi')).toBe('typed')
    expect(typeLine).toHaveBeenCalledWith('p', 's', 'hi')
  })

  it('send to a codex session is unsupported', async () => {
    stored = session('codex')
    expect(await make().send('p', 's', 'hi')).toBe('unsupported')
    expect(typeLine).not.toHaveBeenCalled()
  })

  it('send to a live general codex session is unsupported', async () => {
    stored = null
    live = true
    state = 'waiting'
    generalSession = session('codex')
    expect(await make().send('p', 's', 'hi')).toBe('unsupported')
    expect(typeLine).not.toHaveBeenCalled()
  })

  it('send to a live session at a permission prompt waits and gives up without typing', async () => {
    vi.useFakeTimers()
    try {
      live = true
      state = 'permission'
      const promise = make(1200).send('p', 's', 'hi')
      const assertion = expect(promise).rejects.toMatchObject({ code: 'unreachable' })
      await vi.advanceTimersByTimeAsync(3000)
      await assertion
      expect(typeLine).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('send without a session file is unavailable', async () => {
    stored = null
    expect(await make().send('p', 's', 'hi')).toBe('unavailable')
  })

  it('send resumes a dead session and types once it waits', async () => {
    vi.useFakeTimers()
    try {
      getOrCreate.mockImplementation(() => { typeLine.mockReturnValue(true); return {} })
      const promise = make().send('p', 's', 'hi')
      await vi.advanceTimersByTimeAsync(500)
      expect(typeLine).not.toHaveBeenCalled()
      state = 'waiting'
      await vi.advanceTimersByTimeAsync(500)
      expect(await promise).toBe('resumed')
      expect(getOrCreate).toHaveBeenCalledWith('p', 's', stored, { isNew: false, headless: true })
      expect(typeLine).toHaveBeenCalledTimes(1)
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
      expect(typeLine).not.toHaveBeenCalled()
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

  it('send to a general session with no harness types into it as claude', async () => {
    stored = null
    live = true
    state = 'waiting'
    generalSession = { ...session('claude'), harness: undefined as unknown as string }
    expect(await make().send('p', 's', 'hi')).toBe('typed')
    expect(typeLine).toHaveBeenCalledWith('p', 's', 'hi')
  })

  describe('with a real cw home', () => {
    let cwHome: string
    beforeEach(() => {
      cwHome = mkdtempSync(join(tmpdir(), 'forge-module-cw-'))
      ;(reader as unknown as { cwHome: string }).cwHome = cwHome
    })
    afterEach(() => rmSync(cwHome, { recursive: true, force: true }))

    it('start work takes a request: slug task, multi-line description with a link in the notes', async () => {
      const result = await make().start({ type: 'work', project: 'p', task: 'fix-the-login-bug', description: 'The login fails\n\nFrom ana in #dev: https://x.test/a/b' })
      expect(result).toEqual({ project: 'p', sessionDir: 'task-fix-the-login-bug' })
      const notes = readFileSync(join(cwHome, 'sessions', 'p', 'task-fix-the-login-bug', 'TASK_NOTES.md'), 'utf-8')
      expect(notes).toContain('## Description\nThe login fails\n\nFrom ana in #dev: https://x.test/a/b\n')
      expect(getOrCreate).toHaveBeenCalledWith('p', 'task-fix-the-login-bug', expect.objectContaining({ type: 'task', task: 'fix-the-login-bug' }), { isNew: true, headless: true })
    })
  })

  it('start general with a prompt waits for the prompt and types it on one line', async () => {
    vi.useFakeTimers()
    try {
      live = true
      let key = ''
      states = { get: () => (state ? { state } : undefined) } as unknown as StateTracker
      getOrCreate.mockImplementation((_p: string, dir: string) => { key = `p::${dir}`; return {} })
      const promise = make().start({ type: 'general', project: 'p', task: 'research', prompt: 'Find out why\nthe build \x1b[31mfails\r\n  today' })
      await vi.advanceTimersByTimeAsync(1000)
      expect(typeLine).not.toHaveBeenCalled()
      state = 'waiting'
      await vi.advanceTimersByTimeAsync(500)
      const result = await promise
      expect(typeLine).toHaveBeenCalledTimes(1)
      expect(typeLine).toHaveBeenCalledWith('p', result.sessionDir, 'Find out why the build [31mfails today')
      expect(getOrCreate).toHaveBeenCalledWith('p', result.sessionDir, expect.objectContaining({ type: 'general', skipPermissions: false }), { isNew: true, headless: true })
    } finally {
      vi.useRealTimers()
    }
  })

  it('start general without a prompt types nothing', async () => {
    await make().start({ type: 'general', project: 'p', task: 'look around' })
    expect(typeLine).not.toHaveBeenCalled()
  })

  it('start turns a refused start into bad_request', async () => {
    await expect(make().start({ type: 'work', task: 'x' })).rejects.toMatchObject({ code: 'bad_request' })
  })
})
