# Web Terminal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Embed interactive Claude Code sessions inside Forge's TaskDetail using node-pty + WebSocket + xterm.js, with CW as the backend.

**Architecture:** Hono server spawns PTY processes via node-pty for each CW session. A WebSocket endpoint pipes stdin/stdout between browser and PTY. The client uses xterm.js with stdin enabled. PTYs persist across navigations (reconnect with scrollback buffer). TaskDetail is redesigned as a split layout: resizable sidebar (Status/Diff/Notes/Tools) + full-height terminal.

**Tech Stack:** node-pty, @hono/node-ws, xterm.js (already installed), Preact, Hono, Vitest

**Spec:** `docs/superpowers/specs/2026-04-03-web-terminal-design.md`

---

### Task 1: Install dependencies

**Files:**
- Modify: `packages/core/package.json`
- Modify: `packages/ui/package.json`

- [ ] **Step 1: Install node-pty and @hono/node-ws in core**

```bash
cd /Users/joselito/Workspace/personal/forge/.tasks/initial/packages/core
npm install node-pty @hono/node-ws
```

- [ ] **Step 2: Install @xterm/addon-web-links in ui (where Terminal.tsx lives)**

```bash
cd /Users/joselito/Workspace/personal/forge/.tasks/initial/packages/ui
npm install @xterm/addon-web-links
```

- [ ] **Step 3: Verify installs**

```bash
cd /Users/joselito/Workspace/personal/forge/.tasks/initial/packages/core
node -e "require('node-pty')" && echo "node-pty OK"
```

Expected: `node-pty OK` (confirms native module compiled)

- [ ] **Step 4: Commit**

```bash
git add packages/core/package.json packages/ui/package.json package-lock.json
git commit -m "chore: add node-pty, @hono/node-ws, @xterm/addon-web-links dependencies"
```

---

### Task 2: PTYManager — core class

**Files:**
- Create: `packages/core/src/pty-manager.ts`
- Create: `packages/core/src/pty-manager.test.ts`

- [ ] **Step 1: Write failing tests for PTYManager**

Create `packages/core/src/pty-manager.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { PTYManager } from './pty-manager.js'
import type { CWSession } from './cw-types.js'

const makeSession = (overrides?: Partial<CWSession>): CWSession => ({
  project: 'testproj',
  task: 'fix-bug',
  type: 'task',
  account: 'default',
  worktree: '/tmp/testproj/.tasks/fix-bug',
  notes: '/tmp/notes.md',
  status: 'active',
  created: '2026-04-01T00:00:00Z',
  last_opened: '2026-04-02T00:00:00Z',
  opens: 1,
  ...overrides
})

describe('PTYManager', () => {
  let manager: PTYManager

  beforeEach(() => {
    manager = new PTYManager()
  })

  afterEach(() => {
    manager.dispose()
  })

  it('creates a new PTY session', () => {
    const session = makeSession()
    const ptySession = manager.getOrCreate('testproj', 'task-fix-bug', session)
    expect(ptySession).toBeDefined()
    expect(ptySession.pty).toBeDefined()
    expect(ptySession.clients.size).toBe(0)
  })

  it('returns existing PTY session on second call', () => {
    const session = makeSession()
    const first = manager.getOrCreate('testproj', 'task-fix-bug', session)
    const second = manager.getOrCreate('testproj', 'task-fix-bug', session)
    expect(first).toBe(second)
  })

  it('tracks attached clients', () => {
    const session = makeSession()
    const ptySession = manager.getOrCreate('testproj', 'task-fix-bug', session)
    const fakeWs = { send: vi.fn(), close: vi.fn() }

    manager.attach('testproj::task-fix-bug', fakeWs)
    expect(ptySession.clients.size).toBe(1)

    manager.detach('testproj::task-fix-bug', fakeWs)
    expect(ptySession.clients.size).toBe(0)
  })

  it('PTY stays alive after detach', () => {
    const session = makeSession()
    const ptySession = manager.getOrCreate('testproj', 'task-fix-bug', session)
    const fakeWs = { send: vi.fn(), close: vi.fn() }

    manager.attach('testproj::task-fix-bug', fakeWs)
    manager.detach('testproj::task-fix-bug', fakeWs)

    // PTY still in the map
    expect(manager.has('testproj::task-fix-bug')).toBe(true)
  })

  it('kill removes PTY from map', () => {
    const session = makeSession()
    manager.getOrCreate('testproj', 'task-fix-bug', session)
    manager.kill('testproj::task-fix-bug')
    expect(manager.has('testproj::task-fix-bug')).toBe(false)
  })

  it('stores scrollback data', () => {
    const session = makeSession()
    const ptySession = manager.getOrCreate('testproj', 'task-fix-bug', session)
    // Scrollback is populated by pty.onData — just verify it's an array
    expect(Array.isArray(ptySession.scrollback)).toBe(true)
  })

  it('builds correct command for task sessions', () => {
    const session = makeSession({ project: 'myapp', task: 'fix-login', account: 'work' })
    const ptySession = manager.getOrCreate('myapp', 'task-fix-login', session)
    expect(ptySession.command).toContain('cw work myapp fix-login')
    expect(ptySession.command).toContain('--account work')
  })

  it('builds correct command for review sessions', () => {
    const session = makeSession({ type: 'review', pr: '42', task: undefined })
    const ptySession = manager.getOrCreate('testproj', 'review-pr-42', session)
    expect(ptySession.command).toContain('cw review testproj 42')
  })

  it('cleanup kills idle sessions', () => {
    vi.useFakeTimers()
    const session = makeSession()
    manager.getOrCreate('testproj', 'task-fix-bug', session)

    // Fast-forward 31 minutes
    vi.advanceTimersByTime(31 * 60 * 1000)
    manager.cleanup()

    expect(manager.has('testproj::task-fix-bug')).toBe(false)
    vi.useRealTimers()
  })

  it('cleanup does NOT kill sessions with active clients', () => {
    vi.useFakeTimers()
    const session = makeSession()
    manager.getOrCreate('testproj', 'task-fix-bug', session)
    const fakeWs = { send: vi.fn(), close: vi.fn() }
    manager.attach('testproj::task-fix-bug', fakeWs)

    vi.advanceTimersByTime(31 * 60 * 1000)
    manager.cleanup()

    expect(manager.has('testproj::task-fix-bug')).toBe(true)
    vi.useRealTimers()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/joselito/Workspace/personal/forge/.tasks/initial/packages/core
npx vitest run src/pty-manager.test.ts
```

Expected: FAIL — `Cannot find module './pty-manager.js'`

- [ ] **Step 3: Implement PTYManager**

Create `packages/core/src/pty-manager.ts`:

```typescript
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
      // Append to scrollback
      ptySession.scrollback.push(data)
      if (ptySession.scrollback.length > SCROLLBACK_LIMIT) {
        ptySession.scrollback.splice(0, ptySession.scrollback.length - SCROLLBACK_LIMIT)
      }

      // Broadcast to all connected clients
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

    // Send scrollback buffer
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
      // Also clean sessions that never had a client and are old
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/joselito/Workspace/personal/forge/.tasks/initial/packages/core
npx vitest run src/pty-manager.test.ts
```

Expected: All tests PASS. Some tests may need adjustment since `node-pty` spawns real processes — if `cw` is not available in test environment, the PTY will exit quickly. The tests verify structure and lifecycle, not that `cw` runs successfully.

- [ ] **Step 5: Export PTYManager from core index**

In `packages/core/src/index.ts`, add:

```typescript
export { PTYManager } from './pty-manager.js'
export type { PTYSession, PTYClient } from './pty-manager.js'
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/pty-manager.ts packages/core/src/pty-manager.test.ts packages/core/src/index.ts
git commit -m "feat(core): add PTYManager — spawns and manages persistent PTY processes per session"
```

---

### Task 3: WebSocket endpoint — pty-routes

**Files:**
- Create: `packages/core/src/pty-routes.ts`
- Create: `packages/core/src/pty-routes.test.ts`
- Modify: `packages/core/src/server.ts`
- Modify: `packages/cli/src/commands/console.ts`

- [ ] **Step 1: Write failing tests for pty-routes**

Create `packages/core/src/pty-routes.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PTYManager } from './pty-manager.js'
import { CWReader } from './cw-reader.js'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const TEST_CW = join(import.meta.dirname, '../.test-pty-routes')

describe('PTY Routes', () => {
  let manager: PTYManager

  beforeAll(() => {
    mkdirSync(join(TEST_CW, 'sessions/testproj/task-mytask'), { recursive: true })
    writeFileSync(join(TEST_CW, 'projects.json'), JSON.stringify({
      testproj: { path: '/tmp/testproj', account: 'default', type: 'fullstack', registered: '2026-01-01T00:00:00Z' }
    }))
    writeFileSync(join(TEST_CW, 'sessions/testproj/task-mytask/session.json'), JSON.stringify({
      project: 'testproj', task: 'mytask', type: 'task', account: 'default',
      worktree: '/tmp/testproj/.tasks/mytask', notes: '',
      status: 'active', created: '2026-04-01T10:00:00Z', last_opened: '2026-04-02T15:00:00Z', opens: 2
    }))
    manager = new PTYManager()
  })

  afterAll(() => {
    manager.dispose()
    rmSync(TEST_CW, { recursive: true, force: true })
  })

  it('PTYManager creates session for valid CW session', () => {
    const reader = new CWReader(TEST_CW)
    const session = reader.getSession('testproj', 'task-mytask')
    expect(session).not.toBeNull()

    const ptySession = manager.getOrCreate('testproj', 'task-mytask', session!)
    expect(ptySession).toBeDefined()
    expect(ptySession.command).toContain('cw work testproj mytask')
  })

  it('PTYManager returns null for missing session ID', () => {
    expect(manager.get('nonexistent::session')).toBeUndefined()
  })

  it('attach sends scrollback to new client', () => {
    const reader = new CWReader(TEST_CW)
    const session = reader.getSession('testproj', 'task-mytask')!
    const ptySession = manager.getOrCreate('testproj', 'task-mytask', session)

    // Simulate some scrollback data
    ptySession.scrollback.push('line1\r\n', 'line2\r\n')

    const sent: string[] = []
    const fakeClient = {
      send: (data: string) => { sent.push(data) },
      close: () => {}
    }

    manager.attach('testproj::task-mytask', fakeClient)

    expect(sent.length).toBe(1)
    const parsed = JSON.parse(sent[0])
    expect(parsed.type).toBe('scrollback')
    expect(parsed.data).toContain('line1')
    expect(parsed.data).toContain('line2')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/joselito/Workspace/personal/forge/.tasks/initial/packages/core
npx vitest run src/pty-routes.test.ts
```

Expected: FAIL — `Cannot find module './pty-routes.js'` (or pass partially since we test PTYManager directly — the route file isn't imported yet but the test validates integration)

- [ ] **Step 3: Implement pty-routes**

Create `packages/core/src/pty-routes.ts`:

```typescript
import type { Hono } from 'hono'
import { createNodeWebSocket } from '@hono/node-ws'
import type { PTYManager } from './pty-manager.js'
import type { CWReader } from './cw-reader.js'

export function createPtyWebSocket() {
  return createNodeWebSocket({ app: undefined as unknown as Hono })
}

export function ptyRoutes(
  app: Hono,
  manager: PTYManager,
  reader: CWReader
): ReturnType<typeof createNodeWebSocket> {
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app })

  app.get(
    '/ws/terminal/:project/:sessionDir',
    upgradeWebSocket((c) => {
      const project = c.req.param('project')
      const sessionDir = c.req.param('sessionDir')

      return {
        onOpen(_evt, ws) {
          const session = reader.getSession(project, sessionDir)
          if (!session) {
            ws.send(JSON.stringify({ type: 'error', message: `Session not found: ${project}/${sessionDir}` }))
            ws.close()
            return
          }

          const sessionId = `${project}::${sessionDir}`
          manager.getOrCreate(project, sessionDir, session)

          const client = {
            send: (data: string) => { ws.send(data) },
            close: () => { ws.close() }
          }

          // Store client ref on the ws for cleanup
          ;(ws as unknown as Record<string, unknown>).__ptyClient = client
          ;(ws as unknown as Record<string, unknown>).__sessionId = sessionId

          manager.attach(sessionId, client)
        },

        onMessage(evt, ws) {
          const sessionId = (ws as unknown as Record<string, unknown>).__sessionId as string
          if (!sessionId) return

          try {
            const msg = JSON.parse(typeof evt.data === 'string' ? evt.data : evt.data.toString())

            if (msg.type === 'input') {
              const ptySession = manager.get(sessionId)
              if (ptySession) {
                ptySession.pty.write(msg.data)
              }
            } else if (msg.type === 'resize') {
              const ptySession = manager.get(sessionId)
              if (ptySession && msg.cols && msg.rows) {
                ptySession.pty.resize(msg.cols, msg.rows)
              }
            }
          } catch {
            // Ignore malformed messages
          }
        },

        onClose(_evt, ws) {
          const sessionId = (ws as unknown as Record<string, unknown>).__sessionId as string
          const client = (ws as unknown as Record<string, unknown>).__ptyClient
          if (sessionId && client) {
            manager.detach(sessionId, client as { send: (data: string) => void; close: () => void })
          }
        }
      }
    })
  )

  return { injectWebSocket, upgradeWebSocket }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/joselito/Workspace/personal/forge/.tasks/initial/packages/core
npx vitest run src/pty-routes.test.ts
```

Expected: PASS

- [ ] **Step 5: Wire into server.ts**

Modify `packages/core/src/server.ts` — add PTYManager and ptyRoutes. Add these imports at the top:

```typescript
import { PTYManager } from './pty-manager.js'
import { ptyRoutes } from './pty-routes.js'
```

After the line `const cwReader = new CWReader()`, add:

```typescript
const ptyManager = new PTYManager()
```

After the line `app.route('/api/cw', cwRoutes(cwReader))`, add:

```typescript
const { injectWebSocket } = ptyRoutes(app, ptyManager, cwReader)
```

In the returned object, change:

```typescript
return {
  app,
  fetch,
  injectWebSocket,
  close: () => { ptyManager.dispose(); db.close() }
}
```

- [ ] **Step 6: Wire WebSocket into CLI serve**

Modify `packages/cli/src/commands/console.ts`. Replace:

```typescript
const { serve } = await import('@hono/node-server')
serve({ fetch: server.app.fetch, port })
```

With:

```typescript
const { serve } = await import('@hono/node-server')
const httpServer = serve({ fetch: server.app.fetch, port })
if (server.injectWebSocket) {
  server.injectWebSocket(httpServer)
}
```

- [ ] **Step 7: Export ptyRoutes from core index**

In `packages/core/src/index.ts`, add:

```typescript
export { ptyRoutes } from './pty-routes.js'
```

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/pty-routes.ts packages/core/src/pty-routes.test.ts packages/core/src/server.ts packages/core/src/index.ts packages/cli/src/commands/console.ts
git commit -m "feat(core): add WebSocket endpoint for PTY terminal sessions"
```

---

### Task 4: ForgeTerminal — interactive WebSocket mode

**Files:**
- Modify: `packages/ui/src/Terminal.tsx`

- [ ] **Step 1: Write the updated ForgeTerminal component**

Replace the full content of `packages/ui/src/Terminal.tsx` with:

```typescript
import { type FunctionComponent } from 'preact'
import { useEffect, useRef, useCallback } from 'preact/hooks'

interface TerminalProps {
  /** Static content to display (read-only) */
  content?: string
  /** SSE stream URL (read-only) */
  streamUrl?: string
  /** WebSocket URL for interactive mode (bidirectional) */
  wsUrl?: string
  /** Terminal height — ignored when wsUrl is set (uses 100% of parent) */
  height?: number
  /** Called when the PTY exits */
  onExit?: (code: number) => void
  /** Called when WebSocket connection state changes */
  onConnectionChange?: (connected: boolean) => void
}

export const ForgeTerminal: FunctionComponent<TerminalProps> = ({
  streamUrl, content, wsUrl, height = 300, onExit, onConnectionChange
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<unknown>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectAttemptRef = useRef(0)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isInteractive = !!wsUrl

  const connectWs = useCallback(async (
    term: { write: (data: string) => void; onData: (cb: (data: string) => void) => { dispose: () => void }; onResize: (cb: (size: { cols: number; rows: number }) => void) => { dispose: () => void } },
    url: string
  ) => {
    if (wsRef.current) {
      wsRef.current.close()
    }

    const ws = new WebSocket(url)
    wsRef.current = ws

    const disposables: { dispose: () => void }[] = []

    ws.onopen = () => {
      reconnectAttemptRef.current = 0
      onConnectionChange?.(true)

      // Send keystrokes to server
      const dataDisp = term.onData((data: string) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'input', data }))
        }
      })
      disposables.push(dataDisp)

      // Send resize events
      const resizeDisp = term.onResize(({ cols, rows }: { cols: number; rows: number }) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'resize', cols, rows }))
        }
      })
      disposables.push(resizeDisp)
    }

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data)
        if (msg.type === 'output') {
          term.write(msg.data)
        } else if (msg.type === 'scrollback') {
          term.write(msg.data)
        } else if (msg.type === 'exit') {
          term.write(`\r\n\x1b[33m--- Session ended (code ${msg.code}) ---\x1b[0m\r\n`)
          onExit?.(msg.code)
        } else if (msg.type === 'error') {
          term.write(`\r\n\x1b[31m--- Error: ${msg.message} ---\x1b[0m\r\n`)
        }
      } catch {}
    }

    ws.onclose = () => {
      disposables.forEach(d => d.dispose())
      onConnectionChange?.(false)

      // Auto-reconnect with exponential backoff
      const attempt = reconnectAttemptRef.current
      if (attempt < 5) {
        const delay = Math.min(2000 * Math.pow(2, attempt), 16000)
        reconnectAttemptRef.current = attempt + 1
        term.write(`\r\n\x1b[90m--- Reconnecting (attempt ${attempt + 1}/5)... ---\x1b[0m\r\n`)
        reconnectTimerRef.current = setTimeout(() => connectWs(term, url), delay)
      } else {
        term.write(`\r\n\x1b[31m--- Connection lost. Click Restart to try again. ---\x1b[0m\r\n`)
      }
    }

    ws.onerror = () => {
      // onclose will handle reconnection
    }
  }, [onExit, onConnectionChange])

  useEffect(() => {
    let cleanup: (() => void) | undefined

    const init = async () => {
      const { Terminal } = await import('@xterm/xterm')
      const { FitAddon } = await import('@xterm/addon-fit')
      const { WebLinksAddon } = await import('@xterm/addon-web-links')

      const term = new Terminal({
        theme: {
          background: '#1a1a2e',
          foreground: '#e0e0e0',
          cursor: '#e0e0e0'
        },
        fontSize: 13,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        convertEol: !isInteractive, // PTY handles EOL in interactive mode
        disableStdin: !isInteractive,
        cursorBlink: isInteractive
      })

      const fitAddon = new FitAddon()
      term.loadAddon(fitAddon)
      term.loadAddon(new WebLinksAddon())

      if (containerRef.current) {
        term.open(containerRef.current)
        fitAddon.fit()
        termRef.current = term
      }

      // Static content mode
      if (content && !isInteractive) {
        term.write(content)
      }

      // SSE stream mode
      let evtSource: EventSource | undefined
      if (streamUrl && !isInteractive) {
        evtSource = new EventSource(streamUrl)
        evtSource.addEventListener('output', (e) => {
          const { chunk } = JSON.parse(e.data)
          term.write(chunk)
        })
        evtSource.addEventListener('done', (e) => {
          const { exitCode } = JSON.parse(e.data)
          term.write(`\r\n\x1b[${exitCode === 0 ? '32' : '31'}m--- Exit code: ${exitCode} ---\x1b[0m\r\n`)
          evtSource?.close()
        })
      }

      // WebSocket interactive mode
      if (wsUrl) {
        await connectWs(term as unknown as Parameters<typeof connectWs>[0], wsUrl)
      }

      // Auto-fit on resize
      const observer = new ResizeObserver(() => fitAddon.fit())
      if (containerRef.current) observer.observe(containerRef.current)

      cleanup = () => {
        evtSource?.close()
        observer.disconnect()
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
        if (wsRef.current) {
          reconnectAttemptRef.current = 999 // prevent reconnect during cleanup
          wsRef.current.close()
        }
        term.dispose()
      }
    }

    init()
    return () => cleanup?.()
  }, [streamUrl, content, wsUrl, isInteractive, connectWs])

  const style = isInteractive
    ? { width: '100%', height: '100%' }
    : { width: '100%', height: `${height}px` }

  return (
    <div
      ref={containerRef}
      class="rounded-lg overflow-hidden"
      style={style}
    />
  )
}
```

- [ ] **Step 2: Verify build compiles**

```bash
cd /Users/joselito/Workspace/personal/forge/.tasks/initial/packages/ui
npx tsc --noEmit
```

Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/Terminal.tsx
git commit -m "feat(ui): add interactive WebSocket mode to ForgeTerminal — bidirectional PTY support"
```

---

### Task 5: SplitPane — resizable sidebar component

**Files:**
- Create: `packages/ui/src/SplitPane.tsx`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Create SplitPane component**

Create `packages/ui/src/SplitPane.tsx`:

```typescript
import { type FunctionComponent, type ComponentChildren } from 'preact'
import { useState, useRef, useCallback, useEffect } from 'preact/hooks'

interface SplitPaneProps {
  left: ComponentChildren
  right: ComponentChildren
  defaultWidth?: number
  minWidth?: number
  maxWidth?: number
  storageKey?: string
}

export const SplitPane: FunctionComponent<SplitPaneProps> = ({
  left,
  right,
  defaultWidth = 300,
  minWidth = 200,
  maxWidth = 600,
  storageKey = 'forge-split-width'
}) => {
  const [width, setWidth] = useState<number>(() => {
    if (typeof localStorage !== 'undefined' && storageKey) {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const n = parseInt(saved, 10)
        if (!isNaN(n) && n >= minWidth && n <= maxWidth) return n
      }
    }
    return defaultWidth
  })

  const dragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)

  const onMouseDown = useCallback((e: MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    startX.current = e.clientX
    startWidth.current = width
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [width])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const delta = e.clientX - startX.current
      const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidth.current + delta))
      setWidth(newWidth)
    }

    const onMouseUp = () => {
      if (!dragging.current) return
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      if (typeof localStorage !== 'undefined' && storageKey) {
        localStorage.setItem(storageKey, String(width))
      }
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [width, minWidth, maxWidth, storageKey])

  return (
    <div class="flex h-full w-full overflow-hidden">
      {/* Left pane (sidebar) */}
      <div
        class="shrink-0 overflow-y-auto overflow-x-hidden"
        style={{ width: `${width}px` }}
      >
        {left}
      </div>

      {/* Drag handle */}
      <div
        class="shrink-0 w-1 cursor-col-resize hover:bg-forge-accent/30 transition-colors"
        style={{ backgroundColor: 'var(--forge-ghost-border)' }}
        onMouseDown={onMouseDown}
      />

      {/* Right pane (terminal) */}
      <div class="flex-1 min-w-0 overflow-hidden">
        {right}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Export from index**

In `packages/ui/src/index.ts`, add:

```typescript
export { SplitPane } from './SplitPane.js'
```

- [ ] **Step 3: Verify build**

```bash
cd /Users/joselito/Workspace/personal/forge/.tasks/initial/packages/ui
npx tsc --noEmit
```

Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/SplitPane.tsx packages/ui/src/index.ts
git commit -m "feat(ui): add SplitPane — resizable split layout with localStorage persistence"
```

---

### Task 6: Accordion — collapsible sections for sidebar

**Files:**
- Create: `packages/ui/src/Accordion.tsx`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Create Accordion component**

Create `packages/ui/src/Accordion.tsx`:

```typescript
import { type FunctionComponent, type ComponentChildren } from 'preact'
import { useState } from 'preact/hooks'

interface AccordionSectionProps {
  title: string
  defaultOpen?: boolean
  children: ComponentChildren
}

export const AccordionSection: FunctionComponent<AccordionSectionProps> = ({
  title,
  defaultOpen = false,
  children
}) => {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div class="border-b" style={{ borderColor: 'var(--forge-ghost-border)' }}>
      <button
        class="flex items-center justify-between w-full px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-forge-muted hover:text-forge-text transition-colors"
        onClick={() => setOpen(!open)}
      >
        <span>{title}</span>
        <span
          class="transition-transform"
          style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
        >
          ▸
        </span>
      </button>
      {open && (
        <div class="px-3 pb-3">
          {children}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Export from index**

In `packages/ui/src/index.ts`, add:

```typescript
export { AccordionSection } from './Accordion.js'
```

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/Accordion.tsx packages/ui/src/index.ts
git commit -m "feat(ui): add AccordionSection — collapsible section for sidebar panels"
```

---

### Task 7: TaskDetail — redesign to split layout

**Files:**
- Modify: `packages/console/src/pages/TaskDetail.tsx`

- [ ] **Step 1: Rewrite TaskDetail as split layout**

Replace the full content of `packages/console/src/pages/TaskDetail.tsx` with:

```typescript
import { type FunctionComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { ActionButton, Badge, ForgeTerminal, SplitPane, AccordionSection, showToast } from '@forge-dev/ui'
import type { CWSession } from '@forge-dev/core'

interface TaskDetailProps {
  session: CWSession
  onBack: () => void
  onDone: () => void
}

export const TaskDetail: FunctionComponent<TaskDetailProps> = ({ session, onBack, onDone }) => {
  const [gitLog, setGitLog] = useState<string>('')
  const [gitDiff, setGitDiff] = useState<string>('')
  const [gitStatus, setGitStatus] = useState<string>('')
  const [notes, setNotes] = useState<string>('')
  const [branch, setBranch] = useState<string>('')
  const [stack, setStack] = useState<Record<string, unknown> | null>(null)
  const [mcps, setMcps] = useState<{ global: Record<string, unknown>; project: string[]; cw: string[]; plugins: string[] } | null>(null)
  const [ptyExited, setPtyExited] = useState(false)
  const [connected, setConnected] = useState(false)
  const [wsKey, setWsKey] = useState(0) // increment to force reconnect

  const sessionDir = session.type === 'review' ? `review-pr-${session.pr}` : `task-${session.task}`
  const taskName = session.type === 'review' ? `PR #${session.pr}` : session.task
  const typeLabel = session.type === 'review' ? 'REVIEW' : 'DEV'
  const typeColor = session.type === 'review' ? 'var(--forge-accent)' : 'var(--forge-warning)'

  const wsUrl = `ws://${window.location.host}/ws/terminal/${session.project}/${sessionDir}?k=${wsKey}`

  const fetchSidebarData = async () => {
    const [logRes, diffRes, statusRes, notesRes] = await Promise.all([
      fetch(`/api/cw/git/log/${session.project}/${sessionDir}`).catch(() => null),
      fetch(`/api/cw/git/diff/${session.project}/${sessionDir}`).catch(() => null),
      fetch(`/api/cw/git/status/${session.project}/${sessionDir}`).catch(() => null),
      fetch(`/api/cw/notes/${session.project}/${sessionDir}`).catch(() => null)
    ])
    if (logRes) setGitLog((await logRes.json() as { output: string }).output)
    if (diffRes) setGitDiff((await diffRes.json() as { output: string }).output)
    if (statusRes) setGitStatus((await statusRes.json() as { output: string }).output)
    if (notesRes) setNotes((await notesRes.json() as { content: string }).content)

    // Extract branch name from first log line or task name
    setBranch(session.task ?? session.pr ?? '')
  }

  const fetchTools = async () => {
    try {
      const [stackRes, mcpsRes] = await Promise.all([
        fetch(`/api/cw/detect/${session.project}`),
        fetch(`/api/cw/mcps?project=${session.project}`)
      ])
      setStack(await stackRes.json() as Record<string, unknown>)
      setMcps(await mcpsRes.json() as { global: Record<string, unknown>; project: string[]; cw: string[]; plugins: string[] })
    } catch {}
  }

  useEffect(() => {
    fetchSidebarData()
    fetchTools()
  }, [session])

  const markDone = async () => {
    try {
      await fetch('/api/cw/done', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: session.project,
          task: session.type === 'review' ? session.pr : session.task,
          type: session.type
        })
      })
      showToast('Task closed', 'info')
      onDone()
    } catch {
      showToast('Failed to close task', 'error')
    }
  }

  const handleRestart = () => {
    setPtyExited(false)
    setWsKey(k => k + 1)
  }

  /* ---- Sidebar content ---- */
  const sidebar = (
    <div class="h-full bg-forge-bg">
      {/* Quick stats */}
      <div class="px-3 py-3 border-b" style={{ borderColor: 'var(--forge-ghost-border)' }}>
        <div class="text-xs text-forge-muted mb-1">
          {session.opens} session{session.opens !== 1 ? 's' : ''}
        </div>
        {gitStatus && (
          <div class="text-xs text-forge-muted">
            {gitStatus.split('\n').filter(Boolean).length} file{gitStatus.split('\n').filter(Boolean).length !== 1 ? 's' : ''} changed
          </div>
        )}
      </div>

      <AccordionSection title="Status" defaultOpen={true}>
        {gitStatus ? (
          <pre class="text-[11px] font-mono text-forge-text whitespace-pre-wrap break-all">{gitStatus}</pre>
        ) : (
          <span class="text-xs text-forge-muted">Clean</span>
        )}
        {gitLog && (
          <div class="mt-3">
            <div class="text-[10px] text-forge-muted uppercase mb-1">Commits</div>
            <pre class="text-[11px] font-mono text-forge-text whitespace-pre-wrap break-all">{gitLog}</pre>
          </div>
        )}
      </AccordionSection>

      <AccordionSection title="Diff">
        {gitDiff ? (
          <pre class="text-[11px] font-mono text-forge-text whitespace-pre-wrap break-all max-h-[300px] overflow-auto">{gitDiff}</pre>
        ) : (
          <span class="text-xs text-forge-muted">No diff</span>
        )}
      </AccordionSection>

      <AccordionSection title="Notes">
        {notes ? (
          <pre class="text-[11px] font-mono text-forge-text whitespace-pre-wrap break-all max-h-[400px] overflow-auto">{notes}</pre>
        ) : (
          <span class="text-xs text-forge-muted">No notes</span>
        )}
      </AccordionSection>

      <AccordionSection title="Tools">
        <div class="space-y-2">
          {stack && (
            <div class="flex flex-wrap gap-1">
              {stack.framework && (
                <span class="px-2 py-0.5 rounded text-[10px] font-medium" style={{ backgroundColor: 'rgba(99,102,241,0.1)', color: 'var(--forge-accent)', border: '1px solid rgba(99,102,241,0.2)' }}>
                  {String(stack.framework)}
                </span>
              )}
              {stack.testRunner && (
                <span class="px-2 py-0.5 rounded text-[10px] font-medium" style={{ backgroundColor: 'rgba(16,185,129,0.1)', color: 'var(--forge-success)', border: '1px solid rgba(16,185,129,0.2)' }}>
                  {String(stack.testRunner)}
                </span>
              )}
              {stack.hasTailwind && (
                <span class="px-2 py-0.5 rounded text-[10px] font-medium" style={{ backgroundColor: 'rgba(56,189,248,0.1)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.2)' }}>
                  Tailwind
                </span>
              )}
              {stack.hasPlaywright && (
                <span class="px-2 py-0.5 rounded text-[10px] font-medium" style={{ backgroundColor: 'rgba(16,185,129,0.1)', color: 'var(--forge-success)', border: '1px solid rgba(16,185,129,0.2)' }}>
                  Playwright
                </span>
              )}
              {stack.hasDockerfile && (
                <span class="px-2 py-0.5 rounded text-[10px] font-medium" style={{ backgroundColor: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.2)' }}>
                  Docker
                </span>
              )}
            </div>
          )}
          {mcps && (
            <div class="text-[11px] text-forge-muted">
              {[...Object.keys(mcps.global), ...mcps.project, ...mcps.cw].join(', ') || 'No MCPs'}
            </div>
          )}
        </div>
      </AccordionSection>
    </div>
  )

  /* ---- Terminal content ---- */
  const terminal = (
    <div class="h-full relative">
      <ForgeTerminal
        wsUrl={wsUrl}
        onExit={(code) => setPtyExited(true)}
        onConnectionChange={(c) => setConnected(c)}
      />
      {/* Reconnecting overlay */}
      {!connected && !ptyExited && (
        <div class="absolute inset-0 flex items-center justify-center bg-black/50 pointer-events-none">
          <span class="text-sm text-white/70">Connecting...</span>
        </div>
      )}
    </div>
  )

  return (
    <div class="flex flex-col h-full">
      {/* ---- Header ---- */}
      <div class="flex items-center justify-between px-4 py-3 border-b shrink-0" style={{ borderColor: 'var(--forge-ghost-border)' }}>
        <div class="flex items-center gap-3">
          <button
            class="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors text-forge-muted hover:text-forge-text"
            style={{ backgroundColor: 'var(--forge-ghost-bg)', borderColor: 'var(--forge-ghost-border)' }}
            onClick={onBack}
          >
            ←
          </button>
          <Badge label={typeLabel} color={typeColor} />
          <span class="text-base font-bold text-forge-text">{taskName}</span>
          <span class="text-sm text-forge-muted">{session.project}</span>
          {branch && (
            <span class="text-xs font-mono text-forge-muted px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--forge-ghost-bg)' }}>
              {branch}
            </span>
          )}
        </div>
        <div class="flex items-center gap-2">
          {/* Connection indicator */}
          <span
            class="w-2 h-2 rounded-full"
            style={{ backgroundColor: connected ? 'var(--forge-success)' : 'var(--forge-muted)' }}
            title={connected ? 'Connected' : 'Disconnected'}
          />
          {ptyExited && (
            <ActionButton label="Restart" variant="secondary" onClick={handleRestart} />
          )}
          {session.status === 'active' && (
            <ActionButton label="Done" variant="secondary" onClick={markDone} />
          )}
        </div>
      </div>

      {/* ---- Split layout ---- */}
      <div class="flex-1 min-h-0">
        <SplitPane
          left={sidebar}
          right={terminal}
          defaultWidth={300}
          minWidth={200}
          maxWidth={500}
          storageKey="forge-task-sidebar-width"
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify console builds**

```bash
cd /Users/joselito/Workspace/personal/forge/.tasks/initial/packages/console
npx vite build
```

Expected: Build succeeds with no errors

- [ ] **Step 3: Commit**

```bash
git add packages/console/src/pages/TaskDetail.tsx
git commit -m "feat(console): redesign TaskDetail — split layout with sidebar + embedded terminal"
```

---

### Task 8: Remove old WebSocketHub

**Files:**
- Delete: `packages/core/src/ws.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Remove WebSocketHub export from index**

In `packages/core/src/index.ts`, remove this line:

```typescript
export { WebSocketHub } from './ws.js'
```

- [ ] **Step 2: Delete ws.ts**

```bash
rm packages/core/src/ws.ts
```

- [ ] **Step 3: Verify nothing imports it**

```bash
cd /Users/joselito/Workspace/personal/forge/.tasks/initial
grep -r "WebSocketHub\|from.*ws\.js\|from.*ws'" packages/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v dist | grep -v ".test."
```

Expected: No results (nothing imports it)

- [ ] **Step 4: Run core tests to verify nothing broke**

```bash
cd /Users/joselito/Workspace/personal/forge/.tasks/initial/packages/core
npx vitest run
```

Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/index.ts
git rm packages/core/src/ws.ts
git commit -m "chore(core): remove unused WebSocketHub — replaced by PTYManager"
```

---

### Task 9: Integration test — full WebSocket round-trip

**Files:**
- Modify: `packages/core/src/pty-routes.test.ts`

- [ ] **Step 1: Add integration test that verifies PTYManager + CWReader work together**

Append to `packages/core/src/pty-routes.test.ts`:

```typescript
describe('PTY Routes — integration', () => {
  it('getOrCreate + attach + detach lifecycle', () => {
    const reader = new CWReader(TEST_CW)
    const session = reader.getSession('testproj', 'task-mytask')!
    const sessionId = 'testproj::task-mytask'

    // Ensure clean state
    if (manager.has(sessionId)) manager.kill(sessionId)

    // Create
    const ptySession = manager.getOrCreate('testproj', 'task-mytask', session)
    expect(ptySession.clients.size).toBe(0)

    // Attach two clients
    const client1 = { send: vi.fn(), close: vi.fn() }
    const client2 = { send: vi.fn(), close: vi.fn() }
    manager.attach(sessionId, client1)
    manager.attach(sessionId, client2)
    expect(ptySession.clients.size).toBe(2)

    // Detach one — PTY stays
    manager.detach(sessionId, client1)
    expect(ptySession.clients.size).toBe(1)
    expect(manager.has(sessionId)).toBe(true)

    // Detach last — PTY still stays (just marks lastClientDisconnect)
    manager.detach(sessionId, client2)
    expect(ptySession.clients.size).toBe(0)
    expect(manager.has(sessionId)).toBe(true)
    expect(ptySession.lastClientDisconnect).not.toBeNull()
  })

  it('kill removes session completely', () => {
    const reader = new CWReader(TEST_CW)
    const session = reader.getSession('testproj', 'task-mytask')!
    const sessionId = 'testproj::task-mytask'

    if (!manager.has(sessionId)) {
      manager.getOrCreate('testproj', 'task-mytask', session)
    }

    manager.kill(sessionId)
    expect(manager.has(sessionId)).toBe(false)
  })
})
```

- [ ] **Step 2: Add vi import at top of file if not present**

Make sure the file imports `vi` from vitest:

```typescript
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
```

- [ ] **Step 3: Run the integration tests**

```bash
cd /Users/joselito/Workspace/personal/forge/.tasks/initial/packages/core
npx vitest run src/pty-routes.test.ts
```

Expected: All tests PASS

- [ ] **Step 4: Run all core tests to ensure nothing is broken**

```bash
cd /Users/joselito/Workspace/personal/forge/.tasks/initial/packages/core
npx vitest run
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/pty-routes.test.ts
git commit -m "test(core): add integration tests for PTY lifecycle — attach, detach, kill"
```

---

### Task 10: Full build verification

**Files:** None (verification only)

- [ ] **Step 1: Build all packages**

```bash
cd /Users/joselito/Workspace/personal/forge/.tasks/initial
npx turbo build
```

Expected: All packages build successfully

- [ ] **Step 2: Run all tests**

```bash
cd /Users/joselito/Workspace/personal/forge/.tasks/initial
npx turbo test
```

Expected: All tests pass

- [ ] **Step 3: Verify the full server starts**

```bash
cd /Users/joselito/Workspace/personal/forge/.tasks/initial
node -e "
const { createForgeServer } = require('@forge-dev/core');
const server = createForgeServer({ dataDir: '/tmp/forge-test' });
console.log('Server created, injectWebSocket:', typeof server.injectWebSocket);
server.close();
console.log('OK');
"
```

Expected: `Server created, injectWebSocket: function` then `OK`

- [ ] **Step 4: Final commit if any fixes were needed**

Only if previous steps required adjustments.
