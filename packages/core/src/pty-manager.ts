import * as pty from 'node-pty'
import type { IPty } from 'node-pty'
import type { CWSession } from './cw-types.js'

const SCROLLBACK_LIMIT = 5000
const IDLE_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

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

export class PTYManager {
  private sessions = new Map<string, PTYSession>()
  private cleanupTimer: ReturnType<typeof setInterval> | null = null

  constructor() {
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS)
  }

  private buildCommand(session: CWSession): string {
    if (session.type === 'review') {
      return `cw review ${session.project} ${session.pr}`
    }
    let cmd = `cw work ${session.project} ${session.task}`
    if (session.account) cmd += ` --account ${session.account}`
    return cmd
  }

  private makeKey(project: string, sessionDir: string): string {
    return `${project}::${sessionDir}`
  }

  getOrCreate(project: string, sessionDir: string, session: CWSession): PTYSession {
    const key = this.makeKey(project, sessionDir)
    const existing = this.sessions.get(key)
    if (existing) return existing

    const shell = process.env.SHELL || '/bin/zsh'
    const command = this.buildCommand(session)
    const cwd = session.worktree

    const ptyProcess = pty.spawn(shell, ['-c', command], {
      name: 'xterm-256color',
      cols: 120,
      rows: 40,
      cwd,
      env: { ...process.env } as Record<string, string>
    })

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
