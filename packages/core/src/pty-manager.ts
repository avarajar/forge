import * as pty from 'node-pty'
import type { IPty } from 'node-pty'
import { existsSync, chmodSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { createRequire } from 'node:module'
import { MCP_TOOL_PREFIX_RE, type CWSession } from './cw-types.js'
import { envWithoutHarness, FORGE_SECRETS } from './cw-doctor.js'
import { supports } from './harness-capabilities.js'
import type { StateTracker } from './session-state.js'
import { SESSION_ENV, TOKEN_ENV, cwSkipPermissionsDefault, type ClaudeHooks, type HookLaunch } from './claude-hooks.js'

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

const SLASH_MAX = 300

// a slash command with its arguments on one line, with no control character that could type more than that
export function slashLine(text: unknown): string | null {
  const line = typeof text === 'string' ? text.trim() : ''
  return line.length <= SLASH_MAX && /^\/[A-Za-z0-9][\w:.-]*( [^\x00-\x1f\x7f]*)?$/.test(line) ? line : null
}

// text as one line for a terminal: control characters become spaces, whitespace collapses
export const oneLine = (text: string) => text.replace(/[\x00-\x1f\x7f]+/g, ' ').replace(/\s+/g, ' ').trim()

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
  headless: boolean
  lastClientDisconnect: Date | null
  onDataDisposable: pty.IDisposable
  onExitDisposable: pty.IDisposable
}

export interface Launch {
  command: string
  env: Record<string, string>
}

export interface LaunchHook extends HookLaunch {
  key: string
}

// a Forge started from inside a Forge session inherits that session's hook settings and token
const INHERITED_HOOK_SETTINGS = /(^|\s)--settings\s+\S*\/claude-\d+\.json(?=\s|$)/g

// the MCP servers a Claude Code session starts without: their tools are taken away, the servers still start.
// The = form keeps the variadic option from swallowing the arguments CW adds after it, and has no spaces for CW's split
export function disallowedMcpFlag(session: CWSession): string | null {
  const prefixes = (session.disabledMcps ?? []).filter(p => MCP_TOOL_PREFIX_RE.test(p))
  return prefixes.length > 0 ? `--disallowedTools=${prefixes.join(',')}` : null
}

function withHook(env: Record<string, string>, session: CWSession, hook: LaunchHook | undefined, skipPermissionsDefault: () => boolean): boolean {
  for (const name of FORGE_SECRETS) delete env[name]
  delete env[TOKEN_ENV]
  delete env[SESSION_ENV]
  const inherited = (env.CW_CLAUDE_FLAGS ?? '').replace(INHERITED_HOOK_SETTINGS, ' ').trim()
  if (inherited) env.CW_CLAUDE_FLAGS = inherited
  else delete env.CW_CLAUDE_FLAGS
  if ((session.harness ?? 'claude') !== 'claude' || session.type === 'login') return false
  if (hook) {
    env[TOKEN_ENV] = hook.token
    // a header carries it, and project names can have any letter
    env[SESSION_ENV] = encodeURIComponent(hook.key)
  }
  if (session.type === 'general') return Boolean(hook)
  const extra = [hook ? `--settings ${hook.settingsPath}` : '', disallowedMcpFlag(session) ?? ''].filter(Boolean)
  if (extra.length === 0) return false
  // CW applies config.yaml's skip_permissions only while CW_CLAUDE_FLAGS is empty, so keep what it would have done;
  // --skip-permissions on the command line makes CW add the flag itself
  const skipDefault = hook ? hook.skipPermissionsDefault : skipPermissionsDefault()
  const flags = inherited || (skipDefault && !session.skipPermissions ? '--dangerously-skip-permissions' : '')
  env.CW_CLAUDE_FLAGS = [flags, ...extra].filter(Boolean).join(' ')
  return Boolean(hook)
}

export function buildLaunch(session: CWSession, isNew: boolean, hook?: LaunchHook, cwHome = join(process.env.HOME ?? '', '.cw')): Launch {
  const env = envWithoutHarness()
  const hooked = withHook(env, session, hook, () => cwSkipPermissionsDefault(cwHome))
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
      if (hooked && hook) cmd += ` --settings ${shellQuote(hook.settingsPath)}`
      const disallowed = disallowedMcpFlag(session)
      if (disallowed) cmd += ` ${shellQuote(disallowed)}`
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

  // told when a session's agent starts and when its process exits
  onLifecycle?: (event: 'started' | 'ended', session: CWSession) => void

  constructor(private readonly states: StateTracker | null = null, private readonly hooks: ClaudeHooks | null = null) {
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS)
  }

  private makeKey(project: string, sessionDir: string): string {
    return `${project}::${sessionDir}`
  }

  getOrCreate(project: string, sessionDir: string, session: CWSession, options: { isNew?: boolean; headless?: boolean } = {}): PTYSession | null {
    const key = this.makeKey(project, sessionDir)
    const existing = this.sessions.get(key)
    if (existing) return existing

    const shell = process.env.SHELL || '/bin/zsh'
    const wantsHook = (session.harness ?? 'claude') === 'claude' && session.type !== 'login'
    const hookLaunch = wantsHook ? this.hooks?.launch(key) ?? null : null
    const { command, env } = buildLaunch(session, options.isNew ?? false, hookLaunch ? { ...hookLaunch, key } : undefined)
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
      this.hooks?.revoke(key)
      return null
    }

    const ptySession: PTYSession = {
      pty: ptyProcess,
      scrollback: [],
      clients: new Set(),
      cwd,
      command,
      createdAt: new Date(),
      headless: options.headless ?? false,
      lastClientDisconnect: null,
      onDataDisposable: null!,
      onExitDisposable: null!
    }

    this.states?.track(key, session.harness ?? 'claude')

    ptySession.onDataDisposable = ptyProcess.onData((data: string) => {
      this.states?.output(key, data)
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
      this.states?.exit(key, exitCode)
      this.hooks?.revoke(key)
      const message = JSON.stringify({ type: 'exit', code: exitCode })
      for (const client of ptySession.clients) {
        try {
          client.send(message)
        } catch {}
      }
      this.sessions.delete(key)
      this.onLifecycle?.('ended', session)
    })

    this.sessions.set(key, ptySession)
    this.onLifecycle?.('started', session)
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
    this.states?.forget(sessionId)
    this.hooks?.revoke(sessionId)
    this.sessions.delete(sessionId)
  }

  has(sessionId: string): boolean {
    return this.sessions.has(sessionId)
  }

  get(sessionId: string): PTYSession | undefined {
    return this.sessions.get(sessionId)
  }

  // types a line into a live session, then Enter apart, so the agent's prompt takes it as typed and not as a paste
  typeLine(project: string, sessionDir: string, text: string): boolean {
    const session = this.sessions.get(this.makeKey(project, sessionDir))
    if (!session) return false
    session.pty.write(text)
    setTimeout(() => session.pty.write('\r'), 150)
    return true
  }

  // the state tracker reads the screen at the size the user sees it
  resize(sessionId: string, cols: number, rows: number): void {
    const session = this.sessions.get(sessionId)
    if (!session) return
    session.pty.resize(cols, rows)
    this.states?.resize(sessionId, cols, rows)
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
        !session.headless &&
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
