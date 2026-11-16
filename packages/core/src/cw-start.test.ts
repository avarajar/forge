import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { CWReader } from './cw-reader.js'
import { prepareStart, pendingSessions } from './cw-start.js'

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
    expect(r.key).toBe('proj::task-ABC-123')
    expect(pendingSessions.has(r.key)).toBe(true)
  })

  it('without project answers 400', async () => {
    const r = await prepareStart({ type: 'work', task: 'x' }, { reader })
    expect(r).toMatchObject({ ok: false, status: 400 })
  })
})
