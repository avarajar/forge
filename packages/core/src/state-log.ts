import { mkdirSync } from 'node:fs'
import { appendFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'
import type { RemoteCall } from './session-state.js'
import { jevScreen } from './state-classifier-jev.js'

// One JSON line per remote classifier call, to compare it with the local rules over days.
// The screen is what the remote classifier saw, so the log holds terminal text: it stays on this machine.

export function expandHome(path: string): string {
  return path === '~' || path.startsWith('~/') ? homedir() + path.slice(1) : path
}

export function stateLogLine(call: RemoteCall): string {
  return JSON.stringify({
    at: new Date(call.at).toISOString(),
    key: call.key,
    harness: call.harness,
    outcome: call.outcome,
    local: { state: call.local.state, confidence: call.local.confidence },
    remote: call.remote && { state: call.remote.state, confidence: call.remote.confidence },
    error: call.error,
    latencyMs: call.latencyMs,
    screen: jevScreen(call.text),
  }) + '\n'
}

export function createStateLog(path: string, onError: (err: Error) => void = () => {}): (call: RemoteCall) => void {
  const file = resolve(expandHome(path))
  mkdirSync(dirname(file), { recursive: true })
  // writes run one after another so lines keep the order of the calls
  let queue = Promise.resolve()
  return (call) => {
    const line = stateLogLine(call)
    queue = queue.then(() => appendFile(file, line)).catch((err: unknown) => onError(err instanceof Error ? err : new Error(String(err))))
  }
}
