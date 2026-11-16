import { describe, it, expect, vi } from 'vitest'
import type { ForgeContext, SendResult } from '@forge-dev/sdk'
import { readNow, applyItem, acceptAll, localDate } from './run'
import type { Digest } from './digest'

const NOW = new Date(2026, 10, 15, 9, 0, 0)
const DATE = localDate(NOW)

function raw(over: Record<string, unknown>) {
  return { source: 'slack', kind: 'request', title: 'T', who: 'ana', where: '#dev', when: '2026-11-15T08:00:00Z', link: 'https://x.test/1', ...over }
}

function stub(opts: { reader?: () => Promise<{ text: string }>; send?: SendResult | Error; settings?: Record<string, unknown> } = {}) {
  const store = new Map<string, unknown>()
  const badge = vi.fn(async () => {})
  const start = vi.fn(async () => ({ project: 'forge', sessionDir: 'task-1' }))
  const send = vi.fn(async (..._a: unknown[]) => {
    if (opts.send instanceof Error) throw opts.send
    return opts.send ?? 'typed'
  })
  const run = vi.fn<(input: unknown) => Promise<{ text: string }>>(opts.reader ?? (async () => ({ text: '{"items":[]}' })))
  const ctx = {
    settings: { time: '08:00', autoResearch: true, maxAuto: 3, account: '', researchProject: '', model: 'sonnet', ...opts.settings },
    storage: {
      get: async (k: string) => store.get(k),
      set: async (k: string, v: unknown) => void store.set(k, JSON.parse(JSON.stringify(v))),
      delete: async (k: string) => void store.delete(k),
      list: async (p = '') => [...store.keys()].filter(k => k.startsWith(p)),
    },
    notify: { badge },
    agent: { run },
    cw: { start },
    sessions: { list: async () => [{ project: 'forge', sessionDir: 'task-0', type: 'work' }], send },
    projects: { list: async () => [{ name: 'forge', path: '/p/forge' }], dir: async (n: string) => (n === 'forge' ? '/p/forge' : null) },
    accounts: { list: async () => [{ name: 'codex-acc', harness: 'codex' }, { name: 'monoku', harness: 'claude' }] },
  } as unknown as ForgeContext
  return { ctx, store, badge, start, send, run }
}

const reply = (items: unknown[]) => async () => ({ text: JSON.stringify({ items }) })
const research = (n: number) => Array.from({ length: n }, (_, i) => raw({ kind: 'research', link: `https://x.test/r${i}`, title: `R${i}` }))
const digestOf = (s: ReturnType<typeof stub>) => s.store.get(`digest/${DATE}`) as Digest

describe('readNow', () => {
  it('saves the digest and the badge', async () => {
    const s = stub({ reader: reply([raw({}), raw({ link: 'https://x.test/2', kind: 'issue', issueKey: 'A-1' })]) })
    const d = await readNow(s.ctx, NOW)
    expect(d.items).toHaveLength(2)
    expect(digestOf(s).items).toHaveLength(2)
    expect(s.store.get('lastReadAt')).toBe(NOW.toISOString())
    expect(s.badge).toHaveBeenLastCalledWith('today', 2, 'to review')
    expect(s.run.mock.calls[0][0]).toMatchObject({ account: 'monoku', model: 'sonnet' })
  })

  it('keeps the previous digest with error and starts nothing on reader failure', async () => {
    const s = stub({ reader: reply([raw({})]) })
    await readNow(s.ctx, NOW)
    s.run.mockImplementation(async () => ({ text: 'sorry, no' }))
    const d = await readNow(s.ctx, new Date(2026, 10, 15, 10))
    expect(d.items).toHaveLength(1)
    expect(d.error).toMatch(/JSON/)
    expect(digestOf(s).error).toBeTruthy()
    expect(s.start).not.toHaveBeenCalled()
    expect(s.store.get('lastReadAt')).toBe(NOW.toISOString())
  })

  it('respects the daily auto research cap across runs', async () => {
    const s = stub({ reader: reply(research(5)) })
    await readNow(s.ctx, NOW)
    await readNow(s.ctx, new Date(2026, 10, 15, 12))
    expect(s.start).toHaveBeenCalledTimes(3)
    expect(digestOf(s).autoStarted).toBe(3)
    expect(digestOf(s).items.filter(i => i.state === 'done')).toHaveLength(3)
    expect(s.badge).toHaveBeenLastCalledWith('today', 2, 'to review')
  })

  it('starts nothing when autoResearch is off', async () => {
    const s = stub({ reader: reply(research(2)), settings: { autoResearch: false } })
    await readNow(s.ctx, NOW)
    expect(s.start).not.toHaveBeenCalled()
  })

  it('runs research in the home folder when no research project is set', async () => {
    const s = stub({ reader: reply(research(1)) })
    await readNow(s.ctx, NOW)
    expect(s.start).toHaveBeenCalledWith(expect.objectContaining({ type: 'general', directory: process.env.HOME }))
  })
})

describe('applyItem', () => {
  async function seeded(over: Record<string, unknown>, opts = {}) {
    const s = stub({ reader: reply([raw(over)]), settings: { autoResearch: false }, ...opts })
    const d = await readNow(s.ctx, NOW)
    return { s, id: d.items[0].id }
  }

  it('send to a codex session stays proposed', async () => {
    const { s, id } = await seeded({ kind: 'to-task', targetSession: { project: 'forge', sessionDir: 'task-0' } }, { send: 'unsupported' })
    const item = await applyItem(s.ctx, DATE, id, 'send')
    expect(item.state).toBe('proposed')
    expect(item.error).toMatch(/open the task/i)
    expect(s.send).toHaveBeenCalledWith('forge', 'task-0', expect.stringContaining('[Today] ana in #dev'))
  })

  it('send that throws stays proposed with the error', async () => {
    const { s, id } = await seeded({ kind: 'to-task', targetSession: { project: 'forge', sessionDir: 'task-0' } }, { send: new Error('never reached a prompt') })
    const item = await applyItem(s.ctx, DATE, id, 'send')
    expect(item.state).toBe('proposed')
    expect(item.error).toMatch(/never reached/)
  })

  it('send delivered marks done', async () => {
    const { s, id } = await seeded({ kind: 'to-task', targetSession: { project: 'forge', sessionDir: 'task-0' } })
    const item = await applyItem(s.ctx, DATE, id, 'send')
    expect(item.state).toBe('done')
    expect(s.badge).toHaveBeenLastCalledWith('today', 0, 'to review')
  })

  it('start without project is refused', async () => {
    const { s, id } = await seeded({ kind: 'request' })
    await expect(applyItem(s.ctx, DATE, id, 'start')).rejects.toMatchObject({ code: 'bad_request', message: 'pick a project' })
    expect(s.start).not.toHaveBeenCalled()
  })

  it('start with a picked project starts a work session and records it', async () => {
    const { s, id } = await seeded({ kind: 'request', title: 'Fix it', quote: 'q' })
    const item = await applyItem(s.ctx, DATE, id, 'start', 'forge')
    expect(item).toMatchObject({ state: 'done', project: 'forge', startedSession: { project: 'forge', sessionDir: 'task-1' } })
    expect(s.start).toHaveBeenCalledWith({ type: 'work', project: 'forge', task: 'Fix it\n\nFrom ana in #dev: https://x.test/1' })
  })

  it('start failure sets failed', async () => {
    const { s, id } = await seeded({ kind: 'issue', project: 'forge', issueKey: 'A-1', link: 'https://linear.app/x/issue/A-1' })
    s.start.mockRejectedValueOnce(new Error('refused'))
    const item = await applyItem(s.ctx, DATE, id, 'start')
    expect(item).toMatchObject({ state: 'failed', error: 'refused' })
    expect(s.start).toHaveBeenCalledWith({ type: 'work', project: 'forge', task: 'https://linear.app/x/issue/A-1' })
  })

  it('dismiss marks dismissed', async () => {
    const { s, id } = await seeded({})
    expect((await applyItem(s.ctx, DATE, id, 'dismiss')).state).toBe('dismissed')
  })
})

describe('acceptAll', () => {
  it('applies every proposed item that has what it needs and skips the rest', async () => {
    const s = stub({
      settings: { autoResearch: false },
      reader: reply([
        raw({ kind: 'to-task', link: 'https://x.test/a', targetSession: { project: 'forge', sessionDir: 'task-0' } }),
        raw({ kind: 'issue', link: 'https://x.test/b', project: 'forge', issueKey: 'A-1' }),
        raw({ kind: 'request', link: 'https://x.test/c' }),
        raw({ kind: 'research', link: 'https://x.test/d' }),
      ]),
    })
    await readNow(s.ctx, NOW)
    const d = await acceptAll(s.ctx, DATE)
    const by = Object.fromEntries(d.items.map(i => [i.link.slice(-1), i.state]))
    expect(by).toEqual({ a: 'done', b: 'done', c: 'proposed', d: 'done' })
    expect(s.start).toHaveBeenCalledTimes(2)
  })
})

describe('acceptAll with an id', () => {
  it('starts one request with the picked project', async () => {
    const s = stub({ reader: reply([raw({ kind: 'request' })]) })
    const d = await readNow(s.ctx, NOW)
    await expect(acceptAll(s.ctx, DATE, d.items[0].id)).rejects.toMatchObject({ code: 'bad_request', message: 'pick a project' })
    const out = await acceptAll(s.ctx, DATE, d.items[0].id, 'forge')
    expect(out.items[0]).toMatchObject({ state: 'done', project: 'forge' })
  })
})

describe('concurrency and line safety', () => {
  it('send types a single bounded line for a multi-line quote', async () => {
    const quote = `first\nsecond\r\n\x1b[31mthird${'x'.repeat(400)}`
    const s = stub({ reader: reply([raw({ kind: 'to-task', quote, targetSession: { project: 'forge', sessionDir: 'task-0' } })]) })
    const d = await readNow(s.ctx, NOW)
    await applyItem(s.ctx, DATE, d.items[0].id, 'send')
    const text = s.send.mock.calls[0][2] as string
    expect(text).not.toMatch(/[\x00-\x1f\x7f]/)
    expect(text.endsWith('… — https://x.test/1')).toBe(true)
    expect(text.startsWith('[Today] ana in #dev: first second')).toBe(true)
  })

  it('two concurrent applyItem calls on one item start one session', async () => {
    const s = stub({ reader: reply([raw({ kind: 'request', project: 'forge' })]) })
    const d = await readNow(s.ctx, NOW)
    const results = await Promise.allSettled([applyItem(s.ctx, DATE, d.items[0].id, 'start'), applyItem(s.ctx, DATE, d.items[0].id, 'start')])
    expect(results.map(r => r.status).sort()).toEqual(['fulfilled', 'rejected'])
    expect(s.start).toHaveBeenCalledTimes(1)
  })

  it('a dismiss during auto research is not reverted', async () => {
    const s = stub({ reader: reply(research(3)) })
    let dismissed: Promise<unknown> | undefined
    s.start.mockImplementation(async () => {
      if (!dismissed) dismissed = applyItem(s.ctx, DATE, (s.store.get(`digest/${DATE}`) as Digest).items[1].id, 'dismiss')
      return { project: 'forge', sessionDir: 'task-1' }
    })
    await readNow(s.ctx, NOW)
    await dismissed
    const d = digestOf(s)
    expect(d.items.map(i => i.state)).toEqual(['done', 'dismissed', 'done'])
    expect(s.start).toHaveBeenCalledTimes(2)
  })
})
