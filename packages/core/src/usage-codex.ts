import { spawn } from 'node:child_process'
import type { UsageWindow } from './cw-types.js'
import { envWithoutHarness } from './cw-doctor.js'
import { severityOf, windowLabel, obj, num, type Json, type UsageProbe } from './usage-window.js'

const TIMEOUT_MS = 20_000
const KILL_GRACE_MS = 2000
const READ_ID = 2

const CHILD_ENV = envWithoutHarness()

export function mapCodexUsage(payload: Json): UsageWindow[] {
  const limits = obj(payload.rateLimits)
  return (['primary', 'secondary'] as const).flatMap((key): UsageWindow[] => {
    const window = obj(limits?.[key])
    const percent = num(window?.usedPercent)
    if (percent === null) return []
    const resetsAt = num(window?.resetsAt)
    return [{
      label: windowLabel(num(window?.windowDurationMins)),
      percent,
      resetsAt: resetsAt === null ? null : new Date(resetsAt * 1000).toISOString(),
      severity: severityOf(percent),
      scope: null,
    }]
  })
}

// Codex has no usage endpoint; its app server answers the same JSON-RPC call the TUI makes
export function callCodexAppServer(bin: string, codexHome: string, timeoutMs = TIMEOUT_MS): Promise<Json> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, ['app-server'], { env: { ...CHILD_ENV, CODEX_HOME: codexHome }, stdio: ['pipe', 'pipe', 'ignore'] })
    let buffer = ''
    let settled = false

    const stop = () => {
      settled = true
      clearTimeout(timer)
      child.stdin.end()
      child.kill()
      setTimeout(() => child.kill('SIGKILL'), KILL_GRACE_MS).unref()
    }
    const fail = (err: Error) => { if (!settled) { stop(); reject(err) } }
    const done = (value: Json) => { if (!settled) { stop(); resolve(value) } }

    const timer = setTimeout(() => fail(new Error(`codex app-server did not answer in ${timeoutMs / 1000} s`)), timeoutMs)

    child.on('error', fail)
    child.on('exit', () => fail(new Error('codex app-server exited before answering')))

    child.stdout.setEncoding('utf-8')
    child.stdout.on('data', (chunk: string) => {
      buffer += chunk
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        let message: { id?: unknown; result?: unknown; error?: { message?: unknown } }
        try {
          message = JSON.parse(line) as typeof message
        } catch {
          continue
        }
        if (message.id !== READ_ID) continue
        if (message.error) return fail(new Error(String(message.error.message ?? 'codex app-server returned an error')))
        return done(obj(message.result) ?? {})
      }
    })

    const send = (message: unknown) => child.stdin.write(`${JSON.stringify(message)}\n`)
    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { clientInfo: { name: 'forge', title: 'Forge', version: '0.1.0' } } })
    send({ jsonrpc: '2.0', method: 'initialized', params: {} })
    send({ jsonrpc: '2.0', id: READ_ID, method: 'account/rateLimits/read', params: {} })
  })
}

export interface CodexUsageDeps {
  callAppServer?: (bin: string, codexHome: string) => Promise<Json>
}

export async function probeCodexUsage(bin: string, codexHome: string, deps: CodexUsageDeps = {}): Promise<UsageProbe> {
  const call = deps.callAppServer ?? callCodexAppServer
  try {
    const windows = mapCodexUsage(await call(bin, codexHome))
    if (windows.length === 0) return { state: 'not_connected', windows: [], detail: null }
    return { state: 'ok', windows, detail: null }
  } catch (err) {
    return { state: 'error', windows: [], detail: err instanceof Error ? err.message : String(err) }
  }
}
