import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ModuleError, type ForgeContext } from '@forge-dev/sdk'
import server from './server'
import * as github from './github'

vi.mock('./github', () => ({ fetchGithub: vi.fn(async () => ({ items: [] })) }))

beforeEach(() => vi.clearAllMocks())

function stub(enabled?: boolean) {
  const store = new Map<string, unknown>()
  if (enabled !== undefined) store.set('enabled', enabled)
  const run = vi.fn(async () => ({ text: '{"items":[]}' }))
  const clear = vi.fn(async () => {})
  const ctx = {
    settings: { time: '00:00', autoResearch: true, maxAuto: 3, accounts: '', researchProject: '', model: '' },
    storage: {
      get: async (k: string) => store.get(k),
      set: async (k: string, v: unknown) => void store.set(k, v),
      delete: async (k: string) => void store.delete(k),
      list: async (p = '') => [...store.keys()].filter(k => k.startsWith(p)),
    },
    notify: { badge: async () => {}, clear },
    agent: { run },
    cw: { start: vi.fn() },
    sessions: { list: async () => [] },
    projects: { list: async () => [], dir: async () => null },
    accounts: { list: async () => [{ name: 'monoku', harness: 'claude' }] },
  } as unknown as ForgeContext
  return { ctx, run, clear }
}

const tick = (ctx: ForgeContext) => server.jobs![0].run({ ...ctx, signal: new AbortController().signal })
const action = (id: string) => server.actions!.find(a => a.id === id)!
const call = (id: string, ctx: ForgeContext) => (action(id).run as (i: unknown, c: ForgeContext) => Promise<unknown>)({}, ctx)

describe('today routes', () => {
  it('lists the CW project names for the picker', async () => {
    const route = server.routes?.find(r => r.path === '/projects')
    const ctx = { projects: { list: async () => [{ name: 'forge', path: '/p/forge', account: 'monoku' }, { name: 'cw', path: '/p/cw' }] } } as unknown as ForgeContext
    expect(await route!.handler({ params: {}, query: {}, body: undefined }, ctx)).toEqual({ projects: ['forge', 'cw'], owners: { forge: 'monoku' } })
  })

  it('GET /digest reports enabled', async () => {
    const route = server.routes!.find(r => r.path === '/digest')!
    const req = { params: {}, query: {}, body: undefined }
    expect(await route.handler(req, stub().ctx)).toMatchObject({ enabled: false })
    expect(await route.handler(req, stub(true).ctx)).toMatchObject({ enabled: true })
  })
})

describe('off by default', () => {
  it('the job reads nothing while Today is off', async () => {
    const s = stub()
    await tick(s.ctx)
    expect(s.run).not.toHaveBeenCalled()
    expect(github.fetchGithub).not.toHaveBeenCalled()
  })

  it('the job reads once Today is on', async () => {
    const s = stub(true)
    await tick(s.ctx)
    expect(s.run).toHaveBeenCalledTimes(1)
  })

  it('enable turns reading on and disable turns it off', async () => {
    const s = stub()
    await call('enable', s.ctx)
    expect(await s.ctx.storage.get('enabled')).toBe(true)
    await call('disable', s.ctx)
    expect(await s.ctx.storage.get('enabled')).toBe(false)
    expect(s.clear).toHaveBeenCalledWith('today')
  })

  it('refresh while off is refused', async () => {
    const s = stub()
    const err = await call('refresh', s.ctx).catch(e => e)
    expect(err).toBeInstanceOf(ModuleError)
    expect(err).toMatchObject({ code: 'bad_request', message: 'Today is off' })
    expect(s.run).not.toHaveBeenCalled()
  })
})

describe('retry and reconnect actions', () => {
  const run = (id: string, ctx: ForgeContext, input: unknown) => (action(id).run as (i: unknown, c: ForgeContext) => Promise<unknown>)(input, ctx)

  it('are local actions that take an account', () => {
    for (const id of ['retry-account', 'reconnect']) {
      expect(action(id).effect).toBe('local')
      expect(action(id).input).toMatchObject({ account: { type: 'string', required: true } })
    }
  })

  it('retry-account while off is refused', async () => {
    const s = stub()
    expect(await run('retry-account', s.ctx, { account: 'monoku' }).catch(e => e)).toMatchObject({ code: 'bad_request', message: 'Today is off' })
    expect(s.run).not.toHaveBeenCalled()
  })

  it('reconnect starts the account\'s session', async () => {
    const s = stub(true)
    vi.mocked(s.ctx.cw.start).mockResolvedValue({ project: 'p', sessionDir: 'd' })
    expect(await run('reconnect', s.ctx, { account: 'monoku' })).toEqual({ project: 'p', sessionDir: 'd' })
    expect(s.ctx.cw.start).toHaveBeenCalledWith(expect.objectContaining({ account: 'monoku', prompt: '/mcp' }))
  })
})
