# Web Terminal — Embedded Claude Code Sessions in Forge

**Date**: 2026-04-03  
**Status**: Approved  

## Summary

Embed a full interactive terminal inside Forge's TaskDetail view so users can run Claude Code sessions directly in the browser instead of opening a separate terminal window. CW remains the backend — Forge renders the PTY that CW would normally open in iTerm.

## Architecture

```
Browser (xterm.js)  ←— WebSocket —→  Hono Server (node-pty)  →  cw work/review
```

### Flow

1. User opens TaskDetail → client opens WebSocket to `/ws/terminal/:project/:sessionDir`
2. Server looks up existing PTY for that session via PTYManager
   - Exists & alive: reconnect (send scrollback buffer, then live stream)
   - Doesn't exist: spawn `cw work <project> <task>` (or `cw review`) via node-pty
3. Keystrokes from user go via WebSocket → PTY stdin
4. PTY stdout goes via WebSocket → xterm.js
5. User navigates away → WebSocket closes, PTY stays alive
6. User returns → reconnects, receives scrollback

## PTY Manager

New file: `packages/core/src/pty-manager.ts`

```
PTYManager
├── sessions: Map<string, PTYSession>
│   key = "project::sessionDir"
│
├── PTYSession {
│     pty: IPty              // node-pty process
│     scrollback: string[]   // circular buffer, last ~5000 lines
│     clients: Set<WebSocket>
│     cwd: string            // worktree path
│     createdAt: Date
│   }
│
├── getOrCreate(project, sessionDir, session) → PTYSession
│   - If exists & pty alive → return existing
│   - Else → spawn via node-pty:
│     task:   pty.spawn(shell, ['-c', 'cw work <project> <task> --account <account>'])
│     review: pty.spawn(shell, ['-c', 'cw review <project> <pr> --account <account>'])
│     shell = process.env.SHELL || '/bin/zsh'
│     cwd = session.worktree
│
├── attach(sessionId, ws) → void
│   - Add ws to clients
│   - Send scrollback buffer
│   - Pipe: pty.onData → ws.send()
│
├── detach(sessionId, ws) → void
│   - Remove ws from clients
│   - PTY stays alive
│
├── kill(sessionId) → void
│   - pty.kill(), clean from map
│
└── cleanup() → void
    - Kill PTYs with no clients for >30 min
    - Called by setInterval every 5 min
```

## WebSocket Endpoint

New file: `packages/core/src/pty-routes.ts`

**Endpoint**: `GET /ws/terminal/:project/:sessionDir`

### Protocol

Client → Server (JSON):
```json
{ "type": "input",  "data": "ls\r" }
{ "type": "resize", "cols": 120, "rows": 40 }
```

Server → Client (JSON):
```json
{ "type": "output",    "data": "..." }
{ "type": "scrollback", "data": "..." }
{ "type": "exit",      "code": 0 }
{ "type": "error",     "message": "..." }
```

### Handshake

1. Client connects to WebSocket
2. Server calls `PTYManager.getOrCreate()`
3. Server sends `scrollback` with accumulated buffer
4. Bidirectional streaming begins: input ↔ output

### PTY exit

When the PTY dies (user types `exit`, or `cw` terminates):
- Server sends `{ type: "exit", code }` to all clients
- Client shows "Session ended" in terminal
- "Restart" button becomes visible

## TaskDetail — Redesigned Layout

The current tab-based layout is replaced by a split layout:

```
┌──────────────────────────────────────────────────────────────┐
│  ← Back   fix-login-bug   project-x   main←feat/fix   ✓Done │
├──────────────┬───────────────────────────────────────────────┤
│  [sidebar]   ┊  [terminal - xterm.js full height]            │
│              ┊                                               │
│  ▸ Status    ┊  $ claude                                     │
│  ▸ Diff      ┊  ╭────────────────────────────╮               │
│  ▸ Notes     ┊  │ Looking at auth module...  │               │
│  ▸ Tools     ┊  ╰────────────────────────────╯               │
│              ┊                                               │
│  ─────────   ┊                                               │
│  3 commits   ┊                                               │
│  +42 / -15   ┊                                               │
│              ┊                                               │
├──────────────┴───────────────────────────────────────────────┤
│  ◀ ┃▸ drag handle                                            │
└──────────────────────────────────────────────────────────────┘
```

### Sidebar (left, ~300px default, resizable)

- Collapsible accordion sections: Status, Diff, Notes, Tools
- Quick stats at top: commits count, lines changed, session opens
- Content is the same as current tabs, but condensed vertically

### Terminal (main area, fills remaining width)

- xterm.js at full height, stdin enabled
- Auto-connects WebSocket on mount
- Reconnects if PTY already alive

### Resize handle

- Draggable border between sidebar and terminal
- `mousedown` → `mousemove` → update sidebar width
- xterm.js calls `fit()` on resize
- Saves preference to `localStorage`

### Header (full-width, top)

- Back button, task name, project name
- Branch info: `main ← feature/fix-login` (monospace, muted)
- Resume / Done buttons
- "Restart" button (visible only when PTY has exited)

## ForgeTerminal — Interactive Mode

Modified file: `packages/ui/src/Terminal.tsx`

New prop: `wsUrl?: string`

When `wsUrl` is set:
- `disableStdin: false` (enable input)
- Opens WebSocket on mount
- `terminal.onData(data => ws.send({ type: "input", data }))` — keystrokes to server
- `ws.onmessage(msg => terminal.write(msg.data))` — output to terminal
- `terminal.onResize(({ cols, rows }) => ws.send({ type: "resize", cols, rows }))` — sync size
- Auto-reconnect: exponential backoff 2s, 4s, 8s (max 5 attempts)
- On `scrollback` message: write entire buffer to show history

Backward compatible: `content` and `streamUrl` modes unchanged.

New addon: `@xterm/addon-web-links` for clickable URLs in output.

## Dependencies

| Package | Install | Why |
|---------|---------|-----|
| `packages/core` | `node-pty` | Spawn real PTY |
| `packages/core` | `@hono/node-ws` | WebSocket support for Hono |
| `packages/console` | `@xterm/addon-web-links` | Clickable links in terminal |

## Files

### New
- `packages/core/src/pty-manager.ts` — PTYManager class
- `packages/core/src/pty-routes.ts` — WebSocket endpoint
- `packages/core/src/pty-manager.test.ts` — PTYManager tests
- `packages/core/src/pty-routes.test.ts` — WebSocket endpoint tests

### Modified
- `packages/core/src/server.ts` — register pty-routes, init WebSocket upgrade
- `packages/ui/src/Terminal.tsx` — add `wsUrl` interactive mode
- `packages/ui/src/Terminal.test.tsx` — test new mode
- `packages/console/src/pages/TaskDetail.tsx` — redesign to split layout

### Can remove
- `packages/core/src/ws.ts` (WebSocketHub) — replaced by PTYManager

## Error Handling

| Scenario | Server | Client |
|----------|--------|--------|
| PTY won't start (cw missing, bad worktree) | Send `{ type: "error" }` | Red error text in terminal + "Retry" button |
| WebSocket drops (network, sleep) | — | Reconnect with backoff (2s, 4s, 8s, max 5) + "Reconnecting..." overlay |
| PTY dies unexpectedly (kill, OOM) | `pty.onExit` → send `{ type: "exit" }`, cleanup map | "Session ended (code X)" + "Restart" button |
| User closes browser | `detach()`, PTY lives 30min | On return: reconnect with scrollback |
| Resize before PTY ready | Buffer resize event | Apply after attach completes |

## Testing

### packages/core (Vitest)

**pty-manager.test.ts**:
- Create PTY, verify process exists
- Attach/detach clients, verify PTY stays alive
- Kill, verify cleanup
- Scrollback buffer: write N lines, verify reconnect receives buffer
- Cleanup timer: mock timers, verify idle PTY killed after 30 min

**pty-routes.test.ts**:
- WebSocket handshake success
- Bidirectional input/output
- Resize event
- Reconnect to existing PTY
- Error when session doesn't exist

### packages/ui (Vitest)

**Terminal.test.tsx**:
- `wsUrl` mode: verify WebSocket opens
- Reconnection: mock WS close, verify retry
- Backward compatible: `content` and `streamUrl` still work
