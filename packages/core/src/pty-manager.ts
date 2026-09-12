import * as pty from 'node-pty'
import type { IPty } from 'node-pty'
import { existsSync, chmodSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { createRequire } from 'node:module'
import type { CWSession } from './cw-types.js'
import { envWithoutHarness } from './cw-doctor.js'
import { supports } from './harness-capabilities.js'

const SCROLLBACK_LIMIT = 5000
const IDLE_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

// Every value interpolated into buildLaunch is shell-parsed by `sh -c`
const shellQuote = (value: string): string => `'${value.replace(/'/g, "'\\''")}'`

// npm install can strip execute permission from spawn-helper — fix it once at load
function ensureSpawnHelperPermissions() {
  try {
    const require = createRequire(import.meta.url)
    const ptyPath = dirname(require.resolve('node-pty/package.json'))
    const helper = join(ptyPath, 'prebuilds', `${process.platform}-${process.arch}`, 'spawn-helper')
    if (existsSync(helper)) {
      const mode = statSync(helper).mode
      if (!(mode & 0o111)) {
        chmodSync(helper, mode | 0o755)
      }
    }
  } catch { /* best effort */ }
}
ensureSpawnHelperPermissions()

export interface PTYClient {
  send: (data: string) => void
  close: () => void
}

export interface PTYSession {
  pty: IPty
  scrollback: string[]
  clients: Set<PTYClient>
  cwd: string
  command: string
  createdAt: Date
  lastClientDisconnect: Date | null
  onDataDisposable: pty.IDisposable
  onExitDisposable: pty.IDisposable
}

export interface Launch {
  command: string
  env: Record<string, string>
}

export function buildLaunch(session: CWSession, isNew: boolean): Launch {
  const env = envWithoutHarness()
  const harness = session.harness ?? 'claude'
  const harnessFlag = isNew && session.harness ? ` --harness ${shellQuote(harness)}` : ''
  const prefix = session.skipPermissions ? 'cw --skip-permissions' : 'cw'

  if (session.type === 'general') {
    // cw launch forwards extra args verbatim to the harness binary
    let cmd = 'cw launch'
    if (session.account) cmd += ` ${shellQuote(session.account)}`
    if (harness === 'claude') {
      if (session.model) cmd += ` --model ${shellQuote(session.model)}`
      if (session.skipPermissions) cmd += ' --dangerously-skip-permissions'
    }
    if (isNew && session.harness) env.CW_HARNESS = harness
    return { command: cmd, env }
  }
  if (session.type === 'login') {
    return { command: `cw account login ${shellQuote(session.account)} --harness ${shellQuote(harness)}`, env }
  }
  if (session.type === 'create') {
    const desc = session.notes || session.task || 'New project'
    let cmd = `cw create ${shellQuote(desc)}`
    if (supports(harness, 'agent_teams')) cmd += ' --team'
    if (session.task) cmd += ` --name ${shellQuote(session.task)}`
    if (session.account) cmd += ` --account ${shellQuote(session.account)}`
    if (session.model) cmd += ` --model ${shellQuote(session.model)}`
    if (session.worktree) cmd += ` --dir ${shellQuote(session.worktree)}`
    return { command: cmd + harnessFlag, env }
  }
  if (session.type === 'review') {
    const prArg = session.source_url || session.pr
    let cmd = `${prefix} review ${shellQuote(session.project)} ${shellQuote(String(prArg ?? ''))}`
    if (session.account) cmd += ` --account ${shellQuote(session.account)}`
    if (session.model) cmd += ` --model ${shellQuote(session.model)}`
    return { command: cmd + harnessFlag, env }
  }
  if (session.type === 'loop') {
    const prompt = session.loop_prompt ?? ''
    const slug = session.sessionDir?.replace(/^loop-/, '') ?? session.task ?? ''
    let cmd = `${prefix} loop ${shellQuote(session.project)} ${shellQuote(prompt)} --name ${shellQuote(slug)}`
    if (session.loop_interval) cmd += ` --every ${shellQuote(session.loop_interval)}`
    if (session.account) cmd += ` --account ${shellQuote(session.account)}`
    if (session.model) cmd += ` --model ${shellQuote(session.model)}`
    return { command: cmd + harnessFlag, env }
  }
  // CW's URL-aware init prompt needs the source URL for linear, github and notion tasks
  const taskArg = session.source_url || session.task
  let cmd = `${prefix} work ${shellQuote(session.project)} ${shellQuote(taskArg ?? '')}`
  if (session.account) cmd += ` --account ${shellQuote(session.account)}`
  if (session.workflow) cmd += ` --workflow ${shellQuote(session.workflow)}`
  if (session.model) cmd += ` --model ${shellQuote(session.model)}`
  return { command: cmd + harnessFlag, env }
}

export class PTYManager {
  private sessions = new Map<string, PTYSession>()
  private cleanupTimer: ReturnType<typeof setInterval> | null = null

  constructor() {
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS)
  }

  private makeKey(project: string, sessionDir: string): string {
    return `${project}::${sessionDir}`
  }

  getOrCreate(project: string, sessionDir: string, session: CWSession, options: { isNew?: boolean } = {}): PTYSession | null {
    const key = this.makeKey(project, sessionDir)
    const existing = this.sessions.get(key)
    if (existing) return existing

    const shell = process.env.SHELL || '/bin/zsh'
    const { command, env } = buildLaunch(session, options.isNew ?? false)
    const cwd = session.worktree && existsSync(session.worktree)
      ? session.worktree
      : (session.type === 'general' || session.type === 'create' || session.type === 'login')
        ? (process.env.HOME ?? process.cwd())
        : process.cwd()

    let ptyProcess: IPty
    try {
      ptyProcess = pty.spawn(shell, ['-c', command], {
        name: 'xterm-256color',
        cols: 120,
        rows: 40,
        cwd,
        env
      })
    } catch (err) {
      console.error(`[pty] Failed to spawn for ${key}: ${err}`)
      return null
    }

    const ptySession: PTYSession = {
      pty: ptyProcess,
      scrollback: [],
      clients: new Set(),
      cwd,
      command,
      createdAt: new Date(),
      lastClientDisconnect: null,
      onDataDisposable: null!,
      onExitDisposable: null!
    }

    ptySession.onDataDisposable = ptyProcess.onData((data: string) => {
      ptySession.scrollback.push(data)
      if (ptySession.scrollback.length > SCROLLBACK_LIMIT) {
        ptySession.scrollback.splice(0, ptySession.scrollback.length - SCROLLBACK_LIMIT)
      }

      const message = JSON.stringify({ type: 'output', data })
      for (const client of ptySession.clients) {
        try {
          client.send(message)
        } catch {
          ptySession.clients.delete(client)
        }
      }
    })

    ptySession.onExitDisposable = ptyProcess.onExit(({ exitCode }) => {
      const message = JSON.stringify({ type: 'exit', code: exitCode })
      for (const client of ptySession.clients) {
        try {
          client.send(message)
        } catch {}
      }
      this.sessions.delete(key)
    })

    this.sessions.set(key, ptySession)
    return ptySession
  }

  attach(sessionId: string, client: PTYClient): void {
    const session = this.sessions.get(sessionId)
    if (!session) return

    session.clients.add(client)
    session.lastClientDisconnect = null

    if (session.scrollback.length > 0) {
      const scrollbackData = session.scrollback.join('')
      try {
        client.send(JSON.stringify({ type: 'scrollback', data: scrollbackData }))
      } catch {}
    }
  }

  detach(sessionId: string, client: PTYClient): void {
    const session = this.sessions.get(sessionId)
    if (!session) return

    session.clients.delete(client)
    if (session.clients.size === 0) {
      session.lastClientDisconnect = new Date()
    }
  }

  kill(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) return

    try {
      session.onDataDisposable.dispose()
      session.onExitDisposable.dispose()
      session.pty.kill()
    } catch {}
    this.sessions.delete(sessionId)
  }

  has(sessionId: string): boolean {
    return this.sessions.has(sessionId)
  }

  get(sessionId: string): PTYSession | undefined {
    return this.sessions.get(sessionId)
  }

  cleanup(): void {
    const now = Date.now()
    for (const [key, session] of this.sessions) {
      if (
        session.clients.size === 0 &&
        session.lastClientDisconnect &&
        now - session.lastClientDisconnect.getTime() > IDLE_TIMEOUT_MS
      ) {
        this.kill(key)
      }
      if (
        session.clients.size === 0 &&
        !session.lastClientDisconnect &&
        now - session.createdAt.getTime() > IDLE_TIMEOUT_MS
      ) {
        this.kill(key)
      }
    }
  }

  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
    for (const key of this.sessions.keys()) {
      this.kill(key)
    }
  }
}
