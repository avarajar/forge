import { describe, it, expect } from 'vitest'
import { accountToken, dayLabel, foldedNow, isToday, shortDay } from './rows'
import { byAccount, failedLine, notesLine, opFor, projectsFor } from './ops'
import type { Item } from './digest'

const item = (state: Item['state']) => ({ state }) as Item

describe('dayLabel', () => {
  it('greets for today', () => {
    expect(dayLabel(new Date(2026, 10, 15, 9), '2026-11-15')).toBe('Good morning · your Sunday 15')
  })

  it('names the day of an older digest', () => {
    expect(dayLabel(new Date(2026, 10, 15, 9), '2026-11-14')).toBe('From Saturday 14')
  })
})

describe('isToday', () => {
  it('compares local days', () => {
    expect(isToday('2026-11-15', new Date(2026, 10, 15, 23, 59))).toBe(true)
    expect(isToday('2026-11-14', new Date(2026, 10, 15, 0, 1))).toBe(false)
  })
})

describe('foldedNow', () => {
  it('folds once nothing waits for the person', () => {
    expect(foldedNow(false, [item('done'), item('dismissed')])).toBe(true)
  })

  it('stays open while an item is proposed or failed', () => {
    expect(foldedNow(false, [item('done'), item('failed')])).toBe(false)
    expect(foldedNow(false, [item('proposed')])).toBe(false)
  })

  it('keeps a fold the person asked for', () => {
    expect(foldedNow(true, [item('proposed')])).toBe(true)
  })
})

describe('opFor review', () => {
  it('a review starts once a project is known', () => {
    const review = { kind: 'review' } as Item
    expect(opFor(review)).toBeNull()
    expect(opFor(review, 'forge')).toBe('start')
    expect(opFor({ kind: 'review', project: 'forge' } as Item)).toBe('start')
  })
})

describe('reading lines', () => {
  it('a failure says the reading failed and notes are listed as they are', () => {
    expect(failedLine('boom')).toBe('Last reading failed: boom')
    expect(notesLine(['GitHub: gh is not signed in', 'x'])).toBe('GitHub: gh is not signed in · x')
    expect(notesLine(undefined)).toBeNull()
    expect(notesLine([])).toBeNull()
  })
})

describe('shortDay', () => {
  it('says Today for today or no digest, and names an older day', () => {
    const now = new Date(2026, 10, 15, 9)
    expect(shortDay(now, '2026-11-15')).toBe('Today')
    expect(shortDay(now)).toBe('Today')
    expect(shortDay(now, '2026-11-14')).toBe('From Saturday 14')
  })
})

describe('accounts in the views', () => {
  const at = (account: string | undefined, kind: Item['kind'] = 'request') => ({ state: 'proposed', kind, account }) as Item

  it('an account always gets the same theme token', () => {
    expect(accountToken('monoku')).toBe(accountToken('monoku'))
    expect(['--blue', '--purple', '--orange', '--green', '--teal']).toContain(accountToken('meridian'))
  })

  it('the page groups by account, then kind, only when there are two or more', () => {
    expect(byAccount([at('a'), at('a', 'research')])).toEqual([{ sections: expect.any(Array) }])
    const blocks = byAccount([at('a'), at('b', 'research'), at(undefined)])
    expect(blocks.map(b => b.account)).toEqual(['a', 'b', undefined])
    expect(blocks[1].sections.map(s => s.title)).toEqual(['Researching'])
  })

  it('the project picker lists the item\'s account and unowned projects', () => {
    const owners = { forge: 'monoku', atlas: 'meridian' }
    expect(projectsFor({ names: ['forge', 'atlas', 'misc'], owners }, 'meridian')).toEqual(['atlas', 'misc'])
    expect(projectsFor({ names: ['forge', 'atlas'], owners })).toEqual(['forge', 'atlas'])
  })
})
