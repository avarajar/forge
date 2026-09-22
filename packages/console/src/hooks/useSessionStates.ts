import { signal } from '@preact/signals'
import type { SessionStateEntry } from '@forge-dev/core'
import { needsYou } from '../config/types.js'

export const sessionStates = signal<Record<string, SessionStateEntry>>({})

// the session on screen right now; it never notifies
export const activeSessionKey = signal<string | null>(null)

const VISIBLE_MS = 2000
// a hidden tab still polls, or the notification would wait for the user to come back
const HIDDEN_MS = 15_000

type Listener = (key: string, entry: SessionStateEntry) => void

let timer: ReturnType<typeof setInterval> | null = null
let lastLoad = 0
let inFlight = false
const listeners = new Set<Listener>()

// `since` moves on every change, so a working spell between two polls still counts as a new wait
const becameUrgent = (prev: SessionStateEntry | undefined, next: SessionStateEntry): boolean =>
  Boolean(prev) && needsYou(next) && (prev!.state !== next.state || prev!.since !== next.since)

async function load(): Promise<void> {
  if (inFlight) return
  inFlight = true
  lastLoad = Date.now()
  try {
    const res = await fetch('/api/cw/session-states')
    if (!res.ok) return
    const { states } = await res.json() as { states: Record<string, SessionStateEntry> }
    const prev = sessionStates.value
    sessionStates.value = states
    for (const [key, entry] of Object.entries(states)) {
      if (becameUrgent(prev[key], entry)) for (const listener of listeners) listener(key, entry)
    }
  } catch {
    // the server restarting is not worth a toast; the next poll catches up
  } finally {
    inFlight = false
  }
}

const tick = () => {
  const every = document.visibilityState === 'visible' ? VISIBLE_MS : HIDDEN_MS
  if (Date.now() - lastLoad >= every - 100) void load()
}

// listens for sessions that start needing the user; polling runs while anyone listens
export function watchSessionStates(listener: Listener): () => void {
  listeners.add(listener)
  if (!timer) {
    void load()
    timer = setInterval(tick, VISIBLE_MS)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer) {
      clearInterval(timer)
      timer = null
    }
  }
}
