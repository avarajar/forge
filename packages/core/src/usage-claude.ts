import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { UsageWindow } from './cw-types.js'
import { severityFrom, windowLabel, obj, num, str, type Json, type UsageProbe } from './usage-window.js'

const execFileAsync = promisify(execFile)

const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage'
const OAUTH_BETA = 'oauth-2025-04-20'
const TIMEOUT_MS = 10_000

const KEYCHAIN_SERVICE = 'Claude Code-credentials'

// Claude sizes these windows without naming them in the payload
const SESSION_MINS = 300
const WEEKLY_MINS = 10080

const CLAUDE_WINDOW_MINS: Record<string, number> = { session: SESSION_MINS, weekly_all: WEEKLY_MINS, weekly_scoped: WEEKLY_MINS }

export function mapClaudeUsage(payload: Json): UsageWindow[] {
  const limits = Array.isArray(payload.limits) ? payload.limits : null
  if (limits) {
    return limits.flatMap((entry): UsageWindow[] => {
      const limit = obj(entry)
      const minutes = limit ? CLAUDE_WINDOW_MINS[String(limit.kind)] : undefined
      const percent = num(limit?.percent)
      if (!minutes || percent === null) return []
      return [{
        label: windowLabel(minutes),
        percent,
        resetsAt: str(limit?.resets_at),
        severity: severityFrom(limit?.severity, percent),
        scope: str(obj(obj(limit?.scope)?.model)?.display_name),
      }]
    })
  }
  // the named fields are the fallback for a payload without the normalised array
  return ([['five_hour', SESSION_MINS], ['seven_day', WEEKLY_MINS]] as const).flatMap(([key, minutes]): UsageWindow[] => {
    const window = obj(payload[key])
    const percent = num(window?.utilization)
    if (percent === null) return []
    return [{ label: windowLabel(minutes), percent, resetsAt: str(window?.resets_at), severity: severityFrom(null, percent), scope: null }]
  })
}

// Claude Code keys the keychain entry by CLAUDE_CONFIG_DIR, so every CW account has its own
export function claudeKeychainService(configDir: string): string {
  const dir = configDir.replace(/\/+$/, '')
  if (dir === join(homedir(), '.claude')) return KEYCHAIN_SERVICE
  return `${KEYCHAIN_SERVICE}-${createHash('sha256').update(dir).digest('hex').slice(0, 8)}`
}

async function readFromKeychain(service: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('security', ['find-generic-password', '-s', service, '-w'], { encoding: 'utf-8' })
    return String(stdout)
  } catch {
    return null
  }
}

export interface ClaudeUsageDeps {
  readKeychain?: (service: string) => Promise<string | null> | string | null
  fetchImpl?: typeof fetch
  now?: () => number
}

interface Credentials { accessToken: string; expiresAt: number | null }

function parseCredentials(raw: string | null): Credentials | null {
  if (!raw) return null
  try {
    const oauth = (JSON.parse(raw) as { claudeAiOauth?: { accessToken?: unknown; expiresAt?: unknown } }).claudeAiOauth
    const accessToken = typeof oauth?.accessToken === 'string' ? oauth.accessToken : null
    if (!accessToken) return null
    return { accessToken, expiresAt: typeof oauth?.expiresAt === 'number' ? oauth.expiresAt : null }
  } catch {
    return null
  }
}

async function readCredentials(configDir: string, deps: ClaudeUsageDeps): Promise<Credentials | null> {
  const readKeychain = deps.readKeychain ?? (process.platform === 'darwin' ? readFromKeychain : () => null)
  const fromKeychain = parseCredentials(await readKeychain(claudeKeychainService(configDir)))
  if (fromKeychain) return fromKeychain
  try {
    return parseCredentials(readFileSync(join(configDir, '.credentials.json'), 'utf-8'))
  } catch {
    return null
  }
}

export async function probeClaudeUsage(configDir: string, deps: ClaudeUsageDeps = {}): Promise<UsageProbe> {
  const now = deps.now ?? Date.now
  const credentials = await readCredentials(configDir, deps)
  if (!credentials) return { state: 'not_connected', windows: [], detail: null }
  if (credentials.expiresAt !== null && credentials.expiresAt <= now()) {
    return { state: 'expired', windows: [], detail: 'The stored token has expired' }
  }
  const call = deps.fetchImpl ?? fetch
  try {
    const response = await call(USAGE_URL, {
      headers: { authorization: `Bearer ${credentials.accessToken}`, 'anthropic-beta': OAUTH_BETA },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (response.status === 401 || response.status === 403) return { state: 'expired', windows: [], detail: 'Claude rejected the stored token' }
    const body = await response.text()
    if (!response.ok) return { state: 'error', windows: [], detail: `Claude answered ${response.status}` }
    return { state: 'ok', windows: mapClaudeUsage(JSON.parse(body) as Json), detail: null }
  } catch (err) {
    return { state: 'error', windows: [], detail: err instanceof Error ? err.message : String(err) }
  }
}
