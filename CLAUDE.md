# Forge — Visual Dashboard for CW

## What is this

Forge is the web dashboard for CW (Claude Workspace Manager). It reads `~/.cw/` and `~/.claude/` to show worktree sessions, tasks, PR reviews, MCPs, and plugins in a visual UI with interactive terminals.

## Stack

| Layer | Tech |
|-------|------|
| Server | Hono (Node.js) |
| Dashboard | Preact + UnoCSS + Vite |
| Terminal | xterm.js + node-pty (WebSocket) |
| Database | better-sqlite3 (local) / PostgreSQL (team) |
| Build | Turborepo |
| Tests | Vitest (137 tests) |
| Language | TypeScript (strict) |

## Monorepo Structure

```
packages/
  core/       → Hono server, CW reader, PTY manager, DB, action runner
  console/    → Preact dashboard
  ui/         → Shared UI components (Terminal, StatusCard, ActionButton, Toast...)
  sdk/        → Module SDK (definePanel, types)
  cli/        → CLI commands
  platform/   → Entry point (npx @forge-dev/platform)
modules/
  mod-dev/        — CW wrapper (worktrees, sessions)
  mod-scaffold/   — Project creation wizard
  mod-planning/   — Linear + Notion + diagrams
  mod-design/     — Figma + tokens + wireframes
  mod-qa/         — Tests, security, load, visual
  mod-release/    — Deploy, flags, rollback, changelog
  mod-monitor/    — Health, errors, uptime, costs
```

## Console Architecture

```
App (app.tsx)
├── useTabManager    → tab state, sessionStorage, keyboard shortcuts
├── useTaskFilters   → account/project/type filters, derived data
├── config/types.ts  → shared TYPE_STYLES, QUICK_TYPES, helpers
│
├── List view
│   ├── OpenTabsBanner
│   ├── TaskList (pages/TaskList.tsx)
│   │   ├── FilterPill
│   │   ├── TaskCard, DoneTaskRow (components/TaskCard.tsx)
│   │   └── ProjectBanner (components/ProjectBanner.tsx)
│   ├── NewTask, CreateProjectModal
│
└── Tabs view
    ├── TabBar (components/TabBar.tsx)
    └── TaskDetail (pages/TaskDetail.tsx) → xterm.js terminal
```

## Key Files

### Core
- `packages/core/src/server.ts` — Main Hono app, all API routes
- `packages/core/src/cw-reader.ts` — Reads ~/.cw/ (sessions, projects, MCPs, stack detection)
- `packages/core/src/cw-routes.ts` — CW API endpoints (spaces, start, done, delete, git)
- `packages/core/src/pty-manager.ts` — node-pty session manager with idle cleanup
- `packages/core/src/pty-routes.ts` — WebSocket server for terminal sessions
- `packages/core/src/db.ts` — SQLite database layer
- `packages/core/src/runner.ts` — Command execution with streaming

### Console
- `packages/console/src/app.tsx` — Root component, tab/filter orchestration
- `packages/console/src/config/types.ts` — Shared type styles, helpers (single source of truth)
- `packages/console/src/hooks/useTabManager.ts` — Tab state, persistence, keyboard shortcuts
- `packages/console/src/hooks/useTaskFilters.ts` — Filter state, derived data
- `packages/console/src/components/TaskCard.tsx` — TaskCard, DoneTaskRow, TypeBadge
- `packages/console/src/components/ProjectBanner.tsx` — Project info (stack, MCPs, delete)
- `packages/console/src/components/TabBar.tsx` — Tab bar with add menu
- `packages/console/src/pages/TaskList.tsx` — Main task list page
- `packages/console/src/pages/TaskDetail.tsx` — Terminal + git stats + MCP info

## Development

```bash
npm start             # Install + build + launch (one command)
npx turbo dev         # Dev mode (all packages)
npx turbo build       # Build all
npx turbo test        # Run all tests
```

## API Endpoints

- `GET /api/cw/spaces` — List all sessions (sorted by last_opened)
- `GET /api/cw/projects` — List registered CW projects
- `GET /api/cw/accounts` — List CW accounts
- `GET /api/cw/tools?project=X` — MCPs + plugins for a project
- `GET /api/cw/detect/:project` — Stack detection (framework, test runner, tools)
- `GET /api/cw/git/{status,log,diff}/:project/:sessionDir` — Git info
- `POST /api/cw/start` — Start task/review/plan (spawns cw command)
- `POST /api/cw/done` — Mark session done (writes session.json + spawns cw --done)
- `WS /ws/terminal/:project/:sessionDir` — Interactive terminal via WebSocket

## MCP Reading

`cw-reader.ts getTools()` reads MCPs from multiple sources:
1. Global `~/.claude/settings.json` → `mcpServers`
2. Global `~/.claude/settings.json` → `projects.<path>.mcpServers`
3. Project `.mcp.json` (handles both `{ mcpServers: {...} }` and flat format)
4. Project `.claude/settings.json`
5. `~/.cw/mcps/` directory (CW-managed)
6. `~/.claude/plugins/installed_plugins.json` (with plugin `.mcp.json`)

Cloud MCPs (claude.ai Linear, Gmail, etc.) are not locally discoverable.

## Conventions

- TypeScript strict mode, no `any` unless interfacing with external libs
- ESM only (`"type": "module"` in all packages)
- Preact (not React) — use `preact/hooks`, `@preact/signals`
- UnoCSS utility classes — no CSS modules, no styled-components
- Vitest for all tests
- Each module is independent — no cross-module imports
- UI components go in `@forge-dev/ui`, not in individual modules
- Shared console config in `config/types.ts` — never duplicate TYPE_STYLES
- Commit messages: `feat(scope):`, `fix(scope):`, `refactor:`, `test:`, `docs:`

## Do NOT

- Do not import between modules (mod-qa cannot import from mod-dev)
- Do not use React — this is Preact
- Do not add runtime CSS libraries — UnoCSS handles everything at build time
- Do not duplicate type configs — use `config/types.ts`
- Do not concatenate shell args as strings — use spawn with args array
- Do not skip tests
- Do not store secrets in config files
- Do not break the `npx @forge-dev/platform` zero-config experience
