import type { ModuleSettings } from '@forge-dev/sdk'

export type Mode = 'on-open' | 'interval' | 'daily' | 'manual'
export type Trigger = 'job' | 'open'

export interface Schedule { mode: Mode; everyMs: number; time: string }

const MODES: Mode[] = ['on-open', 'interval', 'daily', 'manual']

export function scheduleOf(s: ModuleSettings): Schedule {
  const mode = MODES.includes(s.when as Mode) ? (s.when as Mode) : 'on-open'
  const every = typeof s.every === 'number' && s.every >= 5 ? s.every : 30
  const time = typeof s.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s.time) ? s.time : '08:00'
  return { mode, everyMs: every * 60_000, time }
}

const localDay = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

// whether a reading is due; lastAt is the last attempt, so a failing reader is not asked again at once
export function dueBy(s: Schedule, trigger: Trigger, now: Date, lastAt?: string): boolean {
  const last = lastAt ? new Date(lastAt) : undefined
  const stale = !last || Number.isNaN(last.getTime()) || now.getTime() - last.getTime() >= s.everyMs
  switch (s.mode) {
    case 'manual':
      return false
    case 'on-open':
      return trigger === 'open' && stale
    case 'interval':
      return trigger === 'job' && stale
    case 'daily': {
      if (trigger !== 'job') return false
      if (last && !Number.isNaN(last.getTime()) && localDay(last) === localDay(now)) return false
      const [h, m] = s.time.split(':').map(Number)
      return now.getHours() * 60 + now.getMinutes() >= h * 60 + m
    }
  }
}
