<div align="center">

<br />

```
                                                                        
    ███████╗ ██████╗ ██████╗  ██████╗ ███████╗
    ██╔════╝██╔═══██╗██╔══██╗██╔════╝ ██╔════╝
    █████╗  ██║   ██║██████╔╝██║  ███╗█████╗  
    ██╔══╝  ██║   ██║██╔══██╗██║   ██║██╔══╝  
    ██║     ╚██████╔╝██║  ██║╚██████╔╝███████╗
    ╚═╝      ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝
                                                
```

**Where ideas are shaped into software.**

[![MIT License](https://img.shields.io/badge/license-MIT-6366f1?style=for-the-badge)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-10b981?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/typescript-strict-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-f59e0b?style=for-the-badge)](CONTRIBUTING.md)

<br />

**Forge** is a visual dashboard for [CW (Claude Workspace Manager)](https://github.com/avarajar/cw) — manage worktree sessions, tasks, PR reviews, and Claude Code integrations from a single web UI.

[Getting Started](#-getting-started) &bull; [Screenshots](#-screenshots) &bull; [Architecture](#-architecture) &bull; [Modules](#-modules) &bull; [Roadmap](#-roadmap)

<br />

---

</div>

<br />

## What It Does

Forge is the **visual frontend for CW**. Instead of running `cw work`, `cw review`, `cw spaces` in the terminal, you get a web dashboard with:

- **Task list** with filters by account, project, and type (dev/review/loop/general)
- **Any harness** — run a task on Claude Code, Codex, Pi or OpenCode and see which one each session uses (needs CW 0.3.0)
- **Accounts** — an account × harness matrix with one-click Connect; Codex logs in with a device code, no terminal
- **Multi-tab terminal sessions** — open multiple agent sessions side by side
- **Project info** — auto-detected stack, MCPs, plugins at a glance
- **One-click actions** — start tasks, review PRs, mark done, create, register, move and delete projects
- **Skills** — browse and edit global, account and project skills, install from skills.sh, or start a session that writes one
- **Prototypes** — a sandbox with its own dev server to try an idea, share it as a PR or graduate it to a dev task
- **Keyboard shortcuts** — Cmd+1..5, Cmd+W, Cmd+L for tab navigation

It reads from `~/.cw/` (sessions, projects, accounts, skills) and from `~/.claude/` (MCPs, plugins, settings).

<br />

## Screenshots

### Task List
Filter tasks by account, project, type. Quick-launch buttons for new work.

![Task List](docs/screenshots/task-list.png)

### Task Detail
Interactive terminal with Claude Code, git stats, MCP/plugin info, and session metadata.

![Task Detail](docs/screenshots/task-detail.png)

### Project View
Filter by project to see detected stack, MCPs, and plugins. Manage or delete projects.

![Project Filter](docs/screenshots/project-filter.png)

<br />

## Getting Started

### Prerequisites

| Requirement | Version | Install |
|-------------|---------|---------|
| **Node.js** | >= 20 | [nodejs.org](https://nodejs.org) |
| **pnpm** | >= 11 | `corepack enable && corepack prepare pnpm@latest --activate` |
| **Python 3** | >= 3.9 | Required by CW for session management |
| **Git** | any recent | Worktree support required |
| **A harness** | latest | At least one of Claude Code (`npm i -g @anthropic-ai/claude-code`), Codex, Pi or OpenCode |
| **[CW](https://github.com/avarajar/cw)** | >= 0.3.0 | `git clone https://github.com/avarajar/cw.git && cd cw && ./install.sh` |

### CW Setup

CW must be initialized before Forge can read your workspace:

```bash
cw init                          # Initialize ~/.cw/
cw account add <name>            # Add an account (or use the Accounts screen in Forge)
cw open <project>                # Register a project (or cw project register)
```

Once you have at least one project registered, Forge will show it in the dashboard. You can also register an existing repo from Forge's Create Project dialog.

### Launch

Clone and run:

```bash
git clone https://github.com/avarajar/forge.git
cd forge
pnpm start
```

That's it — installs dependencies, builds, and opens the dashboard at `http://localhost:3000`. The first run takes ~1–2 minutes while it installs 249 packages and compiles the monorepo; subsequent starts are near-instant thanks to Turborepo's cache.

Other ways to launch:

```bash
cw forge                   # If you have CW installed
npx @forge-dev/platform    # No install needed
```

### Remote access

Forge listens on `127.0.0.1` and only answers requests from your own machine, because its API starts agents, logs accounts in, imports API keys and can delete project files. A page on another site can't call it, and neither can another computer on your network.

To reach it from another computer, set `FORGE_HOST` (for example `FORGE_HOST=0.0.0.0 pnpm start`). That also turns the same-machine check off and, outside team mode, there is no authentication, so only do it on a network you trust. From a remote browser, only Codex's device code can connect an account; the other harnesses' browser logins redirect to `localhost` on the machine running Forge.

### Development

To work on Forge itself:

```bash
pnpm install
pnpm dev
```

<br />

## Architecture

```
┌─────────────────────────────────────────────────────┐
│              FORGE CONSOLE (Preact + UnoCSS)         │
│         ~100KB gzipped · dark/light themes           │
└───────────────────────┬──────────────────────────────┘
                        │ HTTP + WebSocket
┌───────────────────────┼──────────────────────────────┐
│              FORGE SERVER (Hono)                       │
│                                                       │
│   Origin guard (same machine) · bearer auth (team)    │
│                                                       │
│   CW Reader    PTY Manager    Login Manager           │
│   (sessions,   (node-pty,     (device code,           │
│    projects,    xterm.js)      API key import)        │
│    MCPs)                                              │
│                                                       │
│   Skills       Sandboxes      Module Loader           │
│   (skills.sh)  (prototypes)   (forge-module.json)     │
│                                                       │
│   SQLite (local) ──── or ──── PostgreSQL (team)       │
└───────────────────────┬───────────────────────────────┘
                        │
          ┌─────────────┼─────────────┐
          │             │             │
     ~/.cw/        ~/.claude/     Harness: Claude Code,
     sessions      settings       Codex, Pi, OpenCode
     projects      plugins        (spawned via cw work,
     accounts      MCPs           review, launch)
```

### Tech Stack

| Layer | Tech |
|-------|------|
| Server | Hono (Node.js) |
| Dashboard | Preact + UnoCSS + Vite |
| Terminal | xterm.js + node-pty (WebSocket) |
| Database | better-sqlite3 (local) / PostgreSQL (team) |
| CLI | Commander.js |
| Build | Turborepo |
| Tests | Vitest (248 tests in `packages/core`) |
| Language | TypeScript (strict) |

### Monorepo Structure

```
packages/
  core/       → Hono server, CW reader, PTY manager, harness logins, skills, prototypes, DB
  console/    → Preact dashboard (app, pages, components, hooks)
  ui/         → Shared components (Terminal, StatusCard, ActionButton, Toast...)
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
```

<br />

## Console Architecture

The dashboard is a Preact SPA with this component structure:

```
App
├── useTabManager (tab state, sessionStorage, keyboard shortcuts)
├── useTaskFilters (account/project/type/harness filters, derived data)
├── useHarnesses (shared `cw doctor` store, 3 s polling)
│
├── List view
│   ├── OpenTabsBanner (shows tabs open in background)
│   ├── TaskList
│   │   ├── Filter pills (account, project, type, harness)
│   │   ├── TaskCard / DoneTaskRow (with harness badge)
│   │   └── ProjectBanner (stack, MCPs, plugins, delete)
│   ├── NewTask (harness picker) → PrototypePanel
│   ├── CreateProjectModal (directory picker)
│   ├── Accounts (account × harness matrix, device login)
│   └── Skills
│
└── Tabs view
    ├── TabBar (tab bar + add menu)
    └── TaskDetail (terminal + git stats + MCP info)
```

Shared config lives in `config/types.ts` (type colors, labels, helpers).

<br />

## Modules

> The server loads module manifests from `~/.forge/modules` (`forge module add`) and runs their actions through `/api/actions`. The dashboard does not render module panels today: they were dropped when the console became a CW task launcher.

Forge supports extensible modules via `forge-module.json` manifests. Each module declares panels, actions, and detectors:

```json
{
  "name": "@forge-dev/mod-qa",
  "displayName": "QA",
  "icon": "test-tube",
  "actions": [
    { "id": "run-tests", "label": "Run Tests", "command": "pnpm vitest", "streaming": true }
  ],
  "detectors": [
    { "tool": "vitest", "files": ["vitest.config.*"], "suggestion": "Vitest detected" }
  ]
}
```

Panels are Preact components using `definePanel()` from `@forge-dev/sdk`.

<br />

## Development

```bash
pnpm install          # Install all workspace deps
pnpm dev              # Dev mode (all packages)
pnpm build            # Build all
pnpm test             # Run all tests
```

`pnpm dev` runs the package watchers and the Vite dashboard on `http://localhost:5173`, but not the API server. Vite proxies `/api` and `/ws` to port 3000, so run `FORGE_NO_OPEN=1 node packages/platform/dist/index.js` in another terminal after `pnpm build`.

### Run specific package

```bash
cd packages/core && pnpm vitest        # Core tests (the only package with tests)
cd packages/console && pnpm vite       # Dashboard dev server
```

### Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `FORGE_PORT` | `3000` | Listen port |
| `FORGE_HOST` | `127.0.0.1` | Listen address; any other value turns off the same-machine check |
| `FORGE_DB_URL` | — | PostgreSQL URL for team mode |
| `FORGE_AUTH_TOKEN` | — | Bearer token for team mode |
| `FORGE_NO_OPEN` | — | `1` skips opening the browser |

<br />

## Roadmap

| Phase | Status | What |
|-------|--------|------|
| **0: Foundation** | Done | Core server, dashboard shell, module system, CLI, UI kit |
| **1: CW Integration** | Done | CW reader, sessions, PTY terminals, multi-tab |
| **2: Full Ecosystem** | Done | 7 module manifests, team mode (PostgreSQL + auth) |
| **3: Polish** | In progress | UX improvements, error handling, performance |
| **Harness integration** | Done | Claude Code, Codex, Pi and OpenCode sessions, Accounts screen, same-machine API |

<br />

## License

MIT &copy; [Jose Andrade](https://github.com/avarajar)
<div align="center">
<br />

---

<br />

**Built with Forge + [CW](https://github.com/avarajar/cw) + [Claude Code](https://claude.ai/code)**

<sub>Powered by [Hono](https://hono.dev), [Preact](https://preactjs.com), [xterm.js](https://xtermjs.org), and the open-source community.</sub>

</div>
