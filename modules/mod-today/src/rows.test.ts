import { describe, it, expect } from 'vitest'
import { accountToken, dayLabel, dayName, readLine, foldedNow, isToday, shortDay } from './rows'
import { pendingByAccount, titleFor, whoOf, byAccount, failedLine, notesLine, opFor, groupLine, groupProblems, problemsLabel, projectsFor } from './ops'
import type { Digest, Item, PendingItem } from './digest'

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

describe('problems', () => {
  it('groups an account\'s problems on one line and keeps the reasons', () => {
    const groups = groupProblems([
      { account: 'meridian', source: 'linear', reason: 'unavailable' },
      { account: 'meridian', source: 'slack', reason: 'still connecting' },
      { account: 'a', source: 'reader', reason: 'boom' },
      { account: 'b', source: 'slack', reason: 'down' },
    ])
    expect(groups.map(groupLine)).toEqual(['meridian · Slack and Linear did not respond', 'a · Reader did not respond', 'b · Slack did not respond'])
    expect(groups[0].reasons).toEqual(['Linear: unavailable', 'Slack: still connecting'])
  })

  it('counts them for the folded line', () => {
    expect(problemsLabel(1)).toBe('⚠ 1 account problem')
    expect(problemsLabel(2)).toBe('⚠ 2 account problems')
  })
})

describe('row copy', () => {
  it('drops the issue key the chip already shows', () => {
    expect(titleFor({ issueKey: 'MOB-213', title: 'MOB-213: Fix login' })).toBe('Fix login')
    expect(titleFor({ issueKey: 'MOB-213', title: 'MOB-213 Fix login' })).toBe('Fix login')
    expect(titleFor({ issueKey: 'MOB-213', title: 'Fix MOB-213 login' })).toBe('Fix MOB-213 login')
    expect(titleFor({ issueKey: 'MOB-213', title: 'MOB-213' })).toBe('MOB-213')
    expect(titleFor({ title: 'MOB-213: Fix' })).toBe('MOB-213: Fix')
  })

  it('shows no author when it is the source itself or empty', () => {
    expect(whoOf({ who: 'Linear', source: 'linear' })).toBeNull()
    expect(whoOf({ who: ' ', source: 'slack' })).toBeNull()
    expect(whoOf({ who: 'Ana', source: 'linear' })).toBe('Ana')
  })
})

describe('window and day names', () => {
  const d = (over: Partial<Digest>) => ({ readAt: new Date(2026, 10, 16, 18, 15).toISOString(), since: new Date(2026, 10, 15, 13, 5).toISOString(), ...over }) as Digest

  it('names the previous reading for a refresh and yesterday for a first reading', () => {
    expect(readLine(d({ windowStart: new Date(2026, 10, 16, 13, 5).toISOString() }))).toBe('Read at 6:15 PM · changes since 1:05 PM')
    expect(readLine(d({ windowStart: new Date(2026, 10, 15, 13, 5).toISOString() }))).toBe('Read at 6:15 PM · changes since yesterday 1:05 PM')
    expect(readLine(d({}))).toBe('Read at 6:15 PM · changes since yesterday 1:05 PM')
  })

  it('shows the day as weekday and number', () => {
    expect(dayName('2026-11-16')).toBe('Monday 16')
  })
})

describe('pendingByAccount', () => {
  const p = (id: string, account?: string) => ({ id, account }) as PendingItem

  it('is one block for a single account and empty for nothing', () => {
    expect(pendingByAccount([])).toEqual([])
    expect(pendingByAccount([p('a', 'monoku'), p('b')])).toEqual([{ items: [p('a', 'monoku'), p('b')] }])
  })

  it('splits by account with the unowned ones last', () => {
    const blocks = pendingByAccount([p('a', 'monoku'), p('b'), p('c', 'meridian'), p('d', 'monoku')])
    expect(blocks.map(b => [b.account, b.items.map(i => i.id)])).toEqual([['monoku', ['a', 'd']], ['meridian', ['c']], [undefined, ['b']]])
  })
})
