import { describe, it, expect } from 'vitest'
import { dayLabel, foldedNow, isToday } from './rows'
import { opFor } from './ops'
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

describe('readingProblem', () => {
  it('a GitHub note is not called a failed reading', async () => {
    const { readingProblem } = await import('./ops')
    expect(readingProblem('GitHub: gh is not signed in')).toBe('GitHub: gh is not signed in')
    expect(readingProblem('boom')).toBe('Last reading failed: boom')
  })
})
