import { describe, it, expect } from 'vitest'
import type { ActionContext, ForgeContext } from '@forge-dev/sdk'
import server, { hello, count } from './server.js'

const ctx = { settings: { greeting: 'Hi' } } as unknown as ForgeContext

describe('__ID__ server', () => {
  it('exports its routes and actions', () => {
    expect(server.routes).toContain(hello)
    expect(server.actions).toContain(count)
  })

  it('greets with the configured greeting', async () => {
    expect(await hello.handler({ params: {}, query: {}, body: undefined }, ctx)).toEqual({ message: 'Hi' })
  })

  it('counts up', async () => {
    const run = count.run as (input: { n?: number }, c: ActionContext) => Promise<{ n: number }>
    expect(await run({ n: 2 }, ctx as ActionContext)).toEqual({ n: 3 })
  })
})
