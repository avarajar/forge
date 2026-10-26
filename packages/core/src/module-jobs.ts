import type { ForgeContext, JobDef } from '@forge-dev/sdk'

const MIN_MS = 30_000
const UNITS: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000 }

export function parseEvery(text: string): number {
  const m = /^(\d+)(s|m|h)$/.exec(text.trim())
  if (!m) throw new Error('every must look like 30s, 2m or 1h')
  const ms = Number(m[1]) * UNITS[m[2]]
  if (ms < MIN_MS) throw new Error('every must be at least 30s')
  return ms
}

interface Entry {
  timer?: ReturnType<typeof setInterval>
  running?: { abort: AbortController; startedAt: number }
  lastError: string | null
}

// one run at a time per job; a run still going when its next tick comes is cut off
export class JobScheduler {
  private entries = new Map<string, Entry[]>()

  constructor(private readonly opts: { onResult: (moduleId: string, jobId: string, error: string | null) => void }) {}

  start(moduleId: string, job: JobDef, ctx: ForgeContext): void {
    let ms: number
    try {
      ms = parseEvery(job.every)
    } catch (err) {
      this.opts.onResult(moduleId, job.id, (err as Error).message)
      return
    }
    if (job.enabled && !job.enabled(ctx.settings)) return

    const entry: Entry = { lastError: null }
    const report = (error: string | null) => {
      if (error === entry.lastError) return
      entry.lastError = error
      this.opts.onResult(moduleId, job.id, error)
    }

    const tick = () => {
      if (entry.running) {
        if (Date.now() - entry.running.startedAt < ms) return
        entry.running.abort.abort()
        entry.running = undefined
        report(`timed out after ${ms / 1000}s`)
      }
      const run = { abort: new AbortController(), startedAt: Date.now() }
      entry.running = run
      const jobCtx = Object.assign(Object.create(ctx) as ForgeContext, { signal: run.abort.signal })
      Promise.resolve()
        .then(() => job.run(jobCtx))
        .then(
          () => { if (entry.running === run) { entry.running = undefined; report(null) } },
          (err: unknown) => { if (entry.running === run) { entry.running = undefined; report(err instanceof Error ? err.message : String(err)) } },
        )
    }

    entry.timer = setInterval(tick, ms)
    const list = this.entries.get(moduleId) ?? []
    list.push(entry)
    this.entries.set(moduleId, list)
    tick()
  }

  stopModule(moduleId: string): void {
    for (const entry of this.entries.get(moduleId) ?? []) {
      clearInterval(entry.timer)
      entry.running?.abort.abort()
      entry.running = undefined
    }
    this.entries.delete(moduleId)
  }
}
