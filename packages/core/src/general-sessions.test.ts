import { describe, it, expect, afterAll } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { GeneralSessions } from './general-sessions.js'
import type { CWSession } from './cw-types.js'

const dir = mkdtempSync(join(tmpdir(), 'forge-general-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const session = (created: string): CWSession => ({
  project: '__general', type: 'general', account: 'monoku', workflow: '', worktree: '/tmp', notes: '',
  status: 'active', created, last_opened: created, opens: 0, sessionDir: 'general-monoku-1',
})

describe('GeneralSessions', () => {
  it('survives a restart through its file', () => {
    const file = join(dir, 'kept.json')
    const s = session(new Date().toISOString())
    new GeneralSessions(file).remember('__general::general-monoku-1', s)
    expect(new GeneralSessions(file).get('__general::general-monoku-1')).toEqual(s)
  })

  it('forgets a closed session on disk too', () => {
    const file = join(dir, 'forgotten.json')
    const store = new GeneralSessions(file)
    store.remember('k', session(new Date().toISOString()))
    store.forget('k')
    expect(new GeneralSessions(file).get('k')).toBeUndefined()
  })

  it('drops sessions older than a week when loading', () => {
    const file = join(dir, 'old.json')
    writeFileSync(file, JSON.stringify({ old: session('2026-01-01T00:00:00Z'), fresh: session('2026-09-20T00:00:00Z') }))
    const store = new GeneralSessions(file, Date.parse('2026-09-23T00:00:00Z'))
    expect(store.get('old')).toBeUndefined()
    expect(store.get('fresh')).toBeDefined()
  })

  it('ignores an unreadable file', () => {
    const file = join(dir, 'broken.json')
    writeFileSync(file, '{')
    expect(new GeneralSessions(file).get('k')).toBeUndefined()
  })
})
