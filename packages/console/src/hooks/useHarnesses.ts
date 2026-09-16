import { signal } from '@preact/signals'
import type { Capability, CWDoctor } from '@forge-dev/core'

export type HarnessesResponse =
  | {
      available: true
      doctor: CWDoctor
      capabilities: Record<string, Capability[]>
      contextTokens: { linear: boolean; notion: boolean }
    }
  | { available: false; reason: string }

export const harnesses = signal<HarnessesResponse | null>(null)

// cw doctor --json is slow, so polling never runs faster than this
const POLL_MS = 3000

let inFlight: Promise<HarnessesResponse> | null = null

export function loadHarnesses(fresh = false): Promise<HarnessesResponse> {
  if (inFlight) return inFlight
  inFlight = fetch(`/api/cw/harnesses${fresh ? '?fresh=1' : ''}`)
    .then(r => r.json() as Promise<HarnessesResponse>)
    .catch((): HarnessesResponse => ({ available: false, reason: 'Could not reach the Forge server' }))
    .then((result) => {
      harnesses.value = result
      inFlight = null
      return result
    })
  return inFlight
}

interface Watcher {
  check: (doctor: CWDoctor) => boolean
  deadline: number
  onDone: (matched: boolean) => void
}

const watchers = new Set<Watcher>()
let timer: ReturnType<typeof setInterval> | null = null

const stopTimerIfIdle = () => {
  if (watchers.size === 0 && timer) {
    clearInterval(timer)
    timer = null
  }
}

const tick = async () => {
  const result = await loadHarnesses(true)
  const now = Date.now()
  for (const watcher of watchers) {
    const matched = result.available && watcher.check(result.doctor)
    if (matched || now > watcher.deadline) {
      watchers.delete(watcher)
      watcher.onDone(matched)
    }
  }
  stopTimerIfIdle()
}

export function watchUntil(
  check: (doctor: CWDoctor) => boolean,
  { timeoutMs = 600_000, onDone = () => {} }: { timeoutMs?: number; onDone?: (matched: boolean) => void } = {},
): () => void {
  const watcher: Watcher = { check, deadline: Date.now() + timeoutMs, onDone }
  watchers.add(watcher)
  if (!timer) timer = setInterval(tick, POLL_MS)
  return () => {
    watchers.delete(watcher)
    stopTimerIfIdle()
  }
}

export const supportsIn = (response: HarnessesResponse | null, harness: string, cap: Capability): boolean =>
  Boolean(response?.available && response.capabilities[harness]?.includes(cap))

// a Linear or Notion link only reaches TASK_NOTES.md through the harness MCP or a CW token
export const ticketSourceOf = (input: string): 'linear' | 'notion' | null =>
  /linear\.app/.test(input) ? 'linear' : /notion\.(so|site)/.test(input) ? 'notion' : null

export const missingTicketToken = (response: HarnessesResponse | null, harness: string, input: string): boolean => {
  const source = ticketSourceOf(input)
  return Boolean(response?.available && source && !supportsIn(response, harness, 'mcp') && !response.contextTokens[source])
}
