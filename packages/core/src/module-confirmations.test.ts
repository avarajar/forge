import { describe, it, expect } from 'vitest'
import { Confirmations, inputHash } from './module-confirmations.js'

const confirmation = { title: 'Send', confirmLabel: 'Send', plan: { ids: ['a'] } }

describe('Confirmations', () => {
  it('returns the stored confirmation once', () => {
    const store = new Confirmations()
    const token = store.issue('m', 'send', 'h1', confirmation)
    expect(store.take(token, 'm', 'send', 'h1')).toEqual(confirmation)
    expect(store.take(token, 'm', 'send', 'h1')).toBeNull()
  })

  it('refuses another module, action or input', () => {
    const store = new Confirmations()
    const t1 = store.issue('m', 'send', 'h1', confirmation)
    expect(store.take(t1, 'm', 'send', 'h2')).toBeNull()
    const t2 = store.issue('m', 'send', 'h1', confirmation)
    expect(store.take(t2, 'other', 'send', 'h1')).toBeNull()
    const t3 = store.issue('m', 'send', 'h1', confirmation)
    expect(store.take(t3, 'm', 'other', 'h1')).toBeNull()
  })

  it('expires after 120 s', () => {
    let now = 0
    const store = new Confirmations(() => now)
    const token = store.issue('m', 'send', 'h1', confirmation)
    now = 120_001
    expect(store.take(token, 'm', 'send', 'h1')).toBeNull()
  })

  it('a wrong token never matches', () => {
    expect(new Confirmations().take('nope', 'm', 'send', 'h1')).toBeNull()
  })
})

describe('inputHash', () => {
  it('ignores key order', () => {
    expect(inputHash({ a: 1, b: [1, { c: 2, d: 3 }] })).toBe(inputHash({ b: [1, { d: 3, c: 2 }], a: 1 }))
  })

  it('differs for different input', () => {
    expect(inputHash({ id: 'a' })).not.toBe(inputHash({ id: 'b' }))
  })
})
