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
- npm >= 10
- Git

### Clone and install

```bash
git clone https://github.com/avarajar/forge.git
cd forge
npm install
```

`npm install` sets up all workspace packages at once via npm workspaces.

### Start the dev server

```bash
npx turbo dev
```

This starts all packages in parallel with hot-reload:

- `packages/core` — Hono API server on `http://localhost:3000`
- `packages/console` — Vite dashboard on `http://localhost:5173`

Open `http://localhost:5173` in your browser to see the dashboard.

### Run a single package

```bash
# Dashboard only
cd packages/console && npx vite

# Core server only
cd packages/core && npx tsx src/server.ts

# CLI from source
cd packages/cli && npx tsx src/index.ts
```

---

## 2. Running Tests

### All tests

```bash
npx turbo test
```

Turborepo runs tests across every package in parallel, respecting the dependency graph.

### Single package

```bash
# Core tests
cd packages/core && npx vitest

# SDK tests
cd packages/sdk && npx vitest

# A specific module
cd modules/mod-qa && npx vitest
```

### Watch mode

```bash
npx vitest --watch
```

### Vitest integration

Every package uses Vitest. There is no Jest. Test files follow the convention `*.test.ts` or `*.test.tsx` and sit next to the source files or in a `tests/` subdirectory.

All tests must pass before a PR can be merged. If you add a feature, add tests first (see [TDD convention](#test-driven-development-tdd) below).

---

## 3. Project Structure

```
forge/
  packages/
    core/       → @forge-dev/core      — Hono server, SQLite/PostgreSQL, module loader, action runner
    console/    → @forge-dev/console   — Preact dashboard (Vite)
    ui/         → @forge-dev/ui        — Shared UI components
    sdk/        → @forge-dev/sdk       — Module SDK (definePanel, types)
    cli/        → @forge-dev/cli       — CLI commands (forge init/console/run/etc.)
    platform/   → @forge-dev/platform  — Entry point (npx @forge-dev/platform)
  modules/
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
| `packages/core/src/server.ts` | Main Hono app — all API routes |
| `packages/core/src/db.ts` | SQLite/PostgreSQL database layer |
| `packages/core/src/modules.ts` | Module discovery and manifest loading |
| `packages/core/src/runner.ts` | Command execution with SSE streaming |
| `packages/console/src/app.tsx` | Dashboard entry point |
| `packages/console/src/shell.tsx` | Dashboard layout (sidebar, topbar) |
| `packages/console/src/panels/registry.ts` | Maps module IDs to panel components |
| `packages/sdk/src/types.ts` | Shared TypeScript types (PanelProps, ModuleManifest, etc.) |
| `packages/sdk/src/define.ts` | definePanel helper |

---

## 4. Architecture

| Layer | Technology | Notes |
|-------|-----------|-------|
| Server | Hono (Node.js) | ~14KB, runs all API endpoints under `/api/` |
| Dashboard | Preact + UnoCSS + Vite | ~80KB gzipped, dark/light themes |
| Database | better-sqlite3 / PostgreSQL | SQLite locally, PostgreSQL in team mode (`--team`) |
| CLI | Commander.js | `forge init`, `forge console`, `forge run`, etc. |
| Build | Turborepo | Parallel builds and tests across all packages |
| Tests | Vitest | Used in all packages — no Jest |

### How it fits together

```
FORGE CONSOLE (Preact + UnoCSS)
        │ HTTP + SSE
FORGE SERVER (Hono)
  ├── Module Registry   — reads forge-module.json files
  ├── Action Runner     — spawns child processes, streams via SSE
  └── DB layer          — SQLite (local) or PostgreSQL (team)
        │
  External CLIs, Claude Code, CW
```

Modules communicate with the server only through the REST API (`/api/actions/{moduleId}/{actionId}`). Panels make `fetch()` calls from the browser; the server executes the shell commands defined in `forge-module.json` and returns the output.

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
3. Register the panels in `packages/console/src/panels/registry.ts`.
4. Add tests and make sure `npx turbo test` passes.
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
   npx turbo test
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
