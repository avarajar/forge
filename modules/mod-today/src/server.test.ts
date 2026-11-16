import { describe, it, expect } from 'vitest'
import type { ForgeContext } from '@forge-dev/sdk'
import server from './server'

describe('today routes', () => {
  it('lists the CW project names for the picker', async () => {
    const route = server.routes?.find(r => r.path === '/projects')
    const ctx = { projects: { list: async () => [{ name: 'forge', path: '/p/forge' }, { name: 'cw', path: '/p/cw' }] } } as unknown as ForgeContext
    expect(await route!.handler({ params: {}, query: {}, body: undefined }, ctx)).toEqual({ projects: ['forge', 'cw'] })
  })
})
