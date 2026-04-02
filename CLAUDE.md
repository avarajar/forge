# Forge — Development Platform

## What is this

Forge is an open-source, module-based development platform with a visual web dashboard. Every action (tests, deploys, scans, scaffolding) executes with one click. Built with Hono + Preact + UnoCSS.

## Stack

| Layer | Tech |
|-------|------|
| Server | Hono (Node.js) |
| Dashboard | Preact + UnoCSS + Vite |
| Database | better-sqlite3 (local) / PostgreSQL (team) |
| CLI | Commander.js |
| Build | Turborepo |
| Tests | Vitest |
| Language | TypeScript (strict) |

## Monorepo Structure

```
packages/
  core/       → @forge-dev/core      — Hono server, DB, module loader, action runner
  console/    → @forge-dev/console   — Preact dashboard
  ui/         → @forge-dev/ui        — Shared UI components (StatusCard, ActionButton, Terminal, etc.)
  sdk/        → @forge-dev/sdk       — Module SDK (defineModule, definePanel, types)
  cli/        → @forge-dev/cli       — CLI commands (forge init/console/run/etc.)
  platform/   → @forge-dev/platform  — Entry point (npx @forge-dev/platform)
modules/
  mod-dev/        — CW wrapper (worktrees, sessions)
  mod-scaffold/   — Project creation wizard
  mod-planning/   — Linear + Notion + diagrams
  mod-design/     — Figma + tokens + wireframes
  mod-qa/         — Tests, security, load, visual
  mod-release/    — Deploy, flags, rollback, changelog
  mod-monitor/    — Health, errors, uptime, costs
```

## Development

```bash
npm install           # Install all workspace deps
npx turbo dev         # Dev mode (all packages)
npx turbo build       # Build all
npx turbo test        # Run all tests
forge doctor          # Health check
```

### Run specific package

```bash
cd packages/core && npx vitest        # Core tests
cd packages/console && npx vite       # Dashboard dev server
```

### Adding a new core module

1. Create `modules/mod-<name>/` directory
2. Add `forge-module.json` manifest
3. Add `package.json` with `@forge-dev/mod-<name>` name
4. Implement server in `server/index.ts` using `defineModule()`
5. Implement panels in `panels/*.tsx` using `definePanel()`
6. Register in workspace root `package.json` workspaces array

## Architecture

- **Module manifest**: `forge-module.json` declares panels, actions, detectors, Claude skills
- **Action Runner**: Spawns child processes, streams stdout/stderr via SSE
- **Module Loader**: Scans `~/.forge/modules/` for `forge-module.json` files
- **Dashboard**: Preact + Preact Signals for state, UnoCSS for styling
- **API**: All endpoints under `/api/` — REST + SSE for streaming

## Conventions

- TypeScript strict mode, no `any` unless interfacing with external libs
- ESM only (`"type": "module"` in all packages)
- Preact (not React) — use `preact/hooks`, `@preact/signals`
- UnoCSS utility classes in TSX — no CSS modules, no styled-components
- Vitest for all tests
- TDD: write failing test first, then implement
- Each module is independent — no cross-module imports
- UI components go in `@forge-dev/ui`, not in individual modules
- Commit messages: `feat(scope):`, `fix(scope):`, `test(scope):`, `docs:`

## Key files

- `packages/core/src/server.ts` — Main Hono app with all API routes
- `packages/core/src/db.ts` — SQLite database layer
- `packages/core/src/modules.ts` — Module discovery and loading
- `packages/core/src/runner.ts` — Command execution with streaming
- `packages/console/src/shell.tsx` — Dashboard layout (sidebar + topbar)
- `packages/console/src/app.tsx` — App entry point
- `packages/sdk/src/types.ts` — Module manifest TypeScript types

## Design docs

- Full design: `docs/plans/2026-04-02-forge-platform-design.md`
- Phase 0 plan: `docs/plans/2026-04-02-forge-phase0-implementation.md`

## Do NOT

- Do not import between modules (mod-qa cannot import from mod-dev)
- Do not use React — this is Preact
- Do not add runtime CSS libraries — UnoCSS handles everything at build time
- Do not hardcode tool paths — always auto-detect or use config
- Do not skip tests — TDD is the standard
- Do not store secrets in config.json — use 1Password CLI or env vars
- Do not break the `npx @forge-dev/platform` zero-config experience
