import { classifyLocal } from './state-classifier-local.js'
import { createJevClassifier } from './state-classifier-jev.js'
import { terminalText, type Classification, type SessionState, type StateClassifier } from './state-classifier.js'

// Holds the state of every live terminal. It sees each output chunk but only classifies once the
// output settles, so a remote classifier is asked at most once per pause, never per chunk.

export interface SessionStateEntry {
  state: SessionState
  confidence: number
  since: number
  source: string
  exitCode?: number
}

export interface StateTrackerOptions {
  remote?: StateClassifier | null
  // quiet time before the screen is read
  settleMs?: number
  // continuous output this long means working, whatever was on screen before
  burstMs?: number
  // local answers at or above this are not sent to the remote classifier
  localTrust?: number
  // remote answers below this are ignored
  remoteMin?: number
  keepExitedMs?: number
  onError?: (err: Error) => void
}

const TAIL_CHARS = 32_000

interface Tracked {
  harness: string
  raw: string
  lastOutputAt: number
  burstStart: number | null
  version: number
  timer: ReturnType<typeof setTimeout> | null
  askedText: string | null
  entry: SessionStateEntry
  exitedAt: number | null
}

export class StateTracker {
  private sessions = new Map<string, Tracked>()
  private readonly remote: StateClassifier | null
  private readonly settleMs: number
  private readonly burstMs: number
  private readonly localTrust: number
  private readonly remoteMin: number
  private readonly keepExitedMs: number
  private readonly onError: (err: Error) => void

  constructor(options: StateTrackerOptions = {}) {
    this.remote = options.remote ?? null
    this.settleMs = options.settleMs ?? 1500
    this.burstMs = options.burstMs ?? 2000
    this.localTrust = options.localTrust ?? 0.9
    this.remoteMin = options.remoteMin ?? 0.6
    this.keepExitedMs = options.keepExitedMs ?? 10 * 60 * 1000
    this.onError = options.onError ?? (() => {})
  }

  get remoteName(): string | null {
    return this.remote?.name ?? null
  }

  track(key: string, harness: string): void {
    const now = Date.now()
    this.forget(key)
    const tracked: Tracked = {
      harness, raw: '', lastOutputAt: now, burstStart: now, version: 0, timer: null, askedText: null, exitedAt: null,
      entry: { state: 'working', confidence: 0.6, since: now, source: 'local' },
    }
    this.sessions.set(key, tracked)
    this.schedule(key, tracked)
  }

  output(key: string, chunk: string): void {
    const tracked = this.sessions.get(key)
    if (!tracked || tracked.exitedAt !== null) return
    const now = Date.now()
    tracked.raw = (tracked.raw + chunk).slice(-TAIL_CHARS)
    tracked.lastOutputAt = now
    tracked.version++
    tracked.burstStart ??= now
    if (now - tracked.burstStart >= this.burstMs && tracked.entry.state !== 'working') {
      this.apply(tracked, { state: 'working', confidence: 0.95, source: 'local' })
    }
    this.schedule(key, tracked)
  }

  exit(key: string, exitCode: number): void {
    const tracked = this.sessions.get(key)
    if (!tracked) return
    if (tracked.timer) clearTimeout(tracked.timer)
    tracked.timer = null
    tracked.exitedAt = Date.now()
    tracked.version++
    this.apply(tracked, { state: 'exited', confidence: 1, source: 'local' })
    tracked.entry.exitCode = exitCode
  }

  forget(key: string): void {
    const tracked = this.sessions.get(key)
    if (tracked?.timer) clearTimeout(tracked.timer)
    this.sessions.delete(key)
  }

  snapshot(): Record<string, SessionStateEntry> {
    const now = Date.now()
    const out: Record<string, SessionStateEntry> = {}
    for (const [key, tracked] of this.sessions) {
      if (tracked.exitedAt !== null && now - tracked.exitedAt > this.keepExitedMs) {
        this.sessions.delete(key)
        continue
      }
      out[key] = { ...tracked.entry }
    }
    return out
  }

  dispose(): void {
    for (const key of [...this.sessions.keys()]) this.forget(key)
  }

  private schedule(key: string, tracked: Tracked): void {
    if (tracked.timer) clearTimeout(tracked.timer)
    tracked.timer = setTimeout(() => this.settle(key, tracked), this.settleMs)
  }

  private apply(tracked: Tracked, c: Classification): void {
    if (c.state !== tracked.entry.state) tracked.entry.since = Date.now()
    tracked.entry.state = c.state
    tracked.entry.confidence = c.confidence
    tracked.entry.source = c.source
  }

  private settle(key: string, tracked: Tracked): void {
    tracked.timer = null
    tracked.burstStart = null
    if (this.sessions.get(key) !== tracked || tracked.exitedAt !== null) return
    const input = { text: terminalText(tracked.raw), quietMs: Date.now() - tracked.lastOutputAt, harness: tracked.harness, exitCode: null }
    const local = classifyLocal(input)
    this.apply(tracked, local)
    if (!this.remote || local.confidence >= this.localTrust || !input.text.trim() || input.text === tracked.askedText) return
    tracked.askedText = input.text
    const version = tracked.version
    this.remote.classify(input).then(
      (remote) => {
        if (this.sessions.get(key) !== tracked || tracked.version !== version) return
        if (remote.confidence >= this.remoteMin) this.apply(tracked, remote)
      },
      (err: unknown) => this.onError(err instanceof Error ? err : new Error(String(err))),
    )
  }
}

// Sending terminal text to a remote service is opt-in: the classifier and the key must both be set
export function remoteClassifierFromEnv(env: NodeJS.ProcessEnv = process.env): { remote: StateClassifier | null; warning: string | null } {
  if (env.FORGE_STATE_CLASSIFIER !== 'jev') return { remote: null, warning: null }
  if (!env.TYPESAFE_API_KEY) return { remote: null, warning: 'FORGE_STATE_CLASSIFIER=jev needs TYPESAFE_API_KEY; reading session states with local rules only' }
  return { remote: createJevClassifier({ apiKey: env.TYPESAFE_API_KEY, model: env.FORGE_JEV_MODEL || undefined }), warning: null }
}
