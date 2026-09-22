# Forge — Visual Dashboard for CW

## What is this

Forge is the web dashboard for CW (Coding Workspace). It reads `~/.cw/` and `~/.claude/` to show worktree sessions, tasks, PR reviews, accounts, skills, MCPs, and plugins in a visual UI with interactive terminals. Sessions can run on any harness CW supports (Claude Code, Codex, Pi, OpenCode; needs CW 0.3.0).

## Stack

| Layer | Tech |
|-------|------|
| Server | Hono (Node.js) |
| Dashboard | Preact + UnoCSS + Vite |
| Terminal | xterm.js + node-pty (WebSocket) |
| Database | better-sqlite3 (local) / PostgreSQL (team) |
| CLI | Commander.js |
| Build | Turborepo |
| Tests | Vitest (466 tests, all in `packages/core`) |
| Language | TypeScript (strict) |

## Monorepo Structure

```
packages/
  core/       → Hono server, CW reader, PTY manager, harness logins, skills, Liveframe launcher, DB, action runner
  console/    → Preact dashboard
  ui/         → Shared UI components (Terminal, StatusCard, ActionButton, Toast...)
  sdk/        → Module SDK (definePanel, types)
  cli/        → CLI commands (forge init/console/doctor/module/project/run)
  platform/   → Entry point (npx @forge-dev/platform)
modules/
  mod-hello/      — Minimal example manifest
  mod-dev/        — CW wrapper (worktrees, sessions)
  mod-scaffold/   — Project creation wizard
  mod-planning/   — Linear + Notion + diagrams
  mod-design/     — Figma + tokens + wireframes
  mod-qa/         — Tests, security, load, visual
  mod-release/    — Deploy, flags, rollback, changelog
  mod-monitor/    — Health, errors, uptime, costs
tests/integration/ — Cross-package tests (not wired, see Development)
```

Modules are `forge-module.json` manifests plus panels. The server loads manifests from `~/.forge/modules` (installed with `forge module add`), not from the repo's `modules/`, and runs their actions through `/api/actions`. The console has not rendered module panels since its rewrite as a CW task launcher: there is no panel registry.

## Console Architecture

```
App (app.tsx) → Shell (shell.tsx: theme, overlay sidebar signal)
├── useTabManager    → tab state, sessionStorage, keyboard shortcuts
├── useTaskFilters   → project/type/harness filters, derived data
├── useHarnesses     → shared `cw doctor` store, 3 s polling
├── useUsage         → shared usage limit store, 60 s polling
├── useSessionStates → shared session state store, 2 s polling, notifications
├── useTerminalMetrics → context, tokens and cost parsed from terminal output
├── config/types.ts  → TYPE_STYLES (one token per type), QUICK_TYPES, helpers
├── state/startTask.ts → start card / drawer shared input and type override
│
├── Sidebar → nav, projects, live session cards, usage limit meters, appearance
├── Views (view: list | accounts | skills | prototypes)
│   ├── TaskList → StartCard, segmented filters, per-project cards (TaskRow, DoneRow), ProjectBanner
│   ├── Accounts → AccountCell, AccountLimits, AddAccountForm, DeviceLoginPanel
│   ├── Skills (rail + editor/create/explore pane, Plugins group → plugin/propose pane)
│   └── Prototypes → Liveframe frames: create, pull, push, open an agent in a frame
├── Tabs layer (kept mounted, hidden on the list)
│   ├── TabBar → pill tabs, add menu
│   └── TaskDetail → identity, metric strip, context panel, framed xterm terminal
├── NewTask (right drawer) → HarnessPicker
├── CommandPalette (⌘K, /)
├── CreateProjectModal → DirectoryPicker
└── CloseTaskDialog (shared by TaskRow and TaskDetail)
```

## Key Files

### Core
- `packages/core/src/server.ts` — Main Hono app, mounts every route group and the guard/auth middleware
- `packages/core/src/cw-reader.ts` — Reads ~/.cw/ (sessions, projects, accounts, skills, MCPs, stack detection)
- `packages/core/src/cw-routes.ts` — CW API endpoints (spaces, start, done, accounts, logins, projects, git)
- `packages/core/src/pty-manager.ts` — node-pty session manager with idle cleanup
- `packages/core/src/pty-routes.ts` — WebSocket server for terminal sessions
- `packages/core/src/session-state.ts` — `StateTracker`: a live terminal's state (working, waiting, permission, error, exited, idle), read when the output settles; `state-classifier-local.ts` holds the Claude Code rules (latest marker wins, fixtures in `__fixtures__/terminal/claude`), `state-classifier-jev.ts` the optional TypeSafe Jev classifier
- `packages/core/src/db.ts` — SQLite database layer (`db-postgres.ts` and `db-factory.ts` for team mode)
- `packages/core/src/runner.ts` — Command execution with streaming
- `packages/core/src/modules.ts` — Module manifest discovery (`~/.forge/modules`)
- `packages/core/src/cw-doctor.ts` — Shared `cw doctor --json` client, `CW_HARNESS` stripping, context tokens
- `packages/core/src/usage.ts` — Usage limit windows per account and harness: normalisation, severity, 45 s cache, stale fallback (`usage-claude.ts` reads the keychain and Claude's OAuth usage endpoint, `usage-codex.ts` asks the Codex app server over JSON-RPC)
- `packages/core/src/harness-capabilities.ts` — Capability table (CW does not expose it)
- `packages/core/src/login-manager.ts` — Hidden PTYs for headless logins
- `packages/core/src/api-key-login.ts` — API key import over stdin
- `packages/core/src/origin-guard.ts` — Same-machine check for HTTP and terminal WebSockets, `FORGE_HOST` bind address
- `packages/core/src/auth.ts` — Bearer token middleware (team mode)
- `packages/core/src/skill-routes.ts` — Skills CRUD per scope, skills.sh search and install
- `packages/core/src/plugins.ts` — Claude Code plugins per config dir (global and each account): installs, skills from `plugin.json`, repository matched to a CW project by git remote
- `packages/core/src/liveframe.ts` / `liveframe-routes.ts` — Liveframe frames in `~/liveframe/<project>/<frame>` through the `lf` CLI (new, pull, push); reads only the API base from `~/.liveframe/config.json`
- `packages/core/src/task-review.ts` — A task's review state: git snapshot, base branch, pull request via `gh`, GitHub link, close warnings (injected command runner)
- `packages/core/src/editors.ts` — Editor detection (PATH, macOS apps) and opening a worktree
- `packages/core/src/test-git.ts` — Fixture repositories for tests, isolated from the global git config (not built)

### Console
- `packages/console/src/app.tsx` — Root component, tab/filter/view orchestration
- `packages/console/src/config/types.ts` — Shared type styles, helpers (single source of truth)
- `packages/console/src/styles/theme.css` — Design tokens (dark/light), keyframes, responsive rules, reduced-motion guard
- `packages/console/src/hooks/useTabManager.ts` — Tab state, persistence, keyboard shortcuts
- `packages/console/src/hooks/useTaskFilters.ts` — Filter state, derived data
- `packages/console/src/hooks/useHarnesses.ts` — Shared harness store, 3 s polling
- `packages/console/src/hooks/useUsage.ts` — Shared usage limit store, 60 s polling while the tab is visible
- `packages/console/src/hooks/useSessionStates.ts` — Shared session state store, 2 s polling (15 s while hidden), listeners for sessions that start needing the user; `state/notifications.ts` holds the browser notification switch
- `packages/console/src/components/AccountLimits.tsx` — A harness row's limit meter on the Accounts page
- `packages/console/src/components/TaskCard.tsx` — TaskRow, DoneRow, TypeTile, LivePill
- `packages/console/src/components/ProjectBanner.tsx` — Project info (stack, MCPs, delete)
- `packages/console/src/components/TabBar.tsx` — Pill tabs with add menu
- `packages/console/src/components/Sidebar.tsx` — Nav, projects, live session meters, appearance switch
- `packages/console/src/components/StartCard.tsx` — Start card, type inference line (`config/inference.ts`)
- `packages/console/src/components/CommandPalette.tsx` — ⌘K palette
- `packages/console/src/hooks/useTerminalMetrics.ts` — Status line parsing for context, tokens and cost
- `packages/console/src/components/HarnessPicker.tsx` — Harness selector and unavailable reasons
- `packages/console/src/pages/TaskList.tsx` — Main task list page
- `packages/console/src/pages/NewTask.tsx` — New task drawer (type, account, project, harness)
- `packages/console/src/pages/TaskDetail.tsx` — Terminal + git stats + MCP info
- `packages/console/src/pages/Accounts.tsx` — Account cards, Connect flows, account removal
- `packages/console/src/pages/Skills.tsx` — Skills browser/editor, "create with AI" session
- `packages/console/src/pages/SkillPlugins.tsx` — Plugins group, plugin pane (accounts, Update, read-only skills), Propose a skill form (`config/plugins.ts` builds the task)
- `packages/console/src/pages/Prototypes.tsx` — Liveframe launcher: local frames, create/pull, push, Open agent (a general session in the frame folder)
- `packages/console/src/hooks/useTaskReview.ts` — Shared review state per session; TaskDetail's active tab polls every 60 s
- `packages/console/src/components/TaskLinks.tsx` — GitHub and Open in editor buttons
- `packages/console/src/components/CloseTaskDialog.tsx` — Confirmation before closing a task that could lose work

## Development

```bash
pnpm start            # Install + build + launch on http://localhost:3000 (one command)
pnpm dev              # Watchers: tsc --watch for packages, Vite for console (no API server)
pnpm build            # Build all
pnpm test             # Run all tests (only packages/core has a test script)
```

`pnpm dev` does not start the API. Vite serves the console on `:5173` and proxies `/api` and `/ws` to `:3000`, so run `FORGE_NO_OPEN=1 node packages/platform/dist/index.js` alongside it and restart that after core changes.

`tests/integration/` is not run by any script, and running it directly fails because the root has no `hono` dependency.

### Environment

- `FORGE_PORT` — listen port (default 3000)
- `FORGE_HOST` — listen address; setting it turns the same-machine check off (see `origin-guard.ts`)
- `FORGE_DB_URL`, `FORGE_AUTH_TOKEN` — team mode (PostgreSQL + bearer token)
- `FORGE_NO_OPEN=1` — do not open the browser on start
- `FORGE_LIVEFRAME_ACCOUNT` — CW account for Liveframe agents (default `monoku`)
- `FORGE_STATE_CLASSIFIER=jev`, `TYPESAFE_API_KEY`, `FORGE_JEV_MODEL` — send unsure terminal screens to TypeSafe Jev (off by default; terminal text leaves the machine)

## API Endpoints

### CW (`/api/cw`)
- `GET /spaces` — List all sessions (sorted by last_opened)
- `GET /session/:project/:sessionDir`, `GET /notes/:project/:sessionDir` — One session, its notes
- `GET /projects` — List registered CW projects
- `POST /register-project`, `POST /move-project`, `POST /delete-project`, `GET /browse-dirs` — Project management
- `GET /accounts` — List CW accounts
- `POST /accounts` — Create an account (optional harness, provider, model)
- `DELETE /accounts/:name` — Delete an account
- `POST /accounts/:name/login`, `GET|DELETE /accounts/:name/login/:harness` — Headless device login (codex)
- `POST /accounts/:name/api-key` — Import an API key over stdin (codex)
- `GET /harnesses` — `cw doctor --json`, per-harness capabilities, Linear/Notion token presence
- `GET /usage` — Usage limit windows per account and harness (45 s cache, `?fresh=1`); percentages only, never a credential
- `GET /tools?project=X`, `GET /mcps` — MCPs + plugins for a project
- `GET /detect/:project` — Stack detection (framework, test runner, tools)
- `GET /git/{status,log,branch,diff}/:project/:sessionDir` — Git info
- `POST /start` — Start a task, review, loop, general or create session (spawns cw command); a general session takes `directory` and `task` to run in any folder under a name
- `POST /done` — Runs `cw <work|review|loop> --done` and waits; `500 { error }` when CW fails
- `GET /review-state/:project/:sessionDir` — Changes, pull request, GitHub link and close warnings (30 s cache, `?fresh=1`)
- `GET /editors`, `POST /open-in-editor` — Detected editors and opening a worktree (local mode only)
- `POST /terminal/kill` — Kill a session's PTY
- `GET /session-states` — `{ classifier, states }`: state, confidence, since and source per live PTY (`project::sessionDir`); never terminal text

### Other
- `WS /ws/terminal/:project/:sessionDir` — Interactive terminal via WebSocket
- `/api/skills` — `GET /`, `GET|PUT|DELETE /{global,account/:account,project/:project}/:name`, references, `POST /`, `GET /explore` (skills.sh), `POST /install`, `GET /plugins`, `GET /plugins/:id/skills/:name`, `POST /plugins/:id/update`
- `/api/liveframe` — `GET /status` (agent account, lf installed, signed in, API base), `GET /frames`, `POST /frames` (`lf new`), `POST /pull`, `POST /frames/:project/:frame/push`
- `/api/modules`, `/api/actions/:module/:action[/stream]`, `/api/action-logs`, `/api/projects`, `/api/registry/search`, `/api/filesystem/browse`, `/api/health` — Module system and Forge's own DB

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
- UnoCSS utility classes plus inline `style` with the `theme.css` tokens (`var(--card)`, `var(--ink-2)`…) — no CSS modules, no styled-components
- Motion uses `var(--ease)`; tints are `color-mix(in srgb, var(<token>) 18%, transparent)` (`soft()` in `config/types.ts`)
- Vitest for all tests
- Each module is independent — no cross-module imports
- UI components go in `@forge-dev/ui`, not in individual modules
- Shared console config in `config/types.ts` — never duplicate TYPE_STYLES
- Commit messages: `feat(scope):`, `fix(scope):`, `refactor:`, `test:`, `docs:`
- Update `CHANGELOG.md` (Unreleased) for user-visible changes

## Do NOT

- Do not import between modules (mod-qa cannot import from mod-dev)
- Do not use React — this is Preact
- Do not add runtime CSS libraries — UnoCSS handles everything at build time
- Do not duplicate type configs — use `config/types.ts`
- Do not concatenate shell args as strings — use spawn with args array
- Do not skip tests
- Do not store secrets in config files
- Do not break the `npx @forge-dev/platform` zero-config experience
- Do not open local mode to other origins or hosts — routes go through `origin-guard.ts`; remote access is `FORGE_HOST`

## Related Projects

- **CW (Coding Workspace)** — The CLI tool Forge wraps. Source at `/Users/joselito/workspace/personal/cw/`. Bash script (~6200 lines) plus one driver per harness in `lib/harnesses/`. `install.sh` copies it into `~/.cw`, so re-run it after changing CW. Forge spawns CW commands like `cw work`, `cw review`, `cw launch` via PTY.
