import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isLoopbackHost } from './origin-guard.js'

// Claude Code sessions launched by Forge report their lifecycle to POST /api/cw/hook-events through hooks
// loaded with --settings, so the account's own settings.json and its hooks are never touched.
// Each launch gets its own token: the agent can only report its own session, and never sees FORGE_AUTH_TOKEN.

export const HOOK_PATH = '/api/cw/hook-events'
export const TOKEN_HEADER = 'X-Forge-Hook-Token'
export const SESSION_HEADER = 'X-Forge-Hook-Session'
export const TOKEN_ENV = 'FORGE_HOOK_TOKEN'
export const SESSION_ENV = 'FORGE_HOOK_SESSION'

// Claude Code POSTs these itself (`http` hooks); it skips http hooks for SessionStart, which goes through curl
export const HOOK_EVENTS_HTTP = [
  'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest', 'PermissionDenied',
  'Notification', 'Stop', 'StopFailure', 'SubagentStart', 'SubagentStop', 'SessionEnd',
] as const

const TIMEOUT_S = 2
const WILDCARD_HOSTS = new Set(['0.0.0.0', '::', '[::]'])

// The agent runs on Forge's machine, so loopback reaches Forge unless it listens on one specific other address
export function hookUrl(port: number, host?: string): string {
  if (!host || WILDCARD_HOSTS.has(host) || isLoopbackHost(host)) return `http://127.0.0.1:${port}${HOOK_PATH}`
  const name = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host
  return `http://${name}:${port}${HOOK_PATH}`
}

export function hookSettings(url: string): object {
  const httpHook = {
    type: 'http',
    url,
    timeout: TIMEOUT_S,
    headers: { [TOKEN_HEADER]: `$${TOKEN_ENV}`, [SESSION_HEADER]: `$${SESSION_ENV}` },
    allowedEnvVars: [TOKEN_ENV, SESSION_ENV],
  }
  // prints nothing (SessionStart stdout reaches the model) and always exits 0 (exit 2 would block)
  const curl = `test -z "$${TOKEN_ENV}" || curl -s -m ${TIMEOUT_S} -o /dev/null -X POST -H 'Content-Type: application/json'`
    + ` -H "${TOKEN_HEADER}: $${TOKEN_ENV}" -H "${SESSION_HEADER}: $${SESSION_ENV}" --data-binary @- '${url}' >/dev/null 2>&1; exit 0`
  const hooks: Record<string, unknown[]> = {
    SessionStart: [{ hooks: [{ type: 'command', command: curl, timeout: TIMEOUT_S + 1 }] }],
  }
  for (const event of HOOK_EVENTS_HTTP) hooks[event] = [{ hooks: [httpHook] }]
  return { hooks }
}

// CW reads skip_permissions from its config only when CW_CLAUDE_FLAGS is empty (_resolve_claude_flags)
export function cwSkipPermissionsDefault(cwHome: string): boolean {
  try {
    const text = readFileSync(join(cwHome, 'config.yaml'), 'utf-8')
    return /^skip_permissions:\s*true\b/m.test(text)
  } catch {
    return false
  }
}

function sameToken(expected: string, provided: string): boolean {
  const a = createHash('sha256').update(expected).digest()
  const b = createHash('sha256').update(provided).digest()
  return timingSafeEqual(a, b)
}

export interface HookLaunch {
  settingsPath: string
  token: string
  skipPermissionsDefault: boolean
}

export class ClaudeHooks {
  private readonly tokens = new Map<string, string>()
  private settingsPath: string | null = null
  private warned = false

  constructor(private readonly opts: { dir: string; cwHome: string; warn?: (message: string) => void }) {}

  get enabled(): boolean {
    return this.settingsPath !== null
  }

  // the URL carries the port, so the file is written once Forge listens, one per port
  listen(port: number, host?: string): string | null {
    const path = join(this.opts.dir, `claude-${port}.json`)
    // CW splits CW_CLAUDE_FLAGS on whitespace
    if (/\s/.test(path)) {
      this.opts.warn?.(`[hooks] ${path} has whitespace; Claude Code sessions keep the screen-read state`)
      return null
    }
    try {
      if (!existsSync(this.opts.dir)) mkdirSync(this.opts.dir, { recursive: true })
      writeFileSync(path, JSON.stringify(hookSettings(hookUrl(port, host)), null, 2) + '\n', { mode: 0o644 })
    } catch (err) {
      this.opts.warn?.(`[hooks] could not write ${path}: ${(err as Error).message}`)
      return null
    }
    this.settingsPath = path
    return path
  }

  // a relaunch of the same key replaces its token, so the previous process can no longer report
  launch(key: string): HookLaunch | null {
    if (!this.settingsPath) {
      if (!this.warned) this.opts.warn?.('[hooks] not listening yet; Claude Code sessions keep the screen-read state')
      this.warned = true
      return null
    }
    const token = randomBytes(24).toString('hex')
    this.tokens.set(key, token)
    return { settingsPath: this.settingsPath, token, skipPermissionsDefault: cwSkipPermissionsDefault(this.opts.cwHome) }
  }

  verify(key: string, token: string | undefined): boolean {
    const expected = this.tokens.get(key)
    if (!expected || !token) return false
    return sameToken(expected, token)
  }

  revoke(key: string): void {
    this.tokens.delete(key)
  }
}
