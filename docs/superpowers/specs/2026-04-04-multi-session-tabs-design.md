# Multi-Session Terminal Tabs

**Date**: 2026-04-04
**Status**: Approved

## Summary

Allow opening multiple CW sessions simultaneously in Forge, each in its own tab. PTYs persist while tabs are open. Closing a tab kills the PTY immediately. Max 5 tabs.

## Tab State

Managed in `App` component:

```
openTabs: CWSession[]     // max 5
activeTabIndex: number     // which tab is visible
```

### Rules

- Open task from list → if already in tabs, activate that tab. If not, add new tab (max 5, toast if at limit).
- Close tab (× or ←) → kill PTY immediately, remove from array. If last tab, return to list.
- Click Forge logo → switch view to list without closing tabs or killing PTYs.
- Click another tab → switch `activeTabIndex`.
- Return from list to task already open → activate existing tab.

## Layout

```
┌──────────────────────────────────────────────────────────┐
│  🔥 Forge (click→list)                           ☀ Light │
├──────────────────────────────────────────────────────────┤
│  fix-login (propia) │ MER-6962 (triton) × │              │
├──────────────────────────────────────────────────────────┤
│  ← DEV  MER-6962   triton   branch   ●           Done   │
│  1 file · 20 commits · 15 sessions                    ▼ │
├──────────────────────────────────────────────────────────┤
│  Terminal (xterm.js)                                     │
└──────────────────────────────────────────────────────────┘
```

### Tab bar

- Between Forge header and task header
- Each tab: task name + project name + × button
- Active tab: bottom border colored by type (amber DEV, blue REVIEW)
- Inactive tab: muted text
- Only visible when 1+ tabs open

### ← button

Closes the active tab (same as ×). Not "Back to list".

### Forge logo

Always clickable. Goes to task list without closing anything.

## Terminal Persistence

All open terminals render simultaneously, only active one visible:

```tsx
{openTabs.map((session, i) => (
  <div
    key={`${session.project}::${session.task ?? session.pr}`}
    style={{ display: i === activeTabIndex ? 'block' : 'none', height: '100%' }}
  >
    <ForgeTerminal wsUrl={...} />
  </div>
))}
```

- `display: none` keeps DOM alive, xterm not destroyed
- WebSocket stays connected
- `fitAddon.fit()` called when tab is activated (size may have changed)

## Close Tab → Kill PTY

1. Client sends `POST /api/cw/terminal/kill` with `{ project, sessionDir }`
2. Server calls `PTYManager.kill(sessionId)`
3. WebSocket receives `{ type: "exit" }` and closes
4. Client removes tab from `openTabs`
5. If tabs remain → activate previous (or first)
6. If no tabs → view switches to list

## New Endpoint

`POST /api/cw/terminal/kill`

```json
{ "project": "triton", "sessionDir": "task-MER-6962" }
```

Server calls `PTYManager.kill("triton::task-MER-6962")`. Returns `{ ok: true }`.

## Files Modified

| File | Change |
|------|--------|
| `packages/console/src/app.tsx` | `openTabs` + `activeTabIndex` state. Open/close/activate logic. Render list or tabs view. |
| `packages/console/src/pages/TaskDetail.tsx` | Receives `onClose` prop. ← closes tab. Calls `fitAddon.fit()` on activate. |
| `packages/console/src/shell.tsx` | Forge logo receives `onLogoClick` prop. |
| `packages/core/src/pty-routes.ts` | Add kill endpoint. |

## Not Changed

- `PTYManager` — already has `kill()`, cleanup stays as fallback
- `ForgeTerminal` — already works, just mounted/hidden with display
