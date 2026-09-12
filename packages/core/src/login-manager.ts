import * as pty from 'node-pty'
import type { IPty } from 'node-pty'
import { envWithoutHarness } from './cw-doctor.js'

export interface LoginState {
  account: string
  harness: string
  status: 'running' | 'exited'
  url: string | null
  code: string | null
  exitCode: number | null
  output: string[]
  startedAt: string
}

export type LoginProcess = Pick<IPty, 'onData' | 'onExit' | 'kill'>
export type SpawnLogin = (file: string, args: string[], options: { cwd: string; env: Record<string, string> }) => LoginProcess

interface Entry {
  state: LoginState
  proc: LoginProcess
  partial: string
  timer: ReturnType<typeof setTimeout> | null
}

const OUTPUT_LINES = 50
const MAX_RUNNING_MS = 15 * 60 * 1000
const KEEP_EXITED_MS = 5 * 60 * 1000
const ANSI_RE = /\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07]*\x07/g
const URL_RE = /^CW_LOGIN_URL=(https?:\/\/\S+)$/
const CODE_RE = /^CW_LOGIN_CODE=([A-Za-z0-9-]{4,64})$/

// A PTY rather than pipes, in case cw or the harness checks for a terminal
const spawnInPty: SpawnLogin = (file, args, options) =>
  pty.spawn(file, args, { name: 'xterm-256color', cols: 120, rows: 40, cwd: options.cwd, env: options.env })

export class LoginManager {
  private entries = new Map<string, Entry>()

  constructor(private cwBin: string, private spawn: SpawnLogin = spawnInPty) {}

  start(account: string, harness: string): LoginState {
    const key = `${account}::${harness}`
    const existing = this.entries.get(key)
    if (existing?.state.status === 'running') return existing.state
    if (existing) this.drop(key)

    const state: LoginState = {
      account, harness, status: 'running', url: null, code: null, exitCode: null, output: [],
      startedAt: new Date().toISOString(),
    }
    const proc = this.spawn(this.cwBin, ['account', 'login', account, '--harness', harness, '--no-browser'], {
      cwd: process.env.HOME ?? process.cwd(),
      env: envWithoutHarness(),
    })
    const entry: Entry = { state, proc, partial: '', timer: null }
    this.entries.set(key, entry)
    proc.onData((data) => this.ingest(entry, data))
    proc.onExit(({ exitCode }) => this.finish(key, entry, exitCode))
    entry.timer = setTimeout(() => this.stop(account, harness), MAX_RUNNING_MS)
    return state
  }

  get(account: string, harness: string): LoginState | undefined {
    return this.entries.get(`${account}::${harness}`)?.state
  }

  stop(account: string, harness: string): void {
    const key = `${account}::${harness}`
    const entry = this.entries.get(key)
    if (!entry || entry.state.status !== 'running') return
    try { entry.proc.kill() } catch {}
    this.finish(key, entry, null)
  }

  dispose(): void {
    for (const [key, entry] of this.entries) {
      if (entry.state.status === 'running') {
        try { entry.proc.kill() } catch {}
      }
      this.drop(key)
    }
  }

  private ingest(entry: Entry, data: string): void {
    const lines = (entry.partial + data).split('\n')
    entry.partial = lines.pop() ?? ''
    for (const raw of lines) this.addLine(entry.state, raw)
  }

  private addLine(state: LoginState, raw: string): void {
    const line = raw.replace(ANSI_RE, '').replace(/\r/g, '').trim()
    if (!line) return
    state.output.push(line)
    if (state.output.length > OUTPUT_LINES) state.output.splice(0, state.output.length - OUTPUT_LINES)
    state.url ??= URL_RE.exec(line)?.[1] ?? null
    state.code ??= CODE_RE.exec(line)?.[1] ?? null
  }

  private finish(key: string, entry: Entry, exitCode: number | null): void {
    if (entry.state.status === 'exited') return
    if (entry.partial) this.addLine(entry.state, entry.partial)
    entry.partial = ''
    entry.state.status = 'exited'
    entry.state.exitCode = exitCode
    if (entry.timer) clearTimeout(entry.timer)
    entry.timer = setTimeout(() => {
      if (this.entries.get(key) === entry) this.entries.delete(key)
    }, KEEP_EXITED_MS)
  }

  private drop(key: string): void {
    const entry = this.entries.get(key)
    if (entry?.timer) clearTimeout(entry.timer)
    this.entries.delete(key)
  }
}
