import type { UsageSeverity, UsageState, UsageWindow } from './cw-types.js'

export interface UsageProbe {
  state: UsageState
  windows: UsageWindow[]
  detail: string | null
}

const WARNING_AT = 70
const CRITICAL_AT = 90

export function severityOf(percent: number): UsageSeverity {
  if (percent >= CRITICAL_AT) return 'critical'
  if (percent >= WARNING_AT) return 'warning'
  return 'normal'
}

const MINS_PER_HOUR = 60
const MINS_PER_DAY = 1440

export function windowLabel(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return ''
  if (minutes % MINS_PER_DAY === 0) return `${minutes / MINS_PER_DAY} d`
  if (minutes % MINS_PER_HOUR === 0) return `${minutes / MINS_PER_HOUR} h`
  return `${minutes} min`
}

export const severityFrom = (value: unknown, percent: number): UsageSeverity =>
  value === 'normal' || value === 'warning' || value === 'critical' ? value : severityOf(percent)

export type Json = Record<string, unknown>

export const obj = (value: unknown): Json | null => (value && typeof value === 'object' && !Array.isArray(value) ? value as Json : null)
export const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)
export const str = (value: unknown): string | null => (typeof value === 'string' && value ? value : null)
