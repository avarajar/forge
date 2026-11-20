import { describe, it, expect } from 'vitest'
import { dueBy, scheduleOf } from './schedule'

const at = (h: number, m = 0) => new Date(2026, 10, 19, h, m)
const iso = (d: Date) => d.toISOString()

describe('scheduleOf', () => {
  it('falls back to on-open, 30 min, 08:00', () => {
    expect(scheduleOf({})).toEqual({ mode: 'on-open', everyMs: 30 * 60_000, time: '08:00' })
    expect(scheduleOf({ when: 'daily', every: 10, time: '09:30' })).toEqual({ mode: 'daily', everyMs: 10 * 60_000, time: '09:30' })
  })
})

describe('dueBy', () => {
  const s = (mode: string) => scheduleOf({ when: mode, every: 30, time: '08:00' })

  it('manual never reads on its own', () => {
    expect(dueBy(s('manual'), 'job', at(9))).toBe(false)
    expect(dueBy(s('manual'), 'open', at(9))).toBe(false)
  })

  it('on-open reads on open when never read or older than every', () => {
    expect(dueBy(s('on-open'), 'open', at(9))).toBe(true)
    expect(dueBy(s('on-open'), 'open', at(9), iso(at(8, 45)))).toBe(false)
    expect(dueBy(s('on-open'), 'open', at(9), iso(at(8, 30)))).toBe(true)
    expect(dueBy(s('on-open'), 'job', at(9))).toBe(false)
  })

  it('interval reads from the job every N minutes', () => {
    expect(dueBy(s('interval'), 'job', at(9), iso(at(8, 45)))).toBe(false)
    expect(dueBy(s('interval'), 'job', at(9), iso(at(8, 30)))).toBe(true)
    expect(dueBy(s('interval'), 'open', at(9))).toBe(false)
  })

  it('daily reads once, at or after the time', () => {
    expect(dueBy(s('daily'), 'job', at(7, 59))).toBe(false)
    expect(dueBy(s('daily'), 'job', at(8))).toBe(true)
    expect(dueBy(s('daily'), 'job', at(15), iso(at(8, 1)))).toBe(false)
    expect(dueBy(s('daily'), 'job', at(8), iso(new Date(2026, 10, 18, 8)))).toBe(true)
  })
})
