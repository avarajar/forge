import { signal } from '@preact/signals'
import type { AccountUsage } from '@forge-dev/core'

export type UsageResponse =
  | { available: true; usage: AccountUsage[] }
  | { available: false; reason: string }

export const usage = signal<UsageResponse | null>(null)

// the server caches for 50 s, and a limit never moves fast enough to need more
const POLL_MS = 60_000

let inFlight: Promise<UsageResponse> | null = null
let timer: ReturnType<typeof setInterval> | null = null
let watchers = 0

export function loadUsage(fresh = false): Promise<UsageResponse> {
  if (inFlight) return inFlight
  inFlight = fetch(`/api/cw/usage${fresh ? '?fresh=1' : ''}`)
    .then(r => r.json() as Promise<UsageResponse>)
    .catch((): UsageResponse => ({ available: false, reason: 'Could not reach the Forge server' }))
    .then((result) => {
      usage.value = result
      inFlight = null
      return result
    })
  return inFlight
}

// every view that shows limits shares one poll
export function watchUsage(): () => void {
  watchers += 1
  void loadUsage()
  // a plain poll goes through the server cache, so extra tabs never multiply the codex spawns
  if (!timer) timer = setInterval(() => { if (document.visibilityState === 'visible') void loadUsage() }, POLL_MS)
  return () => {
    watchers -= 1
    if (watchers === 0 && timer) {
      clearInterval(timer)
      timer = null
    }
  }
}

export const usageFor = (account: string, harness: string): AccountUsage | null =>
  (usage.value?.available ? usage.value.usage.find(u => u.account === account && u.harness === harness) : null) ?? null
