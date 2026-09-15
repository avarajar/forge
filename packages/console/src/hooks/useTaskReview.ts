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

export const reviewKeyOf = (s: CWSession): string => `${s.project}::${sessionDirOf(s)}`

export function loadReviewState(session: CWSession, fresh = false): Promise<ReviewEntry> {
  const key = reviewKeyOf(session)
  const pending = inFlight.get(key)
  if (pending && !fresh) return pending

  const url = `/api/cw/review-state/${encodeURIComponent(session.project)}/${encodeURIComponent(sessionDirOf(session))}${fresh ? '?fresh=1' : ''}`
  const request: Promise<ReviewEntry> = fetch(url)
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

export function useTaskReview(session: CWSession, { poll = false }: { poll?: boolean } = {}): ReviewEntry | null {
  const key = reviewKeyOf(session)
  const epoch = reviewEpoch.value
  useEffect(() => {
    void loadReviewState(session)
    if (!poll) return
    const timer = setInterval(() => { void loadReviewState(session, true) }, POLL_MS)
    return () => clearInterval(timer)
  }, [key, poll, epoch])
  return reviewEntries.value[key] ?? null
}
