import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { ForgeContext, JobDef } from '@forge-dev/sdk'
import { JobScheduler, parseEvery } from './module-jobs.js'

const ctx = { module: { id: 'm', version: '1' } } as unknown as ForgeContext

describe('parseEvery', () => {
  it('reads seconds, minutes and hours', () => {
    expect(parseEvery('30s')).toBe(30_000)
    expect(parseEvery('2m')).toBe(120_000)
    expect(parseEvery('1h')).toBe(3_600_000)
  })

  it('refuses less than 30 s and nonsense', () => {
    expect(() => parseEvery('10s')).toThrow('at least 30s')
    expect(() => parseEvery('soon')).toThrow('like 30s, 2m or 1h')
  })
})

describe('JobScheduler', () => {
  let errors: Array<[string, string, string | null]>
  let scheduler: JobScheduler

  beforeEach(() => {
    vi.useFakeTimers()
    errors = []
    scheduler = new JobScheduler({ onResult: (m, j, e) => errors.push([m, j, e]) })
  })

  afterEach(() => {
    scheduler.stopAll()
    vi.useRealTimers()
  })

  it('runs at once and then every interval', async () => {
    const run = vi.fn(async () => {})
    scheduler.start('m', { id: 'watch', every: '1m', run }, ctx, {})
    await vi.advanceTimersByTimeAsync(0)
    expect(run).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(120_000)
    expect(run).toHaveBeenCalledTimes(3)
  })

  it('skips a tick while the previous run is going', async () => {
    let release!: () => void
    const run = vi.fn(() => new Promise<void>(r => { release = r }))
    scheduler.start('m', { id: 'watch', every: '1m', run }, ctx, {})
    await vi.advanceTimersByTimeAsync(30_000)
    await vi.advanceTimersByTimeAsync(20_000)
    expect(run).toHaveBeenCalledTimes(1)
    release()
  })

  it('times out a run at the interval and records the error', async () => {
    let seen: AbortSignal | undefined
    const run = vi.fn((c: { signal: AbortSignal }) => { seen ??= c.signal; return new Promise<void>(() => {}) })
    scheduler.start('m', { id: 'watch', every: '1m', run }, ctx, {})
    await vi.advanceTimersByTimeAsync(60_000)
    expect(seen?.aborted).toBe(true)
    expect(errors).toContainEqual(['m', 'watch', 'timed out after 60s'])
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('records a throw and clears it after a good run', async () => {
    let fail = true
    const run = vi.fn(async () => { if (fail) throw new Error('Harvey said no') })
    scheduler.start('m', { id: 'watch', every: '1m', run }, ctx, {})
    await vi.advanceTimersByTimeAsync(0)
    fail = false
    await vi.advanceTimersByTimeAsync(60_000)
    expect(errors).toEqual([['m', 'watch', 'Harvey said no'], ['m', 'watch', null]])
  })

  it('job not scheduled when enabled() is false', async () => {
    const run = vi.fn(async () => {})
    const job: JobDef = { id: 'watch', every: '1m', enabled: s => (s.instances as unknown[]).length > 0, run }
    scheduler.start('m', job, ctx, { instances: [] })
    await vi.advanceTimersByTimeAsync(120_000)
    expect(run).not.toHaveBeenCalled()
  })

  it('reload aborts the running job and schedules once', async () => {
    let first: AbortSignal | undefined
    const run = vi.fn((c: { signal: AbortSignal }) => { first ??= c.signal; return new Promise<void>(() => {}) })
    const job: JobDef = { id: 'watch', every: '1m', run }
    scheduler.start('m', job, ctx, {})
    await vi.advanceTimersByTimeAsync(0)
    scheduler.stopModule('m')
    expect(first?.aborted).toBe(true)
    scheduler.start('m', job, ctx, {})
    await vi.advanceTimersByTimeAsync(0)
    expect(run).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('a bad interval is reported, not thrown', () => {
    scheduler.start('m', { id: 'fast', every: '1s', run: async () => {} }, ctx, {})
    expect(errors).toEqual([['m', 'fast', 'every must be at least 30s']])
  })
})
