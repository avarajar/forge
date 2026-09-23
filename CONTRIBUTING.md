# Contributing to Forge

Thank you for your interest in contributing to Forge. This document covers everything you need to get started — development setup, project conventions, testing practices, and the PR process.

---

## Table of Contents

1. [Development Setup](#1-development-setup)
2. [Running Tests](#2-running-tests)
3. [Project Structure](#3-project-structure)
4. [Architecture](#4-architecture)
5. [Conventions](#5-conventions)
6. [Commit Message Format](#6-commit-message-format)
7. [Adding a Module](#7-adding-a-module)
8. [Pull Request Process](#8-pull-request-process)

---

## 1. Development Setup

### Requirements

- Node.js >= 20
- pnpm >= 11 (install via `corepack enable && corepack prepare pnpm@latest --activate`)
- Git

### Clone and install

```bash
git clone https://github.com/avarajar/forge.git
cd forge
pnpm install
```

`pnpm install` sets up all workspace packages at once via pnpm workspaces.

### Start the dev server

```bash
pnpm dev
```

This runs every package's watcher: `tsc --watch` for `core`, `ui`, `sdk`, `cli` and `platform`, and the Vite dashboard for `console` on `http://localhost:5173`. It does not start the API server. Vite proxies `/api` and `/ws` to `http://localhost:3000`, so build once and run the server in a second terminal:

```bash
pnpm build
FORGE_NO_OPEN=1 node packages/platform/dist/index.js
```

Restart the server after a change under `packages/core` so it loads the rebuilt `dist/`. Then open `http://localhost:5173`.

`pnpm start` is the quickest check of a full build: it installs, builds and serves the built dashboard on `http://localhost:3000`.

The server only answers requests from the same machine (`packages/core/src/origin-guard.ts`). Set `FORGE_HOST` to reach it from another computer.

### Run a single package

```bash
# Dashboard only (needs the server on :3000)
cd packages/console && pnpm vite

# CLI (after pnpm build)
node packages/cli/dist/index.js --help
```

---

## 2. Running Tests

### All tests

```bash
pnpm test
```

Turborepo builds first, then runs `test` in every package that has one. Today only `packages/core` does (248 tests).

### Single package

```bash
cd packages/core && pnpm vitest run
```

### Watch mode

```bash
cd packages/core && pnpm vitest
```

### Vitest integration

Every package uses Vitest. There is no Jest. Test files follow the convention `*.test.ts` or `*.test.tsx` and sit next to the source files.

`tests/integration/` holds older cross-package tests. No script runs them, and running them directly fails with `Cannot find package 'hono'` because the workspace root does not depend on it.

All tests must pass before a PR can be merged. If you add a feature, add tests first (see [TDD convention](#test-driven-development-tdd) below).

---

## 3. Project Structure

```
forge/
  packages/
    core/       → @forge-dev/core      — Hono server, CW reader, PTY terminals, harness logins, skills, Liveframe, DB, module loader, action runner
    console/    → @forge-dev/console   — Preact dashboard (Vite)
    ui/         → @forge-dev/ui        — Shared UI components
    sdk/        → @forge-dev/sdk       — Module SDK (definePanel, types)
    cli/        → @forge-dev/cli       — CLI commands (forge init/console/doctor/module/project/run)
    platform/   → forge-cw  — Entry point, published on npm with CW bundled (npx forge-cw)
  modules/
    mod-hello/      — Minimal example manifest
    mod-dev/        — Git worktrees and Claude Code sessions
    mod-scaffold/   — Project creation wizard
    mod-planning/   — Linear, Notion, diagrams
    mod-design/     — Figma, tokens, wireframes
    mod-qa/         — Tests, security, load, visual
    mod-release/    — Deploy, feature flags, rollback, changelog
    mod-monitor/    — Health, errors, uptime, costs
  docs/
    plans/      — Phase implementation plans
    module-authoring.md  — Guide for creating custom modules
  tests/        — Integration tests that span multiple packages
```

### Key files

| File | Purpose |
|------|---------|
| `packages/core/src/server.ts` | Main Hono app — mounts every route group and the guard/auth middleware |
| `packages/core/src/cw-reader.ts` | Reads `~/.cw/` and `~/.claude/` (sessions, projects, accounts, skills, MCPs) |
| `packages/core/src/cw-routes.ts` | CW API (`/api/cw`): start, done, accounts, logins, projects, git |
| `packages/core/src/pty-manager.ts` / `pty-routes.ts` | node-pty sessions and the terminal WebSocket |
| `packages/core/src/origin-guard.ts` | Same-machine check and `FORGE_HOST` bind address |
| `packages/core/src/db.ts` | SQLite database layer (`db-postgres.ts` for team mode) |
| `packages/core/src/modules.ts` | Module discovery from `~/.forge/modules` |
| `packages/core/src/runner.ts` | Command execution with SSE streaming |
| `packages/console/src/app.tsx` | Dashboard root: list view, tabs view, sub-views |
| `packages/console/src/shell.tsx` | Dashboard layout |
| `packages/console/src/config/types.ts` | Shared task type styles and helpers |
| `packages/sdk/src/types.ts` | Shared TypeScript types (PanelProps, ModuleManifest, etc.) |
| `packages/sdk/src/define.ts` | definePanel helper |

`CLAUDE.md` has the full list of key files and API endpoints.

---

## 4. Architecture

| Layer | Technology | Notes |
|-------|-----------|-------|
| Server | Hono (Node.js) | ~14KB, runs all API endpoints under `/api/` |
| Dashboard | Preact + UnoCSS + Vite | ~80KB gzipped, dark/light themes |
| Database | better-sqlite3 / PostgreSQL | SQLite locally, PostgreSQL in team mode (`--team`) |
| CLI | Commander.js | `forge init`, `forge console`, `forge doctor`, `forge module`, `forge project`, `forge run` |
| Build | Turborepo | Parallel builds and tests across all packages |
| Tests | Vitest | No Jest; only `packages/core` has tests today |

### How it fits together

```
FORGE CONSOLE (Preact + UnoCSS)
        │ HTTP + SSE, WebSocket for terminals
FORGE SERVER (Hono)
  ├── Origin guard      — same-machine check in local mode, bearer token in team mode
  ├── CW routes         — spawn cw work/review/launch, accounts, harness logins, git
  ├── PTY manager       — node-pty sessions streamed to xterm.js
  ├── Skills, Liveframe — skill files, Liveframe frames through the lf CLI
  ├── Module Registry   — reads forge-module.json files from ~/.forge/modules
  ├── Action Runner     — spawns child processes, streams via SSE
  └── DB layer          — SQLite (local) or PostgreSQL (team)
        │
  CW → harness (Claude Code, Codex, Pi, OpenCode)
```

Modules communicate with the server only through the REST API (`/api/actions/{moduleId}/{actionId}`). The server executes the shell commands defined in `forge-module.json` and returns the output. The console does not render module panels today (see the note in the [Module Authoring Guide](docs/module-authoring.md#8-registering-in-the-console)).

---

## 5. Conventions

### TypeScript strict mode

All packages are compiled with `"strict": true`. Avoid `any` unless interfacing with external libraries that do not provide types. When `any` is unavoidable, add a comment explaining why.

### ESM only

All packages use `"type": "module"` in `package.json`. Do not use `require()`, `module.exports`, or CommonJS patterns.

### Preact, not React

The dashboard uses Preact. Do not import from `react` or `react-dom`. Use:

- `import { type FunctionComponent } from 'preact'`
- `import { useState, useEffect } from 'preact/hooks'`
- `import { signal, computed } from '@preact/signals'`

The JSX transform is configured via `"jsxImportSource": "preact"` in tsconfig — no explicit imports needed for JSX.

### UnoCSS utility classes

The dashboard uses UnoCSS for styling. Use utility classes in TSX. Do not use CSS modules, styled-components, or inline `<style>` blocks. Do not add runtime CSS libraries.

```tsx
// Good
<div class="flex items-center gap-2 p-4 rounded-lg bg-forge-surface">

// Bad
<div style={{ display: 'flex', alignItems: 'center' }}>
```

Custom design tokens are defined in `packages/console/src/styles/theme.css` and are available as `var(--forge-*)` CSS variables and `bg-forge-*` / `text-forge-*` UnoCSS utilities.

### Vitest for all tests

Use Vitest everywhere. Do not use Jest. Test files go next to source or in a `tests/` subdirectory and follow the `*.test.ts` / `*.test.tsx` naming convention.

### Test-driven development (TDD)

Write a failing test before implementing. The workflow is:

1. Write the test (it should fail).
2. Implement the feature until the test passes.
3. Refactor as needed.

### No cross-module imports

Modules under `modules/` must not import from each other. `mod-qa` cannot import from `mod-dev`. Shared logic belongs in `packages/sdk` or `packages/ui`.

### No hardcoded tool paths

Never hardcode binary paths like `/usr/local/bin/node`. Use auto-detection or configuration. Commands in `forge-module.json` should use `npx` or rely on `$PATH`.

### No secrets in config

Do not store API keys, tokens, or passwords in `config.json` or committed files. Use environment variables or the 1Password CLI integration.

---

## 6. Commit Message Format

Forge uses [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short summary>
```

### Types

| Type | When to use |
|------|------------|
| `feat` | A new feature |
| `fix` | A bug fix |
| `test` | Adding or updating tests |
| `docs` | Documentation only changes |
| `refactor` | Code change that is neither a fix nor a feature |
| `chore` | Build process, dependency updates, tooling |
| `perf` | Performance improvement |

### Scope

Use the package or module name as the scope:

- `feat(core):` — server / API changes
- `feat(console):` — dashboard changes
- `feat(sdk):` — SDK types or helpers
- `feat(ui):` — UI component changes
- `feat(cli):` — CLI command changes
- `feat(mod-qa):` — changes to the QA module
- `docs:` — documentation (no scope needed)

### Examples

```
feat(core): add SSE streaming for action runner
fix(console): correct panel tab key on re-render
test(sdk): add definePanel return type test
docs: add module authoring guide
chore: bump turbo to 2.9.3
```

---

## 7. Adding a Module

See the full [Module Authoring Guide](docs/module-authoring.md) for step-by-step instructions including:

- Module directory structure
- `forge-module.json` manifest reference (all fields)
- Creating panels with `definePanel` and `PanelProps`
- All available `@forge-dev/ui` components
- Registering panels in the console
- Writing tests
- Publishing to npm

The short version:

1. Create `modules/mod-<name>/` with a `forge-module.json` and `package.json`.
2. Add panels under `panels/` using `definePanel` from `@forge-dev/sdk`.
3. Install it into `~/.forge/modules` with `forge module add` so the server loads its actions. The console does not render module panels today (there is no panel registry), see the guide's note.
4. Add tests and make sure `pnpm test` passes.
5. Open a PR.

---

## 8. Pull Request Process

1. **Fork** the repository and create a feature branch:

   ```bash
   git checkout -b feat/my-feature
   ```

2. **Write tests first** — follow the TDD convention described above.

3. **Make your changes** — keep commits focused and use the conventional commit format.

4. **Run the full test suite locally** before opening a PR:

   ```bash
   pnpm test
   ```

5. **Open a PR** against the `main` branch. Include:
   - A clear title following the commit format.
   - A description of what changed and why.
   - Screenshots or terminal output if the change is visual or behavioral.

6. **CI checks** — the PR must pass all automated checks before review.

7. **Code review** — at least one maintainer approval is required before merging.

8. **Squash and merge** — maintainers will squash commits on merge to keep the history clean.

### What makes a good PR

- Focused: one logical change per PR. If you are fixing a bug and adding a feature, open two PRs.
- Tested: every new code path has a corresponding test.
- Documented: if you add a public API or change behavior, update the relevant docs.
- Clean: no debug logs, no commented-out code, no `TODO` comments without an issue reference.

### Reporting bugs

Open a GitHub issue with:

- Forge version (`forge --version`)
- Node.js version (`node --version`)
- Steps to reproduce
- Expected behavior
- Actual behavior

---

## Questions

Open a [GitHub Discussion](https://github.com/avarajar/forge/discussions) for questions, ideas, or general conversation. Use issues only for confirmed bugs and feature requests with clear requirements.
