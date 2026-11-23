import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

  it('keeps the disabled MCPs on the session and in forge.json, which a resume reads back', async () => {
    const r = await prepareStart({ type: 'work', project: 'proj', task: 'mcp-off', disabledMcps: ['mcp__linear', 'mcp__linear', 'mcp__bitwarden'] }, { reader })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.session.disabledMcps).toEqual(['mcp__linear', 'mcp__bitwarden'])
    const dir = join(TEST_CW, 'sessions/proj/task-mcp-off')
    expect(JSON.parse(readFileSync(join(dir, 'forge.json'), 'utf-8'))).toEqual({ disabledMcps: ['mcp__linear', 'mcp__bitwarden'] })
    writeFileSync(join(dir, 'session.json'), JSON.stringify({ project: 'proj', task: 'mcp-off', type: 'task', account: 'default', worktree: '', notes: '', status: 'done', created: '', last_opened: '', opens: 1 }))
    expect(reader.getSession('proj', 'task-mcp-off')?.disabledMcps).toEqual(['mcp__linear', 'mcp__bitwarden'])
    expect(reader.getSpaces('proj').find(x => x.sessionDir === 'task-mcp-off')?.disabledMcps).toEqual(['mcp__linear', 'mcp__bitwarden'])
  })

  it('a new start without disabled MCPs removes the previous choice', async () => {
    const dir = join(TEST_CW, 'sessions/proj/task-mcp-reset')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'forge.json'), JSON.stringify({ disabledMcps: ['mcp__linear'] }))
    const r = await prepareStart({ type: 'work', project: 'proj', task: 'mcp-reset' }, { reader })
    expect(r.ok && r.session.disabledMcps).toBeUndefined()
    expect(existsSync(join(dir, 'forge.json'))).toBe(false)
  })

  it('answers 400 for anything but MCP tool prefixes', async () => {
    for (const disabledMcps of [['Bash'], ['mcp__a b'], 'mcp__x', Array.from({ length: 65 }, (_, i) => `mcp__s${i}`)]) {
      const r = await prepareStart({ type: 'work', project: 'proj', task: 'bad', disabledMcps: disabledMcps as string[] }, { reader })
      expect(r).toMatchObject({ ok: false, status: 400 })
    }
  })

  it('keeps no disabled MCPs for another harness', async () => {
    const r = await prepareStart({ type: 'general', account: 'default', harness: 'codex', disabledMcps: ['mcp__linear'] }, { reader })
    expect(r.ok && r.session.disabledMcps).toBeUndefined()
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
