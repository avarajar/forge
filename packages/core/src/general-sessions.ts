import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { CWSession } from './cw-types.js'

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

// General sessions have no session.json, so Forge keeps them to relaunch once the PTY or the server is gone
export class GeneralSessions {
  private readonly sessions = new Map<string, CWSession>()

  constructor(private readonly file: string | null = null, now = Date.now()) {
    if (!file || !existsSync(file)) return
    try {
      const saved = JSON.parse(readFileSync(file, 'utf-8')) as Record<string, CWSession>
      for (const [key, session] of Object.entries(saved)) {
        if (now - Date.parse(session.created) < MAX_AGE_MS) this.sessions.set(key, session)
      }
    } catch {}
  }

  get(key: string): CWSession | undefined {
    return this.sessions.get(key)
  }

  remember(key: string, session: CWSession): void {
    this.sessions.set(key, session)
    this.save()
  }

  forget(key: string): void {
    if (this.sessions.delete(key)) this.save()
  }

  private save(): void {
    if (!this.file) return
    try {
      mkdirSync(dirname(this.file), { recursive: true })
      writeFileSync(this.file, JSON.stringify(Object.fromEntries(this.sessions), null, 2))
    } catch (err) {
      console.warn(`[pty] could not save general sessions: ${(err as Error).message}`)
    }
  }
}
