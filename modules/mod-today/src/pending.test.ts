import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ForgeContext } from '@forge-dev/sdk'
import { readNow, retryAccount, startPending, hidePending, pendingNow, timing, localDate } from './run'
import type { Digest, PendingItem } from './digest'
import * as github from './github'
import server from './server'

vi.mock('./github', () => ({ fetchGithub: vi.fn(async () => ({ items: [] })), fetchPending: vi.fn(async () => ({ items: [] })) }))

const NOW = new Date(2026, 10, 16, 9, 0, 0)
const DATE = localDate(NOW)
beforeEach(() => { timing.retryMs = 0; vi.mocked(github.fetchPending).mockReset().mockResolvedValue({ items: [] }) })

const lin = (over: Record<string, unknown> = {}) => ({ issueKey: 'MOB-1', title: 'Fix it', state: 'In Progress', started: true, link: 'https://linear.app/x/issue/MOB-1', when: '2026-11-15T10:00:00Z', ...over })
const gh = (over: Partial<PendingItem> = {}): PendingItem => ({ id: 'g1', source: 'github', kind: 'review', title: 'Add cache', link: 'https://github.com/o/forge/pull/9', when: '2026-11-15T07:00:00Z', repo: 'o/forge', ...over })

type Reader = (input: { account: string }) => Promise<{ text: string }>
function stub(reader: Reader, opts: { enabled?: boolean; accounts?: { name: string; harness?: string }[]; projects?: { name: string; path: string; account?: string }[] } = {}) {
  const store = new Map<string, unknown>([['enabled', opts.enabled ?? true]])
  const start = vi.fn(async () => ({ project: 'forge', sessionDir: 'task-1' }))
  const ctx = {
    settings: { time: '08:00', autoResearch: false, maxAuto: 3, accounts: '', researchProject: '', model: 'sonnet' },
    storage: {
      get: async (k: string) => store.get(k),
      set: async (k: string, v: unknown) => void store.set(k, JSON.parse(JSON.stringify(v))),
      delete: async (k: string) => void store.delete(k),
      list: async (p = '') => [...store.keys()].filter(k => k.startsWith(p)),
    },
    notify: { badge: async () => {} },
    agent: { run: vi.fn(reader) },
    cw: { start },
    sessions: { list: async () => [{ project: 'forge', sessionDir: 'task-0', type: 'work' }] },
    projects: { list: async () => opts.projects ?? [{ name: 'forge', path: '/p/forge' }] },
    accounts: { list: async () => opts.accounts ?? [{ name: 'monoku', harness: 'claude' }] },
  } as unknown as ForgeContext
  return { ctx, store, start }
}
const out = (pending?: unknown[], extra: Record<string, unknown> = {}) => async () => ({ text: JSON.stringify({ items: [], ...(pending ? { pending } : {}), ...extra }) })
const digestOf = (s: ReturnType<typeof stub>) => s.store.get(`digest/${DATE}`) as Digest

describe('pending snapshot', () => {
  it('stores each source under pending/ and serves them sorted', async () => {
    vi.mocked(github.fetchPending).mockResolvedValue({ items: [gh()] })
    const s = stub(out([lin()]))
    await readNow(s.ctx, NOW)
    expect(s.store.has('pending/monoku')).toBe(true)
    expect(s.store.has('pending/github')).toBe(true)
    expect((await pendingNow(s.ctx)).map(p => p.kind)).toEqual(['review', 'issue'])
  })

  it('replaces a source wholesale when it read fine', async () => {
    const s = stub(out([lin(), lin({ link: 'https://linear.app/x/issue/MOB-2', issueKey: 'MOB-2' })]))
    await readNow(s.ctx, NOW)
    expect(await pendingNow(s.ctx)).toHaveLength(2)
    vi.mocked(s.ctx.agent.run).mockImplementation(out([lin()]))
    await readNow(s.ctx, new Date(2026, 10, 16, 10))
    expect(await pendingNow(s.ctx)).toHaveLength(1)
  })

  it('keeps an account\'s previous pending when its reader fails, reports a Linear problem or leaves pending out', async () => {
    const s = stub(out([lin()]))
    await readNow(s.ctx, NOW)
    const run = vi.mocked(s.ctx.agent.run)
    run.mockImplementation(out([], { problems: ['linear: down'] }))
    await readNow(s.ctx, new Date(2026, 10, 16, 10))
    expect(await pendingNow(s.ctx)).toHaveLength(1)
    run.mockImplementation(out(undefined))
    await readNow(s.ctx, new Date(2026, 10, 16, 11))
    expect(await pendingNow(s.ctx)).toHaveLength(1)
    run.mockImplementation(async () => { throw new Error('boom') })
    await readNow(s.ctx, new Date(2026, 10, 16, 12)).catch(() => {})
    expect(await pendingNow(s.ctx)).toHaveLength(1)
  })

  it('keeps the GitHub snapshot when gh errors', async () => {
    vi.mocked(github.fetchPending).mockResolvedValue({ items: [gh()] })
    const s = stub(out([]))
    await readNow(s.ctx, NOW)
    vi.mocked(github.fetchPending).mockResolvedValue({ items: [], error: 'gh down' })
    await readNow(s.ctx, new Date(2026, 10, 16, 10))
    expect((await pendingNow(s.ctx)).map(p => p.id)).toEqual(['g1'])
  })

  it('maps a GitHub repo to the project of that name and its account', async () => {
    vi.mocked(github.fetchPending).mockResolvedValue({ items: [gh()] })
    const s = stub(out([]), { projects: [{ name: 'forge', path: '/p/forge', account: 'monoku' }] })
    await readNow(s.ctx, NOW)
    expect((await pendingNow(s.ctx))[0]).toMatchObject({ project: 'forge', account: 'monoku' })
  })

  it('a retry replaces only that account\'s pending', async () => {
    const s = stub(out([lin()]))
    await readNow(s.ctx, NOW)
    vi.mocked(s.ctx.agent.run).mockImplementation(out([]))
    await retryAccount(s.ctx, 'monoku', new Date(2026, 10, 16, 10))
    expect(await pendingNow(s.ctx)).toEqual([])
  })

  it('forgets an account that is no longer read', async () => {
    const s = stub(out([lin()]))
    s.store.set('pending/gone', [lin()])
    await readNow(s.ctx, NOW)
    expect(s.store.has('pending/gone')).toBe(false)
  })
})

const slackMsg = (over: Record<string, unknown> = {}) => ({ source: 'slack', kind: 'reply', title: 'Can you review the plan?', who: 'Ana', where: '#web', when: '2026-11-15T10:00:00Z', quote: 'need your ok', link: 'https://x.slack.com/archives/C1/p1', ...over })

describe('Slack pending snapshot', () => {
  it('stores an account\'s Slack messages and serves them after CI', async () => {
    vi.mocked(github.fetchPending).mockResolvedValue({ items: [gh({ kind: 'ci', id: 'ci1', link: 'https://github.com/o/forge/pull/2' })] })
    const s = stub(out([lin(), slackMsg()]))
    await readNow(s.ctx, NOW)
    expect(s.store.has('pending/slack/monoku')).toBe(true)
    expect((await pendingNow(s.ctx)).map(p => p.source + ':' + p.kind)).toEqual(['github:ci', 'slack:reply', 'linear:issue'])
  })

  it('replaces the Slack list each reading', async () => {
    const s = stub(out([slackMsg(), slackMsg({ link: 'https://x.slack.com/archives/C1/p2' })]))
    await readNow(s.ctx, NOW)
    expect(await pendingNow(s.ctx)).toHaveLength(2)
    vi.mocked(s.ctx.agent.run).mockImplementation(out([]))
    await readNow(s.ctx, new Date(2026, 10, 16, 10))
    expect(await pendingNow(s.ctx)).toHaveLength(0)
  })

  it('keeps the Slack list on a Slack problem, but still replaces Linear', async () => {
    const s = stub(out([lin(), slackMsg()]))
    await readNow(s.ctx, NOW)
    vi.mocked(s.ctx.agent.run).mockImplementation(out([], { problems: ['slack: down'] }))
    await readNow(s.ctx, new Date(2026, 10, 16, 10))
    expect((await pendingNow(s.ctx)).map(p => p.source)).toEqual(['slack'])
    vi.mocked(s.ctx.agent.run).mockImplementation(out(undefined))
    await readNow(s.ctx, new Date(2026, 10, 16, 11))
    expect(await pendingNow(s.ctx)).toHaveLength(1)
  })

  it('a retry replaces only that account\'s Slack list, and a removed account is forgotten', async () => {
    const s = stub(out([slackMsg()]), { accounts: [{ name: 'monoku' }, { name: 'meridian' }] })
    await readNow(s.ctx, NOW)
    expect(await pendingNow(s.ctx)).toHaveLength(2)
    s.ctx.settings.accounts = 'monoku'
    await readNow(s.ctx, new Date(2026, 10, 16, 10))
    expect(await pendingNow(s.ctx)).toHaveLength(1)
  })
})

describe('Slack pending actions', () => {
  async function withSlack(opts: Parameters<typeof stub>[1] = {}) {
    const s = stub(out([slackMsg()]), opts)
    await readNow(s.ctx, NOW)
    const [item] = await pendingNow(s.ctx)
    return { s, item }
  }

  it('Start a task runs cw work with the message as its description in a picked project', async () => {
    const { s, item } = await withSlack()
    await startPending(s.ctx, item.id, 'forge')
    expect(s.start).toHaveBeenCalledWith({
      type: 'work',
      project: 'forge',
      task: 'can-you-review-the-plan',
      description: 'Can you review the plan?\n\nneed your ok\n\nFrom Ana in #web: https://x.slack.com/archives/C1/p1',
      account: 'monoku',
    })
    expect((await pendingNow(s.ctx))[0].targetSession).toEqual({ project: 'forge', sessionDir: 'task-1' })
  })

  it('needs a project of the same account', async () => {
    const { s, item } = await withSlack({ projects: [{ name: 'atlas', path: '/p/atlas', account: 'meridian' }] })
    await expect(startPending(s.ctx, item.id)).rejects.toThrow('pick a project')
    await expect(startPending(s.ctx, item.id, 'atlas')).rejects.toThrow('project belongs to another account')
    expect(s.start).not.toHaveBeenCalled()
  })

  it('Research opens a general session on the message, on a click only', async () => {
    const { s, item } = await withSlack()
    expect(s.start).not.toHaveBeenCalled()
    await startPending(s.ctx, item.id, undefined, true)
    expect(s.start).toHaveBeenCalledWith(expect.objectContaining({ type: 'general', account: 'monoku', task: 'Research: Can you review the plan?', prompt: expect.stringContaining('need your ok') }))
  })

  it('Research is only for Slack messages', async () => {
    vi.mocked(github.fetchPending).mockResolvedValue({ items: [gh()] })
    const s = stub(out([]))
    await readNow(s.ctx, NOW)
    await expect(startPending(s.ctx, 'g1', 'forge', true)).rejects.toThrow(/only Slack/)
  })

  it('Hide holds until the message changes', async () => {
    const { s, item } = await withSlack()
    await hidePending(s.ctx, item.id)
    expect(await pendingNow(s.ctx)).toHaveLength(0)
  })

  it('pending-research is a local action', () => {
    expect(server.actions!.find(a => a.id === 'pending-research')).toMatchObject({ effect: 'local' })
  })
})

describe('hide', () => {
  it('hides until its date changes', async () => {
    vi.mocked(github.fetchPending).mockResolvedValue({ items: [gh()] })
    const s = stub(out([]))
    await readNow(s.ctx, NOW)
    expect(await hidePending(s.ctx, 'g1')).toEqual([])
    await readNow(s.ctx, new Date(2026, 10, 16, 10))
    expect(await pendingNow(s.ctx)).toEqual([])
    vi.mocked(github.fetchPending).mockResolvedValue({ items: [gh({ when: '2026-11-16T08:00:00Z' })] })
    await readNow(s.ctx, new Date(2026, 10, 16, 11))
    expect(await pendingNow(s.ctx)).toHaveLength(1)
  })

  it('refuses an unknown item', async () => {
    await expect(hidePending(stub(out([])).ctx, 'nope')).rejects.toThrow(/no such pending/)
  })
})

describe('start', () => {
  async function withGithub(item: PendingItem, opts: Parameters<typeof stub>[1] = {}) {
    vi.mocked(github.fetchPending).mockResolvedValue({ items: [item] })
    const s = stub(out([]), opts)
    await readNow(s.ctx, NOW)
    return s
  }

  it('a review request starts cw review on the pull request and then offers Open task', async () => {
    const s = await withGithub(gh())
    await startPending(s.ctx, 'g1', 'forge')
    expect(s.start).toHaveBeenCalledWith({ type: 'review', project: 'forge', task: 'https://github.com/o/forge/pull/9' })
    // it stays, now offering Open task
    expect((await pendingNow(s.ctx))[0].targetSession).toEqual({ project: 'forge', sessionDir: 'task-1' })
  })

  it('an issue and failing CI start cw work on the link', async () => {
    const s = await withGithub(gh({ kind: 'ci', link: 'https://github.com/o/forge/pull/7' }))
    await startPending(s.ctx, 'g1', 'forge')
    expect(s.start).toHaveBeenCalledWith({ type: 'work', project: 'forge', task: 'https://github.com/o/forge/pull/7' })
  })

  it('needs a project when the item has none', async () => {
    const s = await withGithub(gh({ repo: 'o/other' }))
    await expect(startPending(s.ctx, 'g1')).rejects.toThrow('pick a project')
    expect(s.start).not.toHaveBeenCalled()
  })

  it('refuses a project of another account', async () => {
    const s = stub(out([lin()]), { projects: [{ name: 'atlas', path: '/p/atlas', account: 'meridian' }] })
    await readNow(s.ctx, NOW)
    const [item] = await pendingNow(s.ctx)
    expect(item.account).toBe('monoku')
    await expect(startPending(s.ctx, item.id, 'atlas')).rejects.toThrow('project belongs to another account')
    expect(s.start).not.toHaveBeenCalled()
  })

  it('does nothing while Today is off', async () => {
    const s = await withGithub(gh())
    s.store.set('enabled', false)
    await expect(startPending(s.ctx, 'g1', 'forge')).rejects.toThrow('Today is off')
    expect(s.start).not.toHaveBeenCalled()
  })

  it('a failed start leaves the item pending', async () => {
    const s = await withGithub(gh())
    s.start.mockRejectedValueOnce(new Error('cw failed'))
    await expect(startPending(s.ctx, 'g1', 'forge')).rejects.toThrow('cw failed')
    expect(await pendingNow(s.ctx)).toHaveLength(1)
  })

  it('a reading never starts anything', async () => {
    const s = await withGithub(gh({ project: 'forge' }))
    expect(s.start).not.toHaveBeenCalled()
  })
})

describe('reply and window', () => {
  const route = server.routes!.find(r => r.path === '/digest')!
  const get = (s: ReturnType<typeof stub>) => route.handler({ params: {}, query: {}, body: undefined }, s.ctx) as Promise<{ pending: PendingItem[]; firstReading: boolean }>

  it('flags the first reading ever and stores its window start', async () => {
    const s = stub(out([lin()]))
    await readNow(s.ctx, NOW)
    expect(digestOf(s).windowStart).toBe(new Date(NOW.getTime() - 86_400_000).toISOString())
    const r = await get(s)
    expect(r.firstReading).toBe(true)
    expect(r.pending).toHaveLength(1)
  })

  it('a refresh keeps the flag and moves the window to the previous reading', async () => {
    const s = stub(out([]))
    await readNow(s.ctx, NOW)
    const later = new Date(2026, 10, 16, 10)
    await readNow(s.ctx, later)
    expect(digestOf(s).windowStart).toBe(NOW.toISOString())
    expect((await get(s)).firstReading).toBe(true)
  })

  it('a day after an earlier reading is not a first reading', async () => {
    const s = stub(out([]))
    s.store.set('lastReadAt', new Date(2026, 10, 15, 9).toISOString())
    await readNow(s.ctx, NOW)
    expect(digestOf(s).windowStart).toBe(new Date(2026, 10, 15, 9).toISOString())
    expect((await get(s)).firstReading).toBe(false)
  })
})

describe('actions', () => {
  it('pending-start and pending-hide are local actions', () => {
    for (const id of ['pending-start', 'pending-hide']) expect(server.actions!.find(a => a.id === id)).toMatchObject({ effect: 'local' })
  })
})

describe('github pending problems', () => {
  it('a failed GitHub pending read is noted and keeps the snapshot', async () => {
    vi.mocked(github.fetchPending).mockResolvedValue({ items: [gh()] })
    const s = stub(out([]))
    await readNow(s.ctx, NOW)
    vi.mocked(github.fetchPending).mockResolvedValue({ items: [], error: 'gh down' })
    await readNow(s.ctx, new Date(2026, 10, 16, 10))
    expect(digestOf(s).notes).toContain('GitHub pending: gh down')
    expect(await pendingNow(s.ctx)).toHaveLength(1)
  })

  it('the reply says when a GitHub list hit its limit', async () => {
    const route = server.routes!.find(r => r.path === '/digest')!
    const get = (c: ForgeContext) => route.handler({ params: {}, query: {}, body: undefined }, c) as Promise<{ pendingCapped: boolean }>
    vi.mocked(github.fetchPending).mockResolvedValue({ items: [gh()], capped: true })
    const s = stub(out([]))
    await readNow(s.ctx, NOW)
    expect((await get(s.ctx)).pendingCapped).toBe(true)
    vi.mocked(github.fetchPending).mockResolvedValue({ items: [] })
    await readNow(s.ctx, new Date(2026, 10, 16, 10))
    expect((await get(s.ctx)).pendingCapped).toBe(false)
  })
})
