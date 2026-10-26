import { createHash, randomBytes } from 'node:crypto'
import type { Confirmation } from '@forge-dev/sdk'

const TTL_MS = 120_000

interface Pending { moduleId: string; actionId: string; hash: string; confirmation: Confirmation; expires: number }

// a token the user earns by seeing the confirmation; single-use and tied to the exact input
export class Confirmations {
  private pending = new Map<string, Pending>()

  constructor(private readonly now: () => number = Date.now) {}

  issue(moduleId: string, actionId: string, hash: string, confirmation: Confirmation): string {
    this.sweep()
    const token = randomBytes(24).toString('base64url')
    this.pending.set(token, { moduleId, actionId, hash, confirmation, expires: this.now() + TTL_MS })
    return token
  }

  take(token: string, moduleId: string, actionId: string, hash: string): Confirmation | null {
    const p = this.pending.get(token)
    if (!p) return null
    this.pending.delete(token)
    if (p.expires < this.now() || p.moduleId !== moduleId || p.actionId !== actionId || p.hash !== hash) return null
    return p.confirmation
  }

  private sweep(): void {
    const now = this.now()
    for (const [token, p] of this.pending) if (p.expires < now) this.pending.delete(token)
  }
}

export function inputHash(input: unknown): string {
  return createHash('sha256').update(stable(input)).digest('hex')
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stable((value as Record<string, unknown>)[k])}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}
