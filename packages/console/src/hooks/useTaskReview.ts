import { signal } from '@preact/signals'
import { useEffect } from 'preact/hooks'
import type { CWSession, TaskReviewState } from '@forge-dev/core'
import { sessionDirOf } from '../config/types.js'

export type ReviewEntry = { state: TaskReviewState; error: null } | { state: null; error: string }

export const reviewEntries = signal<Record<string, ReviewEntry>>({})
// bumped when the task list refreshes, so mounted cards fetch again
const reviewEpoch = signal(0)

const POLL_MS = 60_000
const inFlight = new Map<string, Promise<ReviewEntry>>()

// Each review state runs git and gh (about a second), and the task list asks for one per row at once. A browser
// keeps six connections per host, so without a cap every other request (MCPs, banners, Kioku) waits behind them.
// Three at a time leave the rest free; an opened task's request (fresh) goes to the front of the line.
const MAX_CONCURRENT = 3
let running = 0
const waiting: Array<{ key: string; go: () => void }> = []

function slot(key: string, first: boolean): Promise<void> {
  if (running < MAX_CONCURRENT) {
    running++
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    const entry = { key, go: () => { running++; resolve() } }
    if (first) waiting.unshift(entry)
    else waiting.push(entry)
  })
}

// a task opened while its row's request is still in line moves it to the front
function promote(key: string): void {
  const at = waiting.findIndex(w => w.key === key)
  if (at > 0) waiting.unshift(...waiting.splice(at, 1))
}

function release(): void {
  running--
  waiting.shift()?.go()
}

export const reviewKeyOf = (s: CWSession): string => `${s.project}::${sessionDirOf(s)}`

export function loadReviewState(session: CWSession, fresh = false, first = fresh): Promise<ReviewEntry> {
  const key = reviewKeyOf(session)
  const pending = inFlight.get(key)
  if (pending && !fresh) {
    if (first) promote(key)
    return pending
  }

  const url = `/api/cw/review-state/${encodeURIComponent(session.project)}/${encodeURIComponent(sessionDirOf(session))}${fresh ? '?fresh=1' : ''}`
  const request: Promise<ReviewEntry> = slot(key, first)
    .then(() => fetch(url).finally(release))
    .then(async (res): Promise<ReviewEntry> => res.ok
      ? { state: await res.json() as TaskReviewState, error: null }
      : { state: null, error: `Forge could not read this task (HTTP ${res.status})` })
    .catch((): ReviewEntry => ({ state: null, error: 'Could not reach the Forge server' }))
    .then((entry) => {
      reviewEntries.value = { ...reviewEntries.value, [key]: entry }
      if (inFlight.get(key) === request) inFlight.delete(key)
      return entry
    })
  inFlight.set(key, request)
  return request
}

export function refreshReviewStates(): void {
  reviewEpoch.value++
}

// first: the task is open, so its request skips the line of task list rows
export function useTaskReview(session: CWSession, { poll = false, first = false }: { poll?: boolean; first?: boolean } = {}): ReviewEntry | null {
  const key = reviewKeyOf(session)
  const epoch = reviewEpoch.value
  useEffect(() => {
    void loadReviewState(session, false, first)
    if (!poll) return
    const timer = setInterval(() => { void loadReviewState(session, true) }, POLL_MS)
    return () => clearInterval(timer)
  }, [key, poll, first, epoch])
  return reviewEntries.value[key] ?? null
}
