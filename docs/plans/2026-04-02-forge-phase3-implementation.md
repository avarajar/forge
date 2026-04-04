# Forge Phase 3: Community — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete CLI stubs, add a module registry API endpoint, write module authoring documentation, create CONTRIBUTING.md, and polish the README — making Forge ready for community contributions and npm publishing.

**Architecture:** Complete the existing CLI stubs (module add/remove, project remove) by calling the core API. Add a `GET /api/registry/search` endpoint that queries npm for `@forge-dev/mod-*` packages. Write docs as markdown files. Update README with correct status and repo URL.

**Tech Stack:** TypeScript, Commander.js, npm registry API, Hono

---

## File Structure

**CLI completions:**
- Modify: `packages/cli/src/commands/module.ts` — implement add/remove via npm + API
- Modify: `packages/cli/src/commands/project.ts` — implement remove via API

**Registry API:**
- Modify: `packages/core/src/server.ts` — add `/api/registry/search` endpoint
- Modify: `packages/core/src/server.test.ts` — test registry endpoint

**Documentation:**
- Create: `docs/module-authoring.md` — how to create a Forge module
- Create: `CONTRIBUTING.md` — development setup and contribution guide
- Modify: `README.md` — update roadmap status, fix repo URL

**Tests:**
- Modify: `packages/core/src/server.test.ts` — registry endpoint test

---

## Task 1: Complete CLI stubs — module add/remove, project remove

**Files:**
- Modify: `packages/cli/src/commands/module.ts`
- Modify: `packages/cli/src/commands/project.ts`

- [ ] **Step 1: Implement module add/remove**

Replace `packages/cli/src/commands/module.ts`:

```typescript
import { Command } from 'commander'
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export function moduleCommand() {
  const cmd = new Command('module').description('Manage Forge modules')

  cmd
    .command('list')
    .description('List installed modules')
    .action(async () => {
      const res = await fetch('http://localhost:3000/api/modules')
      const modules = await res.json() as { enabled: boolean; name: string; version: string }[]
      if (modules.length === 0) {
        console.log('No modules installed. Run `forge module add <name>` to install one.')
        return
      }
      for (const m of modules) {
        console.log(`  ${m.enabled ? 'Y' : 'N'} ${m.name} (${m.version})`)
      }
    })

  cmd
    .command('add <name>')
    .description('Install a module (e.g. @forge-dev/mod-qa)')
    .action(async (name: string) => {
      const modulesDir = join(homedir(), '.forge', 'modules')
      const shortName = name.replace('@forge-dev/', '')

      console.log(`Installing ${name}...`)

      try {
        // Install via npm to the forge modules directory
        execSync(`npm install ${name} --prefix ${modulesDir}`, { stdio: 'pipe' })
      } catch {
        // If npm fails, check if it's a local workspace module
        const localPath = join(process.cwd(), 'modules', shortName)
        if (!existsSync(localPath)) {
          console.log(`Failed to install ${name}. Is it published to npm?`)
          return
        }
        console.log(`Found local module at ${localPath}`)
      }

      // Register in the database via API
      try {
        await fetch('http://localhost:3000/api/modules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, version: '0.1.0' })
        })
      } catch {
        // Server might not be running, that's ok
      }

      console.log(`Module ${name} installed`)
    })

  cmd
    .command('remove <name>')
    .description('Remove a module')
    .action(async (name: string) => {
      console.log(`Removing ${name}...`)

      // Unregister from database via API
      try {
        await fetch(`http://localhost:3000/api/modules/${encodeURIComponent(name)}`, {
          method: 'DELETE'
        })
      } catch {
        // Server might not be running
      }

      // Remove from npm modules dir
      const modulesDir = join(homedir(), '.forge', 'modules')
      try {
        execSync(`npm uninstall ${name} --prefix ${modulesDir}`, { stdio: 'pipe' })
      } catch {
        // May not have been npm-installed
      }

      console.log(`Module ${name} removed`)
    })

  return cmd
}
```

- [ ] **Step 2: Implement project remove**

Replace `packages/cli/src/commands/project.ts`:

```typescript
import { Command } from 'commander'

export function projectCommand() {
  const cmd = new Command('project').description('Manage projects')

  cmd
    .command('list')
    .description('List registered projects')
    .action(async () => {
      const res = await fetch('http://localhost:3000/api/projects')
      const projects = await res.json() as { name: string; path: string }[]
      if (projects.length === 0) {
        console.log('No projects registered. Run `forge project add <path>` to add one.')
        return
      }
      for (const p of projects) {
        console.log(`  ${p.name} -> ${p.path}`)
      }
    })

  cmd
    .command('add <path>')
    .description('Register a project')
    .option('-n, --name <name>', 'Project name')
    .action(async (path: string, opts: { name?: string }) => {
      const { basename, resolve } = await import('node:path')
      const fullPath = resolve(path)
      const name = opts.name ?? basename(fullPath)
      const res = await fetch('http://localhost:3000/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, path: fullPath })
      })
      const project = await res.json() as { name: string }
      console.log(`Project "${project.name}" registered`)
    })

  cmd
    .command('remove <name>')
    .description('Unregister a project')
    .action(async (name: string) => {
      // First find the project by name
      const listRes = await fetch('http://localhost:3000/api/projects')
      const projects = await listRes.json() as { id: string; name: string }[]
      const project = projects.find(p => p.name === name)

      if (!project) {
        console.log(`Project "${name}" not found`)
        return
      }

      await fetch(`http://localhost:3000/api/projects/${project.id}`, {
        method: 'DELETE'
      })
      console.log(`Project "${name}" removed`)
    })

  return cmd
}
```

- [ ] **Step 3: Build**

Run: `npx turbo build --filter=@forge-dev/cli`

- [ ] **Step 4: Commit**

```bash
git add packages/cli/
git commit -m "feat(cli): complete module add/remove and project remove commands"
```

---

## Task 2: Registry search API endpoint

**Files:**
- Modify: `packages/core/src/server.ts`
- Modify: `packages/core/src/server.test.ts`

- [ ] **Step 1: Write failing test**

Add to the end of the first `describe('Forge Server', ...)` block in `packages/core/src/server.test.ts`:

```typescript
  it('GET /api/registry/search returns results', async () => {
    const res = await server.fetch('/api/registry/search?q=forge')
    expect(res.status).toBe(200)
    const body = await res.json() as { results: unknown[] }
    expect(Array.isArray(body.results)).toBe(true)
  })
```

- [ ] **Step 2: Add endpoint to server.ts**

Add this route in `packages/core/src/server.ts` before the `const fetch = ...` line:

```typescript
  app.get('/api/registry/search', async (c) => {
    const q = c.req.query('q') ?? 'forge-dev'
    try {
      const npmRes = await globalThis.fetch(
        `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(q)}+keywords:forge-module&size=20`
      )
      const data = await npmRes.json() as { objects?: { package: { name: string; version: string; description: string } }[] }
      const results = (data.objects ?? []).map(o => ({
        name: o.package.name,
        version: o.package.version,
        description: o.package.description
      }))
      return c.json({ results })
    } catch {
      return c.json({ results: [] })
    }
  })
```

- [ ] **Step 3: Run tests**

Run: `cd packages/core && npx vitest run`
Expected: All pass (37 existing + 1 new = 38).

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/server.ts packages/core/src/server.test.ts
git commit -m "feat(core): add /api/registry/search endpoint — queries npm for forge modules"
```

---

## Task 3: Module authoring guide

**Files:**
- Create: `docs/module-authoring.md`

- [ ] **Step 1: Write the guide**

`docs/module-authoring.md`:

```markdown
# Creating a Forge Module

This guide walks you through creating a custom Forge module from scratch.

## Prerequisites

- Node.js >= 20
- Forge installed (`npx @forge-dev/platform`)
- Basic TypeScript + Preact knowledge

## Module Structure

```
modules/mod-yourname/
  package.json           # npm package metadata
  tsconfig.json          # TypeScript config
  forge-module.json      # Module manifest (required)
  panels/
    index.ts             # Barrel export for all panels
    Overview.tsx          # Default panel component
```

## Step 1: Create the Package

```bash
mkdir -p modules/mod-yourname/panels
```

`modules/mod-yourname/package.json`:

```json
{
  "name": "@yourorg/mod-yourname",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "exports": { "./panels": "./panels/index.ts" },
  "peerDependencies": {
    "preact": "^10.0.0",
    "@forge-dev/sdk": "*",
    "@forge-dev/ui": "*"
  },
  "devDependencies": {
    "preact": "^10.0.0",
    "@forge-dev/sdk": "*",
    "@forge-dev/ui": "*",
    "typescript": "^5.8.0"
  }
}
```

`modules/mod-yourname/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": ".",
    "jsx": "react-jsx",
    "jsxImportSource": "preact",
    "lib": ["ES2022", "DOM"]
  },
  "include": ["panels"]
}
```

## Step 2: Create the Manifest

`modules/mod-yourname/forge-module.json`:

```json
{
  "name": "@yourorg/mod-yourname",
  "version": "0.1.0",
  "displayName": "Your Module",
  "description": "What your module does",
  "icon": "box",
  "color": "#6366f1",
  "panels": [
    {
      "id": "overview",
      "title": "Overview",
      "component": "./panels/Overview",
      "default": true
    }
  ],
  "actions": [
    {
      "id": "hello",
      "label": "Say Hello",
      "icon": "hand-wave",
      "command": "echo 'Hello from my module!'",
      "streaming": false
    }
  ],
  "detectors": [
    {
      "tool": "your-tool",
      "files": ["your-config.json"],
      "suggestion": "Your tool detected. Enable this module?"
    }
  ]
}
```

### Manifest Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Scoped npm package name |
| `displayName` | Yes | Human-readable name for sidebar |
| `description` | Yes | One-line description |
| `icon` | Yes | Lucide icon name |
| `color` | Yes | Hex color for UI accents |
| `panels[]` | Yes | At least one panel |
| `actions[]` | Yes | At least one action |
| `detectors[]` | No | Auto-detection rules |
| `settings.schema` | No | Configurable settings |

### Action Fields

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique identifier |
| `label` | Yes | Button text |
| `icon` | Yes | Lucide icon name |
| `command` | Yes | Shell command to execute |
| `streaming` | No | Stream output to terminal (default: false) |
| `hidden` | No | Data-fetching action, not shown in UI |
| `tags` | No | Categorization tags |

## Step 3: Create a Panel

`modules/mod-yourname/panels/Overview.tsx`:

```typescript
import { type FunctionComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { StatusCard, ActionButton, EmptyState } from '@forge-dev/ui'

function OverviewPanel({ moduleId, projectId }: PanelProps) {
  const [data, setData] = useState<string | null>(null)

  const fetchData = async () => {
    const res = await fetch(`/api/actions/${moduleId}/hello`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId })
    })
    const result = await res.json() as { output: string }
    setData(result.output)
  }

  return (
    <div>
      <StatusCard icon="box" label="Status" value="Ready" status="good" />
      <div class="mt-4">
        <ActionButton label="Run Hello" variant="primary" onClick={fetchData} />
      </div>
      {data && (
        <pre class="mt-4 p-4 rounded-lg bg-forge-surface border border-forge-border text-sm">
          {data}
        </pre>
      )}
    </div>
  )
}

export default definePanel({
  id: 'overview',
  title: 'Overview',
  component: OverviewPanel
})
```

`modules/mod-yourname/panels/index.ts`:

```typescript
export { default as overview } from './Overview.js'
```

### Panel Props

Every panel component receives:

```typescript
interface PanelProps {
  moduleId: string       // e.g. "mod-yourname"
  projectId: string | null  // currently selected project
}
```

### Available UI Components

Import from `@forge-dev/ui`:

| Component | Purpose |
|-----------|---------|
| `StatusCard` | Metric card with status indicator |
| `ActionButton` | Button with loading state |
| `DataList` | List of items with badges |
| `EmptyState` | Placeholder for unconfigured features |
| `Tabs` | Tab navigation |
| `Badge` | Label badge |
| `Modal` | Dialog overlay |
| `ForgeTerminal` | xterm.js terminal output |
| `ToggleSwitch` | On/off toggle |
| `Toast` / `showToast` | Notification alerts |

## Step 4: Register in Console

Add your module to `packages/console/package.json` dependencies:

```json
"@yourorg/mod-yourname": "*"
```

Add to `packages/console/src/panels/registry.ts`:

```typescript
import { overview } from '@yourorg/mod-yourname/panels'
registerPanels('mod-yourname', [overview])
```

## Step 5: Install and Test

```bash
npm install                                    # Link workspace
cp -r modules/mod-yourname ~/.forge/modules/   # Make discoverable
npx turbo build --filter=@forge-dev/console    # Rebuild dashboard
npx @forge-dev/platform                        # Start and verify
```

## Publishing to npm

```bash
cd modules/mod-yourname
npm publish --access public
```

Users install with:

```bash
forge module add @yourorg/mod-yourname
```
```

- [ ] **Step 2: Commit**

```bash
git add docs/module-authoring.md
git commit -m "docs: add module authoring guide"
```

---

## Task 4: CONTRIBUTING.md

**Files:**
- Create: `CONTRIBUTING.md`

- [ ] **Step 1: Write CONTRIBUTING.md**

`CONTRIBUTING.md`:

```markdown
# Contributing to Forge

Thanks for your interest in Forge! This guide covers setup and conventions.

## Development Setup

```bash
git clone https://github.com/avarajar/forge.git
cd forge
npm install
npx turbo dev     # Dev mode (all packages)
```

### Run Tests

```bash
npx turbo test                    # Core unit tests (30+)
npx vitest run tests/integration/ # Integration tests (40+)
npx turbo build                   # Verify all packages build
```

### Project Structure

```
packages/
  core/       → Hono server, DB, module loader, action runner
  console/    → Preact dashboard (Vite + UnoCSS)
  ui/         → Shared UI components
  sdk/        → Module SDK (types + definePanel)
  cli/        → CLI commands (Commander.js)
  platform/   → Entry point (npx @forge-dev/platform)
modules/
  mod-dev/        → Worktrees, sessions, context
  mod-scaffold/   → Project creation wizard
  mod-planning/   → Linear, Notion, diagrams, ADRs
  mod-design/     → Figma, tokens, wireframes
  mod-qa/         → Tests, security, load, visual
  mod-release/    → Deploy, flags, rollback, changelog
  mod-monitor/    → Health, errors, uptime, costs
```

## Conventions

- **TypeScript strict** — no `any` unless interfacing with external libs
- **ESM only** — `"type": "module"` in all packages
- **Preact** (not React) — use `preact/hooks`, `@preact/signals`
- **UnoCSS** utility classes — no CSS modules, no styled-components
- **Vitest** for all tests
- **TDD** — write failing test first, then implement
- **Each module is independent** — no cross-module imports
- **UI components** go in `@forge-dev/ui`, not in individual modules

## Commit Messages

Follow conventional commits:

```
feat(scope): add new feature
fix(scope): fix a bug
test(scope): add tests
docs: update documentation
refactor(scope): restructure code
chore: build, deps, config changes
```

## Adding a Module

See [Module Authoring Guide](docs/module-authoring.md) for a complete walkthrough.

## Pull Requests

1. Fork and create a branch from `main`
2. Follow conventions above
3. Ensure all tests pass: `npx turbo test && npx vitest run tests/integration/`
4. Ensure it builds: `npx turbo build`
5. Open a PR with a clear description

## Architecture

| Layer | Tech | Notes |
|-------|------|-------|
| Server | Hono | REST + SSE streaming |
| Dashboard | Preact + UnoCSS + Vite | ~80KB gzipped |
| Database | SQLite (local) / PostgreSQL (team) | Abstracted via IForgeDB |
| CLI | Commander.js | Thin wrapper over API |
| Build | Turborepo | Parallel builds + caching |
| Tests | Vitest | Unit + integration |

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
```

- [ ] **Step 2: Commit**

```bash
git add CONTRIBUTING.md
git commit -m "docs: add CONTRIBUTING.md — setup, conventions, architecture"
```

---

## Task 5: Polish README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update roadmap status and repo URL**

In `README.md`, update the roadmap table:

Replace:
```markdown
| **0: Foundation** | 🔄 In Progress | Core server, dashboard shell, module system, CLI, UI kit |
| **1: Core Modules** | ⏳ Planned | mod-dev (CW), mod-scaffold, mod-planning, mod-monitor |
| **2: Full Ecosystem** | ⏳ Planned | mod-qa, mod-design, mod-release, team mode |
| **3: Community** | ⏳ Planned | Module SDK docs, registry, template gallery |
```

With:
```markdown
| **0: Foundation** | ✅ Complete | Core server, dashboard shell, module system, CLI, UI kit |
| **1: Core Modules** | ✅ Complete | mod-dev, mod-scaffold, mod-planning, mod-monitor |
| **2: Full Ecosystem** | ✅ Complete | mod-qa, mod-design, mod-release, team mode (PostgreSQL + auth) |
| **3: Community** | ✅ Complete | Module SDK docs, CONTRIBUTING.md, registry API |
```

Update the "See ... Plan" line:

Replace:
```markdown
See [Phase 0 Implementation Plan](docs/plans/2026-04-02-forge-phase0-implementation.md) for detailed tasks.
```

With:
```markdown
See [implementation plans](docs/plans/) for detailed tasks per phase.
```

Update the git clone URL:

Replace:
```markdown
git clone https://github.com/forge-dev/forge.git
```

With:
```markdown
git clone https://github.com/avarajar/forge.git
```

Update the "Create a Module" section server-side example to match actual SDK:

Replace:
```typescript
import { defineModule } from '@forge-dev/sdk'

export default defineModule({
  actions: {
    'sync': async (ctx) => ctx.exec('npx mixpanel-cli pull', { stream: true }),
    'report': async (ctx) => ctx.claude('Analyze this data', { skill: 'data-analyst' })
  }
})
```

With:
```typescript
// Server-side actions are defined in forge-module.json as shell commands.
// See docs/module-authoring.md for the full guide.
```

Update the UI-side example:

Replace:
```tsx
import { definePanel } from '@forge-dev/sdk/ui'
import { StatusCard, ActionButton } from '@forge-dev/ui'

export default definePanel({
  render({ project, actions }) {
    return (
      <div>
        <StatusCard icon="📊" label="DAU" value="1,234" status="good" />
        <ActionButton action={actions['sync']} />
      </div>
    )
  }
})
```

With:
```tsx
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { StatusCard, ActionButton } from '@forge-dev/ui'

function AnalyticsPanel({ moduleId, projectId }: PanelProps) {
  return (
    <div>
      <StatusCard icon="bar-chart" label="DAU" value="1,234" status="good" />
      <ActionButton label="Sync Data" variant="primary" onClick={() => {
        fetch(`/api/actions/${moduleId}/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId })
        })
      }} />
    </div>
  )
}

export default definePanel({ id: 'overview', title: 'Overview', component: AnalyticsPanel })
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: update README — roadmap status, correct repo URL, fix code examples"
```

---

## Summary

| # | Task | Files | Tests |
|---|------|-------|-------|
| 1 | CLI: module add/remove, project remove | 2 | Build |
| 2 | Registry search API | 2 | 1 unit |
| 3 | Module authoring guide | 1 | — |
| 4 | CONTRIBUTING.md | 1 | — |
| 5 | README polish | 1 | — |

**Totals: 5 tasks, 7 files, 1 new test**

After Phase 3: CLI commands fully functional, npm registry search available, module authoring documented, contribution guide written, README accurate. Forge is ready for community use and npm publishing.
