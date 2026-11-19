import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { CWReader } from './cw-reader.js'
import { prepareStart, launchHeadless, pendingSessions } from './cw-start.js'
import { GeneralSessions } from './general-sessions.js'
import type { PTYManager } from './pty-manager.js'
import type { CWSession } from './cw-types.js'

const TEST_CW = join(import.meta.dirname, '../.test-cw-start')

describe('prepareStart', () => {
  let reader: CWReader

  beforeAll(() => {
    mkdirSync(join(TEST_CW, 'sessions'), { recursive: true })
    reader = new CWReader(TEST_CW)
  })

  afterEach(() => pendingSessions.clear())

  afterAll(() => rmSync(TEST_CW, { recursive: true, force: true }))

  it('with a Linear URL returns session task ABC-123 and source linear', async () => {
    const r = await prepareStart(
      { type: 'work', project: 'proj', task: 'https://linear.app/team/issue/ABC-123/some-title' },
      { reader },
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.session.task).toBe('ABC-123')
    expect(r.session.source).toBe('linear')
    expect(pendingSessions.has('proj::task-ABC-123')).toBe(true)
  })

  it('without project answers 400', async () => {
    const r = await prepareStart({ type: 'work', task: 'x' }, { reader })
    expect(r).toMatchObject({ ok: false, status: 400 })
  })
})

describe('launchHeadless', () => {
  afterEach(() => pendingSessions.clear())

  it('launchHeadless takes a pending session and spawns it headless', () => {
    const session = { project: 'proj', type: 'work', sessionDir: 'task-X' } as CWSession
    pendingSessions.set('proj::task-X', session)
    const getOrCreate = vi.fn().mockReturnValue({ id: 'pty' })
    const manager = { getOrCreate } as unknown as PTYManager
    const reader = { getSession: () => null } as unknown as CWReader

    const result = launchHeadless('proj', 'task-X', { reader, manager, general: new GeneralSessions() })

    expect(result).toEqual({ id: 'pty' })
    expect(getOrCreate).toHaveBeenCalledWith('proj', 'task-X', session, { isNew: true, headless: true })
    expect(pendingSessions.has('proj::task-X')).toBe(false)
  })
})
