import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ForgeContext, SendResult } from '@forge-dev/sdk'
import { readNow, readingNow, timing, retryAccount, reconnectAccount, applyItem, acceptAll, setFolded, isFolded, localDate } from './run'
import type { Digest } from './digest'
import * as github from './github'

vi.mock('./github', () => ({ fetchGithub: vi.fn(async () => ({ items: [] })), fetchPending: vi.fn(async () => ({ items: [] })) }))

const NOW = new Date(2026, 10, 15, 9, 0, 0)

const RETRY_PAUSE = timing.retryMs
beforeEach(() => { timing.retryMs = 0 })
afterEach(() => { timing.retryMs = RETRY_PAUSE })
const DATE = localDate(NOW)

function raw(over: Record<string, unknown>) {
  return { source: 'slack', kind: 'request', title: 'T', who: 'ana', where: '#dev', when: '2026-11-15T08:00:00Z', link: 'https://x.test/1', ...over }
}

type Reader = (input: { account: string; prompt: string }) => Promise<{ text: string }>
type Acct = { name: string; harness?: string }
type Proj = { name: string; path: string; account?: string }
type Sess = { project: string; sessionDir: string; type: string; account?: string }

function stub(opts: { reader?: Reader; send?: SendResult | Error; settings?: Record<string, unknown>; accounts?: Acct[]; projects?: Proj[]; sessions?: Sess[] } = {}) {
  const store = new Map<string, unknown>([['enabled', true]])
  const badge = vi.fn(async () => {})
  const start = vi.fn(async () => ({ project: 'forge', sessionDir: 'task-1' }))
  const send = vi.fn(async (..._a: unknown[]) => {
    if (opts.send instanceof Error) throw opts.send
    return opts.send ?? 'typed'
  })
  const run = vi.fn<Reader>(opts.reader ?? (async () => ({ text: '{"items":[]}' })))
  const ctx = {
    settings: { time: '08:00', autoResearch: true, maxAuto: 3, accounts: '', researchProject: '', model: 'sonnet', ...opts.settings },
    storage: {
      get: async (k: string) => store.get(k),
      set: async (k: string, v: unknown) => void store.set(k, JSON.parse(JSON.stringify(v))),
      delete: async (k: string) => void store.delete(k),
      list: async (p = '') => [...store.keys()].filter(k => k.startsWith(p)),
    },
    notify: { badge },
    agent: { run },
    cw: { start },
    sessions: { list: async () => opts.sessions ?? [{ project: 'forge', sessionDir: 'task-0', type: 'work' }], send },
    projects: { list: async () => opts.projects ?? [{ name: 'forge', path: '/p/forge' }], dir: async (n: string) => (n === 'forge' ? '/p/forge' : null) },
    accounts: { list: async () => opts.accounts ?? [{ name: 'codex-acc', harness: 'codex' }, { name: 'monoku', harness: 'claude' }] },
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
    expect(digestOf(s).autoStarted).toEqual({ monoku: 3 })
    expect(digestOf(s).items.filter(i => i.state === 'done')).toHaveLength(3)
    expect(s.badge).toHaveBeenLastCalledWith('today', 2, 'to review')
  })

  it('turning off during a reading starts no research', async () => {
    const s = stub({ reader: async () => {
      s.store.set('enabled', false)
      return { text: JSON.stringify({ items: research(2) }) }
    } })
    await readNow(s.ctx, NOW)
    expect(s.start).not.toHaveBeenCalled()
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
      account: 'monoku',
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
    expect(d.items.map(i => i.link)).toEqual(['https://github.com/o/r/pull/9', 'https://x.test/ok'])
  })

  it('a research item from GitHub is not auto-started', async () => {
    vi.mocked(github.fetchGithub).mockResolvedValueOnce({ items: [{ ...event, type: 'mention' }] })
    const s = stub({ reader: reply([
      raw({ source: 'github', kind: 'research', link: 'https://github.com/o/r/pull/9#issuecomment-5' }),
      raw({ source: 'slack', kind: 'research', link: 'https://github.com/o/r/pull/9' }),
    ]) })
    const d = await readNow(s.ctx, NOW)
    expect(s.start).not.toHaveBeenCalled()
    expect(d.items.map(i => i.state)).toEqual(['proposed'])
    expect(d.autoStarted).toEqual({})
    const saved = await applyItem(s.ctx, DATE, d.items[0].id, 'research')
    expect(saved.state).toBe('done')
    expect(s.start).toHaveBeenCalledTimes(1)
  })

  it('a reading that included GitHub events auto-starts nothing', async () => {
    vi.mocked(github.fetchGithub).mockResolvedValueOnce({ items: [{ ...event, type: 'comment' }] })
    const s = stub({ reader: reply([raw({ source: 'slack', kind: 'research', link: 'https://x.test/r' })]) })
    const d = await readNow(s.ctx, NOW)
    expect(s.start).not.toHaveBeenCalled()
    expect(d.items.map(i => i.state)).toEqual(['proposed'])
    // a later reading the same day without GitHub, even one that reads it again, leaves it alone
    s.run.mockImplementation(reply([raw({ source: 'slack', kind: 'research', link: 'https://x.test/r', when: '2026-11-15T09:30:00Z' })]))
    await readNow(s.ctx, new Date(2026, 10, 15, 10))
    expect(s.start).not.toHaveBeenCalled()
    expect((await applyItem(s.ctx, DATE, d.items[0].id, 'research')).state).toBe('done')
  })

  it('a reading without GitHub events still auto-starts research', async () => {
    const s = stub({ reader: reply([raw({ source: 'slack', kind: 'research', link: 'https://x.test/r' })]) })
    const d = await readNow(s.ctx, NOW)
    expect(s.start).toHaveBeenCalledTimes(1)
    expect(d.items.map(i => i.state)).toEqual(['done'])
  })

  it('a review item needs a pull request whose review was requested', async () => {
    vi.mocked(github.fetchGithub).mockResolvedValueOnce({ items: [{ ...event, type: 'mention', url: 'https://github.com/o/r/pull/5', pr: 'https://github.com/o/r/pull/5' }, event] })
    const s = stub({ reader: reply([
      raw({ source: 'github', kind: 'review', link: 'https://github.com/o/r/pull/5', project: 'forge' }),
      raw({ source: 'github', kind: 'review', link: 'https://github.com/o/r/pull/9', project: 'forge' }),
    ]) })
    const d = await readNow(s.ctx, NOW)
    expect(d.items.map(i => i.link)).toEqual(['https://github.com/o/r/pull/9'])
  })

  it('an item on a GitHub link is a github item and its link has no anchor', async () => {
    vi.mocked(github.fetchGithub).mockResolvedValueOnce({ items: [{ ...event, type: 'comment' }] })
    const s = stub({ reader: reply([raw({ source: 'slack', kind: 'request', link: 'https://github.com/o/r/pull/9#issuecomment-123' })]) })
    const d = await readNow(s.ctx, NOW)
    expect(d.items).toEqual([expect.objectContaining({ source: 'github', link: 'https://github.com/o/r/pull/9' })])
    await applyItem(s.ctx, DATE, d.items[0].id, 'start', 'forge')
    expect(s.start).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringMatching(/: https:\/\/github\.com\/o\/r\/pull\/9$/) }))
    expect(JSON.stringify(s.start.mock.calls[0])).not.toContain('issuecomment')
  })

  it('two items with the same id in one reading become one', async () => {
    vi.mocked(github.fetchGithub).mockResolvedValueOnce({ items: [{ ...event, type: 'ci-failure' }, { ...event, type: 'review' }] })
    const s = stub({ settings: { autoResearch: false }, reader: reply([
      raw({ source: 'github', kind: 'issue', title: 'CI failing', link: 'https://github.com/o/r/pull/9', when: '2026-11-15T07:00:00Z', project: 'forge' }),
      raw({ source: 'github', kind: 'request', title: 'Review asks for changes', link: 'https://github.com/o/r/pull/9#pullrequestreview-1', when: '2026-11-15T08:30:00Z', project: 'forge' }),
    ]) })
    const d = await readNow(s.ctx, NOW)
    expect(d.items).toHaveLength(1)
    expect(d.items[0]).toMatchObject({ title: 'Review asks for changes', when: '2026-11-15T08:30:00Z' })
    const out = await acceptAll(s.ctx, DATE)
    expect(out.items.map(i => i.state)).toEqual(['done'])
  })

  it('a slack-sourced item with an unfetched github link is dropped', async () => {
    vi.mocked(github.fetchGithub).mockResolvedValueOnce({ items: [event] })
    const s = stub({ reader: reply([raw({ source: 'slack', kind: 'request', link: 'https://github.com/evil/repo/pull/1' })]) })
    expect((await readNow(s.ctx, NOW)).items).toEqual([])
  })

  it.each(['https://github.com./evil/repo/pull/1', 'https://GitHub.com/evil/repo/pull/1', 'https://www.github.com/evil/repo/pull/1', 'https://gist.github.com/evil/1'])('an unfetched link on %s is dropped', async link => {
    vi.mocked(github.fetchGithub).mockResolvedValueOnce({ items: [event] })
    const s = stub({ reader: reply([raw({ source: 'slack', kind: 'request', link })]) })
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
    expect(d.error).toBeUndefined()
    expect(d.notes).toEqual(['GitHub: gh is not signed in'])
    expect(s.store.get('lastReadAt')).toBe(NOW.toISOString())
    expect(s.store.has('lastFailedAt')).toBe(false)
  })

  it('a github note stays a note beside a reader failure', async () => {
    vi.mocked(github.fetchGithub).mockResolvedValueOnce({ items: [], error: 'gh is not signed in' })
    const s = stub({ reader: async () => ({ text: 'sorry, no' }) })
    const d = await readNow(s.ctx, NOW)
    expect(d.error).toMatch(/JSON/)
    expect(d.error).not.toMatch(/GitHub/)
    expect(d.notes).toEqual(['GitHub: gh is not signed in'])
  })

  it('a later clean reading clears the note', async () => {
    vi.mocked(github.fetchGithub).mockResolvedValueOnce({ items: [], error: 'x' })
    const s = stub({ reader: reply([]) })
    await readNow(s.ctx, NOW)
    const d = await readNow(s.ctx, new Date(2026, 10, 15, 10))
    expect(d.error).toBeUndefined()
    expect(d.notes).toBeUndefined()
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
    expect(s.start).toHaveBeenCalledWith({ type: 'work', project: 'forge', account: 'monoku', task: 'fix-it', description: 'Fix it\n\nq\n\nFrom ana in #dev: https://x.test/1' })
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
    expect(s.start).toHaveBeenCalledWith({ type: 'work', project: 'forge', account: 'monoku', task: 'https://linear.app/x/issue/A-1' })
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

const TWO: Acct[] = [{ name: 'monoku', harness: 'claude' }, { name: 'meridian' }, { name: 'codex-acc', harness: 'codex' }]
const PROJECTS: Proj[] = [{ name: 'forge', path: '/p/forge', account: 'monoku' }, { name: 'atlas', path: '/p/atlas', account: 'meridian' }]
const SESSIONS: Sess[] = [{ project: 'forge', sessionDir: 'task-0', type: 'work', account: 'monoku' }, { project: 'atlas', sessionDir: 'task-9', type: 'work', account: 'meridian' }]
const byAccount = (map: Record<string, unknown[] | Error>): Reader => async ({ account }) => {
  const out = map[account]
  if (out instanceof Error) throw out
  return { text: JSON.stringify({ items: out ?? [] }) }
}
const two = (map: Record<string, unknown[] | Error>, settings: Record<string, unknown> = {}) =>
  stub({ accounts: TWO, projects: PROJECTS, sessions: SESSIONS, reader: byAccount(map), settings: { autoResearch: false, ...settings } })

describe('every account', () => {
  it('a reading runs one reader per account with that account\'s projects and sessions', async () => {
    const s = two({})
    await readNow(s.ctx, NOW)
    expect(s.run).toHaveBeenCalledTimes(2)
    const prompts = Object.fromEntries(s.run.mock.calls.map(([i]) => [i.account, i.prompt]))
    expect(Object.keys(prompts).sort()).toEqual(['meridian', 'monoku'])
    expect(prompts.monoku).toContain('forge::task-0')
    expect(prompts.monoku).not.toContain('task-9')
    expect(prompts.monoku).toContain('Known projects: forge')
    expect(prompts.meridian).toContain('atlas::task-9')
    expect(prompts.meridian).not.toContain('task-0')
    expect(prompts.meridian).toContain('Known projects: atlas')
  })

  it('items carry their account and ids differ per account', async () => {
    const s = two({ monoku: [raw({})], meridian: [raw({})] })
    const d = await readNow(s.ctx, NOW)
    expect(d.items.map(i => i.account).sort()).toEqual(['meridian', 'monoku'])
    expect(new Set(d.items.map(i => i.id)).size).toBe(2)
  })

  it('one account failing becomes a reader problem and the others are kept', async () => {
    const s = two({ monoku: [raw({})], meridian: new Error('no Slack connector') })
    const d = await readNow(s.ctx, NOW)
    expect(d.items).toHaveLength(1)
    expect(d.error).toBeUndefined()
    expect(d.problems).toEqual([{ account: 'meridian', source: 'reader', reason: 'no Slack connector' }])
    expect(d.notes).toBeUndefined()
    expect(s.store.get('lastReadAt')).toBe(NOW.toISOString())
  })

  it('a source the reader could not reach becomes a problem after one retry', async () => {
    const reader = vi.fn<Reader>(async ({ account }) => ({ text: JSON.stringify(account === 'meridian' ? { items: [], problems: ['slack: server still connecting'] } : { items: [raw({})] }) }))
    const s = stub({ accounts: TWO, projects: PROJECTS, sessions: SESSIONS, reader, settings: { autoResearch: false } })
    const d = await readNow(s.ctx, NOW)
    expect(reader.mock.calls.filter(([i]) => i.account === 'meridian')).toHaveLength(2)
    expect(reader.mock.calls.filter(([i]) => i.account === 'monoku')).toHaveLength(1)
    expect(d.problems).toEqual([{ account: 'meridian', source: 'slack', reason: 'server still connecting' }])
    expect(d.notes).toBeUndefined()
    expect(d.items).toHaveLength(1)
  })

  it('the retry comes after a pause, not at once', async () => {
    vi.useFakeTimers()
    try {
      timing.retryMs = RETRY_PAUSE
      expect(RETRY_PAUSE).toBe(15_000)
      const reader = vi.fn<Reader>(async () => ({ text: JSON.stringify({ items: [], problems: ['slack: still connecting'] }) }))
      const s = stub({ reader, settings: { autoResearch: false } })
      const reading = readNow(s.ctx, NOW)
      await vi.advanceTimersByTimeAsync(14_000)
      expect(reader).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(1_000)
      expect(reader).toHaveBeenCalledTimes(2)
      await reading
    } finally {
      vi.useRealTimers()
    }
  })

  it('a retry that reaches the source keeps its items and adds no problem', async () => {
    let calls = 0
    const reader: Reader = async ({ account }) => {
      if (account !== 'meridian') return { text: '{"items":[]}' }
      calls++
      return { text: JSON.stringify(calls === 1 ? { items: [], problems: ['linear: unavailable'] } : { items: [raw({ link: 'https://x.test/m' })] }) }
    }
    const s = two({})
    s.run.mockImplementation(reader)
    const d = await readNow(s.ctx, NOW)
    expect(d.problems ?? []).toEqual([])
    expect(d.items.map(i => i.link)).toEqual(['https://x.test/m'])
  })

  it('every account failing fails the reading', async () => {
    const s = two({ monoku: new Error('a'), meridian: new Error('b') })
    const d = await readNow(s.ctx, NOW)
    expect(d.error).toBe('monoku: a; meridian: b')
    expect(s.store.has('lastFailedAt')).toBe(true)
    expect(s.store.get('lastReadAt')).toBeUndefined()
  })

  it('the accounts setting limits the readers', async () => {
    const s = two({}, { accounts: ' meridian , nobody, codex-acc' })
    await readNow(s.ctx, NOW)
    expect(s.run.mock.calls.map(([i]) => i.account)).toEqual(['meridian'])
  })

  it('start and research use the item\'s account', async () => {
    const s = two({ meridian: [raw({ kind: 'request', project: 'atlas' }), raw({ kind: 'research', link: 'https://x.test/r' })] })
    const d = await readNow(s.ctx, NOW)
    await acceptAll(s.ctx, DATE)
    expect(d.items).toHaveLength(2)
    expect(s.start).toHaveBeenCalledTimes(2)
    for (const [input] of s.start.mock.calls as unknown as [{ account: string }][]) expect(input.account).toBe('meridian')
  })

  it('maxAuto applies per account', async () => {
    const s = two({ monoku: research(3), meridian: research(3) }, { autoResearch: true, maxAuto: 2 })
    await readNow(s.ctx, NOW)
    expect(s.start).toHaveBeenCalledTimes(4)
    expect(digestOf(s).autoStarted).toEqual({ monoku: 2, meridian: 2 })
  })

  it('an old digest with a number keeps counting', async () => {
    const s = two({ monoku: research(3) }, { autoResearch: true, maxAuto: 2 })
    s.store.set(`digest/${DATE}`, { date: DATE, readAt: NOW.toISOString(), since: NOW.toISOString(), items: [], autoStarted: 2 })
    await readNow(s.ctx, NOW)
    expect(s.start).not.toHaveBeenCalled()
  })

  it('a github item takes the account of its project', async () => {
    const link = 'https://github.com/o/r/pull/9'
    vi.mocked(github.fetchGithub).mockResolvedValueOnce({ items: [{ type: 'review-request', repo: 'o/r', number: 9, title: 'T', url: link, pr: link, when: '2026-11-15T08:00:00Z' }] })
    const s = two({ monoku: [raw({ source: 'github', kind: 'review', link, project: 'forge' })], meridian: [raw({ source: 'github', kind: 'review', link, project: 'atlas' })] })
    const d = await readNow(s.ctx, NOW)
    // github goes to the first account's reader only
    expect(s.run.mock.calls.find(([i]) => i.account === 'monoku')![0].prompt).toContain(link)
    expect(s.run.mock.calls.find(([i]) => i.account === 'meridian')![0].prompt).not.toContain(link)
    expect(d.items.map(i => [i.source, i.account])).toEqual([['github', 'monoku']])
  })

  it('github events make only that reader\'s items manual', async () => {
    vi.mocked(github.fetchGithub).mockResolvedValueOnce({ items: [{ type: 'comment', repo: 'o/r', number: 9, title: 'T', url: 'https://github.com/o/r/pull/9', pr: 'https://github.com/o/r/pull/9', when: '2026-11-15T08:00:00Z' }] })
    const s = two({ monoku: research(1), meridian: [raw({ kind: 'research', link: 'https://x.test/m' })] }, { autoResearch: true })
    const d = await readNow(s.ctx, NOW)
    expect(d.items.find(i => i.account === 'monoku')).toMatchObject({ manual: true, state: 'proposed' })
    expect(d.items.find(i => i.account === 'meridian')?.state).toBe('done')
  })

  it('a github item without a project starts under the account of the picked project', async () => {
    const link = 'https://github.com/o/r/pull/9'
    vi.mocked(github.fetchGithub).mockResolvedValueOnce({ items: [{ type: 'review-request', repo: 'o/r', number: 9, title: 'T', url: link, pr: link, when: '2026-11-15T08:00:00Z' }] })
    const s = two({ monoku: [raw({ source: 'github', kind: 'review', link })] })
    const d = await readNow(s.ctx, NOW)
    expect(d.items[0].account).toBeUndefined()
    await applyItem(s.ctx, DATE, d.items[0].id, 'start', 'atlas')
    expect(s.start).toHaveBeenCalledWith({ type: 'review', project: 'atlas', account: 'meridian', task: link })
  })

  it('accept all can be limited to one account', async () => {
    const s = two({ monoku: [raw({ kind: 'request', project: 'forge' })], meridian: [raw({ kind: 'request', project: 'atlas' })] })
    await readNow(s.ctx, NOW)
    const out = await acceptAll(s.ctx, DATE, undefined, undefined, 'meridian')
    expect(out.items.map(i => [i.account, i.state]).sort()).toEqual([['meridian', 'done'], ['monoku', 'proposed']])
  })

  it('start refuses a project from another account', async () => {
    const s = two({ meridian: [raw({ kind: 'request' })] })
    const d = await readNow(s.ctx, NOW)
    await expect(applyItem(s.ctx, DATE, d.items[0].id, 'start', 'forge')).rejects.toMatchObject({ code: 'bad_request', message: 'project belongs to another account' })
    expect(s.start).not.toHaveBeenCalled()
  })

  it('only Slack and Linear problems are kept, each account its own', async () => {
    const reader: Reader = async ({ account }) => ({ text: JSON.stringify({ items: [], problems: account === 'monoku' ? ['Linear: unavailable', 'github: the fetched events list was empty'] : ['slack: down'] }) })
    const s = stub({ accounts: TWO, projects: PROJECTS, sessions: SESSIONS, reader, settings: { autoResearch: false } })
    const d = await readNow(s.ctx, NOW)
    expect(d.problems).toEqual(expect.arrayContaining([
      { account: 'monoku', source: 'linear', reason: 'unavailable' },
      { account: 'meridian', source: 'slack', reason: 'down' },
    ]))
    expect(d.problems).toHaveLength(2)
  })

  it('notes that GitHub was skipped when the first reader fails', async () => {
    vi.mocked(github.fetchGithub).mockResolvedValueOnce({ items: [{ type: 'comment', repo: 'o/r', number: 9, title: 'T', url: 'https://github.com/o/r/pull/9', pr: 'https://github.com/o/r/pull/9', when: '2026-11-15T08:00:00Z' }] })
    const s = two({ monoku: new Error('boom'), meridian: [raw({})] })
    const d = await readNow(s.ctx, NOW)
    expect(d.notes).toEqual(['GitHub: not read'])
    expect(d.problems).toEqual([{ account: 'monoku', source: 'reader', reason: 'boom' }])
  })
})

describe('stale review proposals', () => {
  const pr = (n: number) => `https://github.com/o/r/pull/${n}`
  const ev = (n: number) => ({ type: 'review-request' as const, repo: 'o/r', number: n, title: 'T', url: pr(n), pr: pr(n), when: '2026-11-15T08:00:00Z' })
  const review = (n: number) => raw({ source: 'github', kind: 'review', link: pr(n) })
  const seed = (s: ReturnType<typeof stub>, items: unknown[]) => s.store.set(`digest/${DATE}`, { date: DATE, readAt: NOW.toISOString(), since: NOW.toISOString(), items, autoStarted: {} })
  const item = (n: number, over: Record<string, unknown> = {}) => ({ id: `r${n}`, source: 'github', kind: 'review', title: 'T', who: 'a', where: 'o/r', when: '2026-11-14T08:00:00Z', link: pr(n), state: 'proposed', ...over })

  it('drops proposed reviews no longer asked of me and keeps the rest', async () => {
    vi.mocked(github.fetchGithub).mockResolvedValueOnce({ items: [ev(9)], requested: [pr(9)] })
    const s = stub({ settings: { autoResearch: false } })
    seed(s, [item(1), item(2, { state: 'done' }), item(3, { state: 'dismissed' }), item(4, { state: 'failed' }), item(5, { kind: 'request' })])
    const d = await readNow(s.ctx, NOW)
    expect(d.items.map(i => i.id)).toEqual(['r2', 'r3', 'r4', 'r5'])
  })

  it('keeps a proposed review that is still asked, though not updated since', async () => {
    vi.mocked(github.fetchGithub).mockResolvedValueOnce({ items: [], requested: [pr(1)] })
    const s = stub({ settings: { autoResearch: false } })
    seed(s, [item(1)])
    expect((await readNow(s.ctx, NOW)).items.map(i => i.id)).toEqual(['r1'])
  })

  it('keeps everything when GitHub could not be read in full', async () => {
    vi.mocked(github.fetchGithub).mockResolvedValueOnce({ items: [], error: 'gh could not run' })
    const s = stub({ settings: { autoResearch: false } })
    seed(s, [item(1)])
    expect((await readNow(s.ctx, NOW)).items.map(i => i.id)).toEqual(['r1'])
  })

  it('works from the review-request events when no list is given', async () => {
    vi.mocked(github.fetchGithub).mockResolvedValueOnce({ items: [ev(9)] })
    const s = stub({ settings: { autoResearch: false }, reader: reply([review(9)]) })
    seed(s, [item(1)])
    const d = await readNow(s.ctx, NOW)
    expect(d.items.map(i => i.link)).toEqual([pr(9)])
  })
})

describe('reading progress', () => {
  it('tracks each account until its reader finishes and is gone afterwards', async () => {
    let release = () => {}
    const reader: Reader = ({ account }) => account === 'meridian'
      ? Promise.resolve({ text: JSON.stringify({ items: [], problems: ['slack: down'] }) })
      : new Promise(r => { release = () => r({ text: '{"items":[]}' }) })
    const s = stub({ accounts: TWO, projects: PROJECTS, sessions: SESSIONS, reader, settings: { autoResearch: false } })
    expect(readingNow()).toBeUndefined()
    const reading = readNow(s.ctx, NOW)
    await new Promise(r => setTimeout(r, 10))
    expect(typeof readingNow()!.startedAt).toBe('string')
    expect(readingNow()!.accounts).toEqual({ monoku: 'reading', meridian: 'problem' })
    release()
    await reading
    expect(readingNow()).toBeUndefined()
  })

  it('an account whose reader finished is done while another still reads', async () => {
    let release = () => {}
    const reader: Reader = ({ account }) => account === 'monoku'
      ? Promise.resolve({ text: '{"items":[]}' })
      : new Promise(r => { release = () => r({ text: '{"items":[]}' }) })
    const s = stub({ accounts: TWO, projects: PROJECTS, sessions: SESSIONS, reader, settings: { autoResearch: false } })
    const reading = readNow(s.ctx, NOW)
    await new Promise(r => setTimeout(r, 10))
    expect(readingNow()!.accounts).toEqual({ monoku: 'done', meridian: 'reading' })
    release()
    await reading
  })

  it('a retry tracks only its account', async () => {
    const s = stub({ accounts: TWO, projects: PROJECTS, sessions: SESSIONS, reader: byAccount({}), settings: { autoResearch: false } })
    await readNow(s.ctx, NOW)
    let release = () => {}
    s.run.mockImplementation(() => new Promise(r => { release = () => r({ text: '{"items":[]}' }) }))
    const retry = retryAccount(s.ctx, 'meridian', NOW)
    await new Promise(r => setTimeout(r, 10))
    expect(readingNow()!.accounts).toEqual({ meridian: 'reading' })
    release()
    await retry
    expect(readingNow()).toBeUndefined()
  })
})

describe('retryAccount', () => {
  const LATER = new Date(2026, 10, 15, 11)
  const failing = (extra: unknown[] = []): Reader => async ({ account }) => ({ text: JSON.stringify(account === 'meridian' ? { items: [], problems: ['slack: down'] } : { items: extra }) })

  async function broken() {
    const s = stub({ accounts: TWO, projects: PROJECTS, sessions: SESSIONS, reader: failing([raw({})]), settings: { autoResearch: false } })
    await readNow(s.ctx, NOW)
    s.run.mockClear()
    vi.mocked(github.fetchGithub).mockClear()
    return s
  }

  it('reads only that account with the digest window, no GitHub, and keeps lastReadAt', async () => {
    const s = await broken()
    const since = digestOf(s).since
    s.run.mockImplementation(async () => ({ text: JSON.stringify({ items: [raw({ link: 'https://x.test/m', who: 'bo' })] }) }))
    const d = await retryAccount(s.ctx, 'meridian', LATER)
    expect(s.run).toHaveBeenCalledTimes(1)
    expect(s.run.mock.calls[0][0]).toMatchObject({ account: 'meridian', prompt: expect.stringContaining(`since ${since}`) })
    expect(github.fetchGithub).not.toHaveBeenCalled()
    expect(s.store.get('lastReadAt')).toBe(NOW.toISOString())
    expect(d.since).toBe(since)
    expect(d.items).toHaveLength(2)
    expect(d.items.filter(i => i.account === 'meridian')).toHaveLength(1)
  })

  it('replaces only that account\'s problems', async () => {
    const s = await broken()
    const stored = digestOf(s)
    stored.problems = [...(stored.problems ?? []), { account: 'monoku', source: 'linear', reason: 'x' }]
    s.store.set(`digest/${DATE}`, stored)
    s.run.mockImplementation(async () => ({ text: JSON.stringify({ items: [], problems: ['linear: still down'] }) }))
    const d = await retryAccount(s.ctx, 'meridian', LATER)
    expect(d.problems).toEqual([{ account: 'monoku', source: 'linear', reason: 'x' }, { account: 'meridian', source: 'linear', reason: 'still down' }])
    s.run.mockImplementation(async () => ({ text: '{"items":[]}' }))
    expect((await retryAccount(s.ctx, 'meridian', LATER)).problems).toEqual([{ account: 'monoku', source: 'linear', reason: 'x' }])
  })

  it('a reader that throws is a reader problem, not an error', async () => {
    const s = await broken()
    s.run.mockImplementation(async () => { throw new Error('boom') })
    const d = await retryAccount(s.ctx, 'meridian', LATER)
    expect(d.error).toBeUndefined()
    expect(d.problems).toEqual([{ account: 'meridian', source: 'reader', reason: 'boom' }])
  })

  it('keeps an item already dismissed', async () => {
    const s = await broken()
    const first = digestOf(s).items[0]
    await applyItem(s.ctx, DATE, first.id, 'dismiss')
    s.run.mockImplementation(async () => ({ text: JSON.stringify({ items: [raw({})] }) }))
    const d = await retryAccount(s.ctx, 'monoku', LATER)
    expect(d.items.find(i => i.id === first.id)?.state).toBe('dismissed')
  })

  it('is refused while Today is off, and for an account that is not read', async () => {
    const s = await broken()
    expect(await retryAccount(s.ctx, 'codex-acc', LATER).catch(e => e)).toMatchObject({ code: 'bad_request' })
    s.store.set('enabled', false)
    expect(await retryAccount(s.ctx, 'meridian', LATER).catch(e => e)).toMatchObject({ code: 'bad_request', message: 'Today is off' })
    expect(s.run).not.toHaveBeenCalled()
  })

  it('is refused while a full reading is running', async () => {
    const s = await broken()
    let release = () => {}
    const gate = new Promise<void>(r => { release = r })
    s.run.mockImplementation(async () => { await gate; return { text: '{"items":[]}' } })
    const reading = readNow(s.ctx, LATER)
    await new Promise(r => setTimeout(r, 10))
    expect(await retryAccount(s.ctx, 'meridian', LATER).catch(e => e)).toMatchObject({ code: 'bad_request', message: 'a reading is running' })
    expect(s.run).toHaveBeenCalledTimes(2)
    release()
    await reading
  })
})

describe('reconnectAccount', () => {
  it('starts a general session for that account at /mcp', async () => {
    const s = stub({ accounts: TWO })
    expect(await reconnectAccount(s.ctx, 'meridian')).toEqual({ project: 'forge', sessionDir: 'task-1' })
    expect(s.start).toHaveBeenCalledWith({ type: 'general', account: 'meridian', task: 'Reconnect connectors (meridian)', prompt: '/mcp' })
  })

  it('refuses an account that is not read', async () => {
    const s = stub({ accounts: TWO })
    expect(await reconnectAccount(s.ctx, 'codex-acc').catch(e => e)).toMatchObject({ code: 'bad_request' })
    expect(await reconnectAccount(s.ctx, 'nobody').catch(e => e)).toMatchObject({ code: 'bad_request' })
    expect(s.start).not.toHaveBeenCalled()
  })
})
