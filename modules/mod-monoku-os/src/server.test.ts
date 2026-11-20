import { describe, it, expect, beforeEach } from 'vitest'
import type { ForgeContext } from '@forge-dev/sdk'
import server from './server'
import { timing } from './reader'
import { answer, stub } from './stub.test-util'

beforeEach(() => { timing.retryMs = 0 })

const tick = (ctx: ForgeContext) => server.jobs![0].run({ ...ctx, signal: new AbortController().signal })
const call = (id: string, ctx: ForgeContext, input: unknown = {}) => (server.actions!.find(a => a.id === id)!.run as (i: unknown, c: ForgeContext) => Promise<unknown>)(input, ctx)
const route = (path: string) => server.routes!.find(r => r.path === path)!
const settle = () => new Promise(r => setTimeout(r, 0))

describe('monoku-os server', () => {
  it('on-open: the job never reads, opening the view does', async () => {
    const s = stub({ when: 'on-open' })
    await tick(s.ctx)
    expect(s.run).not.toHaveBeenCalled()
    await call('read-if-stale', s.ctx)
    await settle()
    expect(s.run).toHaveBeenCalledTimes(1)
    await call('read-if-stale', s.ctx)
    await settle()
    expect(s.run).toHaveBeenCalledTimes(1)
  })

  it('interval: the job reads, opening the view does not', async () => {
    const s = stub({ when: 'interval' })
    await call('read-if-stale', s.ctx)
    expect(s.run).not.toHaveBeenCalled()
    await tick(s.ctx)
    expect(s.run).toHaveBeenCalledTimes(1)
  })

  it('a failing job is kept as lastError, not thrown', async () => {
    const s = stub({ when: 'interval' })
    s.run.mockResolvedValue({ text: 'nope' })
    await expect(tick(s.ctx)).resolves.toBeUndefined()
    expect(s.store.get('lastError')).toBeTruthy()
  })

  it('/state carries the reading and the CW projects each ticket can start in', async () => {
    const s = stub({ when: 'manual', projects: [{ monoku: 'acme/web', project: 'acme-web' }] })
    s.run.mockResolvedValue(answer({ tickets: [{ id: 42, titulo: 'x', proyecto: 'acme/web' }, { id: 7, titulo: 'y', proyecto: 'beta/app' }] }))
    await call('refresh', s.ctx)
    const st = await route('/state').handler({ params: {}, query: {}, body: undefined }, s.ctx)
    expect(st).toMatchObject({ mode: 'manual', inFlight: false, lastError: null, projectsFor: { 42: ['acme-web'], 7: [] }, reading: { tickets: [{ numero: 42 }, { numero: 7 }] } })
  })

  it('answer is external', () => {
    expect(server.actions!.find(a => a.id === 'answer')!.effect).toBe('external')
  })
})
