import { describe, it, expect, vi } from 'vitest'
import type { ForgeContext, SendResult } from '@forge-dev/sdk'
import { readNow, applyItem, acceptAll, setFolded, isFolded, localDate } from './run'
import type { Digest } from './digest'
import * as github from './github'

vi.mock('./github', () => ({ fetchGithub: vi.fn(async () => ({ items: [] })) }))

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
  it('a reading with new items unfolds the day', async () => {
    const s = stub({ reader: reply([raw({})]) })
    await readNow(s.ctx, NOW)
    await setFolded(s.ctx, DATE, true)
    await readNow(s.ctx, new Date(2026, 10, 15, 10))
    expect(await isFolded(s.ctx, DATE)).toBe(true)
    s.run.mockImplementation(async () => ({ text: JSON.stringify({ items: [raw({ link: 'https://x.test/new' })] }) }))
    await readNow(s.ctx, new Date(2026, 10, 15, 11))
    expect(await isFolded(s.ctx, DATE)).toBe(false)
  })

  it('refresh reads only what is new since the last reading and merges into today', async () => {
    const s = stub({ reader: reply([raw({})]), settings: { autoResearch: false } })
    const first = await readNow(s.ctx, NOW)
    await applyItem(s.ctx, DATE, first.items[0].id, 'dismiss')
    s.run.mockImplementation(async () => ({ text: JSON.stringify({ items: [raw({ link: 'https://x.test/new' })] }) }))
    const d = await readNow(s.ctx, new Date(2026, 10, 15, 10))
    expect(s.run.mock.calls[1][0]).toMatchObject({ prompt: expect.stringContaining(`since ${NOW.toISOString()}`) })
    expect(d.items).toHaveLength(2)
    expect(d.items.find(i => i.id === first.items[0].id)?.state).toBe('dismissed')
    expect(d.items.filter(i => i.state === 'proposed')).toHaveLength(1)
    expect(d.since).toBe(first.since)
  })

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

  it('research names the session and sends the question as its prompt', async () => {
    const s = stub({ reader: reply([raw({ kind: 'research', title: 'Why is CI slow', quote: 'it takes\n20 min' })]) })
    await readNow(s.ctx, NOW)
    expect(s.start).toHaveBeenCalledWith({
      type: 'general',
      directory: process.env.HOME,
      task: 'Research: Why is CI slow',
      prompt: 'Why is CI slow — find out and leave the answer in the session. Context: it takes 20 min https://x.test/1',
    })
  })
})

describe('github', () => {
  const event = { type: 'review-request' as const, repo: 'o/r', number: 9, title: 'Add cache', url: 'https://github.com/o/r/pull/9', pr: 'https://github.com/o/r/pull/9', when: '2026-11-15T07:00:00Z' }
  const ghItem = raw({ source: 'github', kind: 'review', title: 'Add cache', link: 'https://github.com/o/r/pull/9#discussion_1', project: 'forge' })

  it('a review item starts cw review with the PR url', async () => {
    vi.mocked(github.fetchGithub).mockResolvedValueOnce({ items: [event] })
    const s = stub({ reader: reply([ghItem]) })
    const d = await readNow(s.ctx, NOW)
    const saved = await applyItem(s.ctx, DATE, d.items[0].id, 'start')
    expect(s.start).toHaveBeenCalledWith({ type: 'review', project: 'forge', task: 'https://github.com/o/r/pull/9' })
    expect(saved.state).toBe('done')
  })

  it('a github issue from a CI failure starts cw work on the PR with the failing checks', async () => {
    vi.mocked(github.fetchGithub).mockResolvedValueOnce({ items: [{ ...event, type: 'ci-failure', url: 'https://github.com/o/r/pull/7', pr: 'https://github.com/o/r/pull/7' }] })
    const s = stub({ reader: reply([raw({ source: 'github', kind: 'issue', title: 'CI failing', link: 'https://github.com/o/r/pull/7', project: 'forge', quote: 'Failing checks: lint' })]) })
    const d = await readNow(s.ctx, NOW)
    await applyItem(s.ctx, DATE, d.items[0].id, 'start')
    expect(s.start).toHaveBeenCalledWith({ type: 'work', project: 'forge', task: 'https://github.com/o/r/pull/7', description: 'CI failing\n\nFailing checks: lint' })
  })

  it('passes the fetched events to the reader as data', async () => {
    vi.mocked(github.fetchGithub).mockResolvedValueOnce({ items: [event] })
    const s = stub({ reader: reply([]) })
    await readNow(s.ctx, NOW)
    expect((s.run.mock.calls[0][0] as { prompt: string }).prompt).toContain('https://github.com/o/r/pull/9')
  })

  it('a github item whose link was not fetched is dropped', async () => {
    vi.mocked(github.fetchGithub).mockResolvedValueOnce({ items: [event] })
    const s = stub({ reader: reply([
      ghItem,
      raw({ source: 'github', kind: 'review', link: 'https://github.com/evil/repo/pull/1', project: 'forge' }),
      raw({ source: 'slack', kind: 'request', link: 'https://x.test/ok' }),
    ]) })
    const d = await readNow(s.ctx, NOW)
    expect(d.items.map(i => i.link)).toEqual(['https://github.com/o/r/pull/9#discussion_1', 'https://x.test/ok'])
  })

  it('a slack-sourced item with an unfetched github link is dropped', async () => {
    vi.mocked(github.fetchGithub).mockResolvedValueOnce({ items: [event] })
    const s = stub({ reader: reply([raw({ source: 'slack', kind: 'request', link: 'https://github.com/evil/repo/pull/1' })]) })
    expect((await readNow(s.ctx, NOW)).items).toEqual([])
  })

  it('a review item with a non-github link is dropped', async () => {
    vi.mocked(github.fetchGithub).mockResolvedValueOnce({ items: [event] })
    const s = stub({ reader: reply([raw({ source: 'slack', kind: 'review', link: 'https://evil.test/pull/9', project: 'forge' })]) })
    expect((await readNow(s.ctx, NOW)).items).toEqual([])
  })

  it('a github failure does not fail the reading and is noted', async () => {
    vi.mocked(github.fetchGithub).mockResolvedValueOnce({ items: [], error: 'gh is not signed in' })
    const s = stub({ reader: reply([raw({})]) })
    const d = await readNow(s.ctx, NOW)
    expect(d.items).toHaveLength(1)
    expect(d.error).toBe('GitHub: gh is not signed in')
    expect(s.store.get('lastReadAt')).toBe(NOW.toISOString())
    expect(s.store.has('lastFailedAt')).toBe(false)
  })

  it('a github note is appended to a reader failure', async () => {
    vi.mocked(github.fetchGithub).mockResolvedValueOnce({ items: [], error: 'gh is not signed in' })
    const s = stub({ reader: async () => ({ text: 'sorry, no' }) })
    const d = await readNow(s.ctx, NOW)
    expect(d.error).toMatch(/JSON.*GitHub: gh is not signed in$/)
  })

  it('a later clean reading clears the note', async () => {
    vi.mocked(github.fetchGithub).mockResolvedValueOnce({ items: [], error: 'x' })
    const s = stub({ reader: reply([]) })
    await readNow(s.ctx, NOW)
    expect((await readNow(s.ctx, new Date(2026, 10, 15, 10))).error).toBeUndefined()
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
    expect(s.start).toHaveBeenCalledWith({ type: 'work', project: 'forge', task: 'fix-it', description: 'Fix it\n\nq\n\nFrom ana in #dev: https://x.test/1' })
  })

  it('a request task is a single-line slug with no slash', async () => {
    const { s, id } = await seeded({ kind: 'request', title: 'Ship the /api v2 — "now"\nplease!' })
    await applyItem(s.ctx, DATE, id, 'start', 'forge')
    const input = (s.start.mock.calls[0] as unknown[])[0] as { task: string; description: string }
    expect(input.task).toBe('ship-the-api-v2-now-please')
    expect(input.description).toBe('Ship the /api v2 — "now"\nplease!\n\nFrom ana in #dev: https://x.test/1')
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
    // Forge strips the other control characters before typing
    expect(text).not.toMatch(/[\n\r\t]/)
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

  it('a dismiss is not held up by a long send in accept all', async () => {
    const s = stub({
      settings: { autoResearch: false },
      reader: reply([
        raw({ kind: 'to-task', link: 'https://x.test/a', targetSession: { project: 'forge', sessionDir: 'task-0' } }),
        raw({ kind: 'request', link: 'https://x.test/b' }),
      ]),
    })
    const d = await readNow(s.ctx, NOW)
    let release!: () => void
    s.send.mockImplementation(() => new Promise<SendResult>(resolve => { release = () => resolve('typed') }))
    const accepting = acceptAll(s.ctx, DATE)
    await vi.waitFor(() => expect(s.send).toHaveBeenCalled())
    const dismissed = await applyItem(s.ctx, DATE, d.items[1].id, 'dismiss')
    expect(dismissed.state).toBe('dismissed')
    expect(digestOf(s).items.map(i => i.state)).toEqual(['proposed', 'dismissed'])
    release()
    const out = await accepting
    expect(out.items.map(i => i.state)).toEqual(['done', 'dismissed'])
    expect(digestOf(s).items.map(i => i.state)).toEqual(['done', 'dismissed'])
  })

  it('an item being sent cannot be acted on twice', async () => {
    const s = stub({ reader: reply([raw({ kind: 'to-task', targetSession: { project: 'forge', sessionDir: 'task-0' } })]) })
    const d = await readNow(s.ctx, NOW)
    let release!: () => void
    s.send.mockImplementation(() => new Promise<SendResult>(resolve => { release = () => resolve('typed') }))
    const sending = applyItem(s.ctx, DATE, d.items[0].id, 'send')
    await vi.waitFor(() => expect(s.send).toHaveBeenCalled())
    await expect(applyItem(s.ctx, DATE, d.items[0].id, 'dismiss')).rejects.toMatchObject({ code: 'bad_request' })
    release()
    expect((await sending).state).toBe('done')
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
