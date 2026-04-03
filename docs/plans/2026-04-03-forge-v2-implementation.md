# Forge v2: CW Visual Interface — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite Forge's frontend from a module-based dashboard to a CW-powered task launcher — where users see their active tasks, create new ones by type (Dev/Design/Review/Plan/Create), and view task details with tabs for status, diff, tests, screenshots, and notes.

**Architecture:** The Hono server gets new `/api/cw/*` endpoints that read CW's filesystem directly (`~/.cw/projects.json`, `~/.cw/sessions/`, `~/.cw/config.yaml`). The Preact frontend is rewritten: Shell gets a simpler layout without module sidebar, App renders the task list as home view, and new pages handle task creation and detail. Existing UI components (StatusCard, ActionButton, DataList, Tabs, Badge, Modal, EmptyState, Toast) are reused. Module system is removed.

**Tech Stack:** TypeScript, Hono 4.x, Preact 10.x, UnoCSS 66.x, Vite 6.x

---

## File Structure

**Core — CW data reader (new):**
- Create: `packages/core/src/cw-reader.ts` — reads CW filesystem data (projects, sessions, config)
- Create: `packages/core/src/cw-reader.test.ts` — tests for CW reader

**Core — New server routes:**
- Create: `packages/core/src/cw-routes.ts` — all `/api/cw/*` Hono routes
- Create: `packages/core/src/cw-routes.test.ts` — tests for CW routes
- Modify: `packages/core/src/server.ts` — mount CW routes, remove module routes
- Modify: `packages/core/src/index.ts` — export new modules

**Console — Rewritten frontend:**
- Rewrite: `packages/console/src/shell.tsx` — simpler layout, no module sidebar
- Rewrite: `packages/console/src/app.tsx` — task list as home, CW-driven state
- Create: `packages/console/src/pages/TaskList.tsx` — main view with active tasks + quick launch
- Create: `packages/console/src/pages/TaskDetail.tsx` — tabbed detail (Status, Diff, Tests, Screenshots, Notes)
- Create: `packages/console/src/pages/NewTask.tsx` — smart single screen modal
- Create: `packages/console/src/pages/Onboarding.tsx` — shown when no projects in CW
- Delete: `packages/console/src/pages/Home.tsx`
- Delete: `packages/console/src/pages/ModuleShell.tsx`
- Delete: `packages/console/src/pages/ModulePage.tsx`
- Delete: `packages/console/src/panels/registry.ts`
- Modify: `packages/console/package.json` — remove module deps

**Types:**
- Create: `packages/core/src/cw-types.ts` — CW data types (CWProject, CWSession, CWConfig)

**Integration test:**
- Create: `tests/integration/cw-api.test.ts`

---

## Task 1: CW types + data reader

**Files:**
- Create: `packages/core/src/cw-types.ts`
- Create: `packages/core/src/cw-reader.ts`
- Create: `packages/core/src/cw-reader.test.ts`

- [ ] **Step 1: Write failing tests**

`packages/core/src/cw-reader.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { CWReader } from './cw-reader.js'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const TEST_CW = join(import.meta.dirname, '../.test-cw')

describe('CWReader', () => {
  let reader: CWReader

  beforeEach(() => {
    mkdirSync(join(TEST_CW, 'sessions/myapp/task-fix-bug'), { recursive: true })
    mkdirSync(join(TEST_CW, 'sessions/myapp/review-pr-42'), { recursive: true })
    mkdirSync(join(TEST_CW, 'accounts/default'), { recursive: true })

    writeFileSync(join(TEST_CW, 'projects.json'), JSON.stringify({
      myapp: { path: '/tmp/myapp', account: 'default', type: 'fullstack', registered: '2026-01-01T00:00:00Z' },
      other: { path: '/tmp/other', account: 'default', type: 'fullstack', registered: '2026-01-02T00:00:00Z' }
    }))

    writeFileSync(join(TEST_CW, 'config.yaml'), `default_account: default\nskip_permissions: true\n`)

    writeFileSync(join(TEST_CW, 'sessions/myapp/task-fix-bug/session.json'), JSON.stringify({
      project: 'myapp', task: 'fix-bug', type: 'task', account: 'default',
      workflow: 'bugfix', worktree: '/tmp/myapp/.tasks/fix-bug',
      notes: join(TEST_CW, 'sessions/myapp/task-fix-bug/TASK_NOTES.md'),
      source: '', source_url: '', status: 'active',
      created: '2026-04-01T10:00:00Z', last_opened: '2026-04-02T15:00:00Z', opens: 3
    }))

    writeFileSync(join(TEST_CW, 'sessions/myapp/task-fix-bug/TASK_NOTES.md'), '# Fix Bug\nNotes here')

    writeFileSync(join(TEST_CW, 'sessions/myapp/review-pr-42/session.json'), JSON.stringify({
      project: 'myapp', pr: '42', type: 'review', account: 'default',
      worktree: '/tmp/myapp/.reviews/pr-42',
      notes: join(TEST_CW, 'sessions/myapp/review-pr-42/REVIEW_NOTES.md'),
      status: 'done', created: '2026-03-30T10:00:00Z', last_opened: '2026-03-30T10:00:00Z',
      opens: 1, closed: '2026-03-31T10:00:00Z'
    }))

    reader = new CWReader(TEST_CW)
  })

  afterEach(() => {
    rmSync(TEST_CW, { recursive: true, force: true })
  })

  it('reads projects', () => {
    const projects = reader.getProjects()
    expect(Object.keys(projects)).toHaveLength(2)
    expect(projects.myapp.path).toBe('/tmp/myapp')
  })

  it('reads all spaces (sessions)', () => {
    const spaces = reader.getSpaces()
    expect(spaces).toHaveLength(2)
    const task = spaces.find(s => s.type === 'task')
    expect(task?.task).toBe('fix-bug')
    expect(task?.status).toBe('active')
  })

  it('reads spaces filtered by project', () => {
    const spaces = reader.getSpaces('myapp')
    expect(spaces).toHaveLength(2)
  })

  it('reads single session', () => {
    const session = reader.getSession('myapp', 'task-fix-bug')
    expect(session?.task).toBe('fix-bug')
    expect(session?.opens).toBe(3)
  })

  it('reads session notes', () => {
    const notes = reader.getNotes('myapp', 'task-fix-bug')
    expect(notes).toContain('Fix Bug')
  })

  it('returns null for missing session', () => {
    const session = reader.getSession('myapp', 'task-nonexistent')
    expect(session).toBeNull()
  })

  it('reads accounts', () => {
    const accounts = reader.getAccounts()
    expect(accounts).toContain('default')
  })

  it('detects project stack', () => {
    mkdirSync('/tmp/myapp', { recursive: true })
    writeFileSync('/tmp/myapp/package.json', '{"dependencies":{"react":"18"}}')
    writeFileSync('/tmp/myapp/vitest.config.ts', '')
    const detection = reader.detectStack('myapp')
    expect(detection.hasPackageJson).toBe(true)
    expect(detection.hasTests).toBe(true)
    rmSync('/tmp/myapp', { recursive: true, force: true })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/core && npx vitest run src/cw-reader.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create CW types**

`packages/core/src/cw-types.ts`:

```typescript
export interface CWProject {
  path: string
  account: string
  type: string
  registered: string
}

export interface CWSession {
  project: string
  task?: string
  pr?: string
  type: 'task' | 'review'
  account: string
  workflow?: string
  worktree: string
  notes: string
  source?: string
  source_url?: string
  status: 'active' | 'done'
  created: string
  last_opened: string
  opens: number
  closed?: string
}

export interface CWConfig {
  default_account: string
  skip_permissions: boolean
  tools?: {
    tracker?: string
    docs?: string
    chat?: string
    repo?: string
  }
}

export interface StackDetection {
  hasPackageJson: boolean
  hasTests: boolean
  hasTailwind: boolean
  hasShadcn: boolean
  hasTokens: boolean
  hasFigmaConfig: boolean
  hasPlaywright: boolean
  hasDockerfile: boolean
  framework: string | null
  testRunner: string | null
}
```

- [ ] **Step 4: Implement CW reader**

`packages/core/src/cw-reader.ts`:

```typescript
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { CWProject, CWSession, StackDetection } from './cw-types.js'

export class CWReader {
  private cwDir: string

  constructor(cwDir?: string) {
    this.cwDir = cwDir ?? join(process.env.HOME ?? '', '.cw')
  }

  getProjects(): Record<string, CWProject> {
    const path = join(this.cwDir, 'projects.json')
    if (!existsSync(path)) return {}
    return JSON.parse(readFileSync(path, 'utf-8'))
  }

  getSpaces(projectFilter?: string): CWSession[] {
    const sessionsDir = join(this.cwDir, 'sessions')
    if (!existsSync(sessionsDir)) return []

    const sessions: CWSession[] = []
    const projects = readdirSync(sessionsDir, { withFileTypes: true })

    for (const proj of projects) {
      if (!proj.isDirectory()) continue
      if (projectFilter && proj.name !== projectFilter) continue

      const projDir = join(sessionsDir, proj.name)
      const entries = readdirSync(projDir, { withFileTypes: true })

      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const sessionPath = join(projDir, entry.name, 'session.json')
        if (!existsSync(sessionPath)) continue

        try {
          const data = JSON.parse(readFileSync(sessionPath, 'utf-8')) as CWSession
          sessions.push(data)
        } catch {
          // skip corrupt session files
        }
      }
    }

    return sessions.sort((a, b) =>
      new Date(b.last_opened).getTime() - new Date(a.last_opened).getTime()
    )
  }

  getSession(project: string, sessionDir: string): CWSession | null {
    const path = join(this.cwDir, 'sessions', project, sessionDir, 'session.json')
    if (!existsSync(path)) return null
    try {
      return JSON.parse(readFileSync(path, 'utf-8'))
    } catch {
      return null
    }
  }

  getNotes(project: string, sessionDir: string): string {
    const sessionPath = join(this.cwDir, 'sessions', project, sessionDir, 'session.json')
    if (!existsSync(sessionPath)) return ''
    try {
      const session = JSON.parse(readFileSync(sessionPath, 'utf-8')) as CWSession
      if (existsSync(session.notes)) return readFileSync(session.notes, 'utf-8')
    } catch {}
    // Try TASK_NOTES.md or REVIEW_NOTES.md directly
    for (const name of ['TASK_NOTES.md', 'REVIEW_NOTES.md']) {
      const p = join(this.cwDir, 'sessions', project, sessionDir, name)
      if (existsSync(p)) return readFileSync(p, 'utf-8')
    }
    return ''
  }

  getAccounts(): string[] {
    const dir = join(this.cwDir, 'accounts')
    if (!existsSync(dir)) return []
    return readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name)
  }

  detectStack(project: string): StackDetection {
    const projects = this.getProjects()
    const projPath = projects[project]?.path ?? ''

    const has = (file: string) => existsSync(join(projPath, file))

    let framework: string | null = null
    if (has('next.config.js') || has('next.config.ts') || has('next.config.mjs')) framework = 'nextjs'
    else if (has('vite.config.ts') || has('vite.config.js')) framework = 'vite'
    else if (has('astro.config.mjs')) framework = 'astro'
    else if (has('nuxt.config.ts')) framework = 'nuxt'

    let testRunner: string | null = null
    if (has('vitest.config.ts') || has('vitest.config.js')) testRunner = 'vitest'
    else if (has('jest.config.js') || has('jest.config.ts')) testRunner = 'jest'
    else if (has('pytest.ini') || has('pyproject.toml')) testRunner = 'pytest'

    return {
      hasPackageJson: has('package.json'),
      hasTests: testRunner !== null || has('tests') || has('__tests__'),
      hasTailwind: has('tailwind.config.js') || has('tailwind.config.ts'),
      hasShadcn: has('components.json'),
      hasTokens: has('tokens') || has('src/tokens'),
      hasFigmaConfig: has('.figma.json') || has('figma.config.ts'),
      hasPlaywright: has('playwright.config.ts'),
      hasDockerfile: has('Dockerfile'),
      framework,
      testRunner
    }
  }
}
```

- [ ] **Step 5: Run tests**

Run: `cd packages/core && npx vitest run src/cw-reader.test.ts`
Expected: ALL PASS (8 tests)

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/cw-types.ts packages/core/src/cw-reader.ts packages/core/src/cw-reader.test.ts
git commit -m "feat(core): CWReader — reads projects, sessions, notes, stack detection from ~/.cw"
```

---

## Task 2: CW API routes

**Files:**
- Create: `packages/core/src/cw-routes.ts`
- Create: `packages/core/src/cw-routes.test.ts`

- [ ] **Step 1: Write failing tests**

`packages/core/src/cw-routes.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Hono } from 'hono'
import { cwRoutes } from './cw-routes.js'
import { CWReader } from './cw-reader.js'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const TEST_CW = join(import.meta.dirname, '../.test-cw-routes')

describe('CW Routes', () => {
  let app: Hono

  beforeAll(() => {
    mkdirSync(join(TEST_CW, 'sessions/testproj/task-mytask'), { recursive: true })
    mkdirSync(join(TEST_CW, 'accounts/default'), { recursive: true })

    writeFileSync(join(TEST_CW, 'projects.json'), JSON.stringify({
      testproj: { path: '/tmp/testproj', account: 'default', type: 'fullstack', registered: '2026-01-01T00:00:00Z' }
    }))

    writeFileSync(join(TEST_CW, 'config.yaml'), 'default_account: default\n')

    writeFileSync(join(TEST_CW, 'sessions/testproj/task-mytask/session.json'), JSON.stringify({
      project: 'testproj', task: 'mytask', type: 'task', account: 'default',
      worktree: '/tmp/testproj/.tasks/mytask', notes: join(TEST_CW, 'sessions/testproj/task-mytask/TASK_NOTES.md'),
      status: 'active', created: '2026-04-01T10:00:00Z', last_opened: '2026-04-02T15:00:00Z', opens: 2
    }))

    writeFileSync(join(TEST_CW, 'sessions/testproj/task-mytask/TASK_NOTES.md'), '# My Task\nSome notes')

    const reader = new CWReader(TEST_CW)
    app = new Hono()
    app.route('/api/cw', cwRoutes(reader))
  })

  afterAll(() => {
    rmSync(TEST_CW, { recursive: true, force: true })
  })

  it('GET /api/cw/projects returns projects', async () => {
    const res = await app.request('/api/cw/projects')
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.testproj).toBeDefined()
  })

  it('GET /api/cw/spaces returns sessions', async () => {
    const res = await app.request('/api/cw/spaces')
    expect(res.status).toBe(200)
    const body = await res.json() as unknown[]
    expect(body.length).toBeGreaterThan(0)
  })

  it('GET /api/cw/spaces?project=testproj filters', async () => {
    const res = await app.request('/api/cw/spaces?project=testproj')
    const body = await res.json() as { project: string }[]
    expect(body.every(s => s.project === 'testproj')).toBe(true)
  })

  it('GET /api/cw/session/testproj/task-mytask returns session', async () => {
    const res = await app.request('/api/cw/session/testproj/task-mytask')
    expect(res.status).toBe(200)
    const body = await res.json() as { task: string }
    expect(body.task).toBe('mytask')
  })

  it('GET /api/cw/notes/testproj/task-mytask returns notes', async () => {
    const res = await app.request('/api/cw/notes/testproj/task-mytask')
    expect(res.status).toBe(200)
    const body = await res.json() as { content: string }
    expect(body.content).toContain('My Task')
  })

  it('GET /api/cw/accounts returns account list', async () => {
    const res = await app.request('/api/cw/accounts')
    expect(res.status).toBe(200)
    const body = await res.json() as string[]
    expect(body).toContain('default')
  })

  it('GET /api/cw/session/testproj/nonexistent returns 404', async () => {
    const res = await app.request('/api/cw/session/testproj/nonexistent')
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 2: Implement CW routes**

`packages/core/src/cw-routes.ts`:

```typescript
import { Hono } from 'hono'
import { CWReader } from './cw-reader.js'
import { execSync } from 'node:child_process'

export function cwRoutes(reader: CWReader): Hono {
  const app = new Hono()

  app.get('/projects', (c) => {
    return c.json(reader.getProjects())
  })

  app.get('/spaces', (c) => {
    const project = c.req.query('project')
    return c.json(reader.getSpaces(project))
  })

  app.get('/session/:project/:sessionDir', (c) => {
    const { project, sessionDir } = c.req.param()
    const session = reader.getSession(project, sessionDir)
    if (!session) return c.json({ error: 'Session not found' }, 404)
    return c.json(session)
  })

  app.get('/notes/:project/:sessionDir', (c) => {
    const { project, sessionDir } = c.req.param()
    const content = reader.getNotes(project, sessionDir)
    return c.json({ content })
  })

  app.get('/accounts', (c) => {
    return c.json(reader.getAccounts())
  })

  app.get('/detect/:project', (c) => {
    const project = c.req.param('project')
    return c.json(reader.detectStack(project))
  })

  app.get('/git/status/:project/:sessionDir', (c) => {
    const session = reader.getSession(c.req.param('project'), c.req.param('sessionDir'))
    if (!session) return c.json({ error: 'Session not found' }, 404)
    try {
      const output = execSync('git status --short', { cwd: session.worktree, encoding: 'utf-8', timeout: 5000 })
      return c.json({ output })
    } catch {
      return c.json({ output: '' })
    }
  })

  app.get('/git/log/:project/:sessionDir', (c) => {
    const session = reader.getSession(c.req.param('project'), c.req.param('sessionDir'))
    if (!session) return c.json({ error: 'Session not found' }, 404)
    try {
      const output = execSync('git log --oneline -20', { cwd: session.worktree, encoding: 'utf-8', timeout: 5000 })
      return c.json({ output })
    } catch {
      return c.json({ output: '' })
    }
  })

  app.get('/git/diff/:project/:sessionDir', (c) => {
    const session = reader.getSession(c.req.param('project'), c.req.param('sessionDir'))
    if (!session) return c.json({ error: 'Session not found' }, 404)
    try {
      const output = execSync('git diff HEAD~5..HEAD --stat 2>/dev/null || git diff --stat', { cwd: session.worktree, encoding: 'utf-8', timeout: 10000 })
      return c.json({ output })
    } catch {
      return c.json({ output: '' })
    }
  })

  app.post('/start', async (c) => {
    const { type, project, task, description, workflow } = await c.req.json<{
      type: string; project: string; task: string; description?: string; workflow?: string
    }>()

    let cmd = ''
    if (type === 'review') {
      cmd = `cw review ${project} ${task}`
    } else if (type === 'plan') {
      cmd = `cw plan ${project} "${description ?? task}"`
    } else if (type === 'create') {
      cmd = `cw create "${description ?? task}" --name ${project}`
    } else {
      cmd = `cw work ${project} ${task}`
      if (workflow) cmd += ` --workflow ${workflow}`
    }

    try {
      execSync(cmd, { encoding: 'utf-8', timeout: 30000, stdio: 'pipe' })
      return c.json({ ok: true, command: cmd })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      return c.json({ ok: false, error: msg, command: cmd }, 500)
    }
  })

  app.post('/done', async (c) => {
    const { project, task, type } = await c.req.json<{ project: string; task: string; type: string }>()
    const cmd = type === 'review'
      ? `cw review ${project} ${task} --done`
      : `cw work ${project} ${task} --done`
    try {
      execSync(cmd, { encoding: 'utf-8', timeout: 15000, stdio: 'pipe' })
      return c.json({ ok: true })
    } catch (e) {
      return c.json({ ok: false, error: e instanceof Error ? e.message : 'Unknown error' }, 500)
    }
  })

  return app
}
```

- [ ] **Step 3: Run tests**

Run: `cd packages/core && npx vitest run src/cw-routes.test.ts`
Expected: ALL PASS (7 tests)

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/cw-routes.ts packages/core/src/cw-routes.test.ts
git commit -m "feat(core): CW API routes — projects, spaces, sessions, git, start/done"
```

---

## Task 3: Wire CW routes into server + update exports

**Files:**
- Modify: `packages/core/src/server.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Update server.ts**

Read `packages/core/src/server.ts`. Add CWReader import and mount CW routes. Keep health, action-logs, and auth. Remove module-specific routes (`/api/modules/*`, `/api/registry/*`, `/api/filesystem/*`).

Add imports at top:
```typescript
import { CWReader } from './cw-reader.js'
import { cwRoutes } from './cw-routes.js'
```

In `createForgeServer`, after `app.use('*', cors())` and the auth middleware, add:
```typescript
  const cwReader = new CWReader()
  app.route('/api/cw', cwRoutes(cwReader))
```

Keep these routes: `/api/health`, `/api/action-logs`, `/api/modules/:module/settings` (for backward compat).
Remove: `/api/registry/search`, `/api/filesystem/browse`.

- [ ] **Step 2: Update index.ts**

Add to `packages/core/src/index.ts`:
```typescript
export { CWReader } from './cw-reader.js'
export { cwRoutes } from './cw-routes.js'
export type { CWProject, CWSession, CWConfig, StackDetection } from './cw-types.js'
```

- [ ] **Step 3: Build and test**

Run: `cd packages/core && npx tsc && npx vitest run`
Expected: Build clean, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/server.ts packages/core/src/index.ts
git commit -m "feat(core): mount CW routes in server, export CWReader"
```

---

## Task 4: Rewrite console — Shell + App + TaskList

**Files:**
- Rewrite: `packages/console/src/shell.tsx`
- Rewrite: `packages/console/src/app.tsx`
- Create: `packages/console/src/pages/TaskList.tsx`
- Delete: `packages/console/src/pages/Home.tsx`
- Delete: `packages/console/src/pages/ModuleShell.tsx`
- Delete: `packages/console/src/pages/ModulePage.tsx`
- Delete: `packages/console/src/panels/registry.ts`
- Modify: `packages/console/package.json`

- [ ] **Step 1: Clean up old files**

```bash
rm packages/console/src/pages/Home.tsx
rm packages/console/src/pages/ModuleShell.tsx
rm packages/console/src/pages/ModulePage.tsx
rm packages/console/src/panels/registry.ts
```

- [ ] **Step 2: Remove module deps from console package.json**

Read `packages/console/package.json`, remove all `@forge-dev/mod-*` dependencies. Keep `preact`, `@preact/signals`, `preact-router`, `@forge-dev/ui`, `@forge-dev/sdk`.

- [ ] **Step 3: Rewrite shell.tsx**

`packages/console/src/shell.tsx`:

```typescript
import { type FunctionComponent, type ComponentChildren } from 'preact'
import { signal } from '@preact/signals'
import { ToastContainer } from '@forge-dev/ui'

export const theme = signal<'dark' | 'light'>('dark')

const toggleTheme = () => {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
  document.documentElement.setAttribute('data-theme', theme.value)
}

interface ShellProps {
  children: ComponentChildren
}

export const Shell: FunctionComponent<ShellProps> = ({ children }) => {
  return (
    <div class="min-h-screen bg-forge-bg text-forge-text">
      <header class="h-14 border-b border-forge-border flex items-center justify-between px-6">
        <div class="flex items-center gap-3">
          <h1 class="text-lg font-bold">Forge</h1>
        </div>
        <div class="flex items-center gap-3">
          <button class="text-xs text-forge-muted hover:text-forge-text" onClick={toggleTheme}>
            {theme.value === 'dark' ? 'Light' : 'Dark'}
          </button>
        </div>
      </header>
      <main class="max-w-4xl mx-auto p-6">
        {children}
      </main>
      <ToastContainer />
    </div>
  )
}
```

- [ ] **Step 4: Create TaskList.tsx**

`packages/console/src/pages/TaskList.tsx`:

```typescript
import { type FunctionComponent } from 'preact'
import { ActionButton, Badge, EmptyState } from '@forge-dev/ui'
import type { CWSession } from '@forge-dev/core'

interface TaskListProps {
  spaces: CWSession[]
  loading: boolean
  onNewTask: (type?: string) => void
  onSelectTask: (session: CWSession) => void
  onRefresh: () => void
}

export const TaskList: FunctionComponent<TaskListProps> = ({
  spaces, loading, onNewTask, onSelectTask, onRefresh
}) => {
  const active = spaces.filter(s => s.status === 'active')
  const done = spaces.filter(s => s.status === 'done').slice(0, 10)

  const typeColor: Record<string, string> = {
    task: 'var(--forge-warning)',
    review: 'var(--forge-accent)',
  }

  const typeLabel = (s: CWSession) => {
    if (s.type === 'review') return 'REVIEW'
    return 'DEV'
  }

  const taskName = (s: CWSession) => {
    if (s.type === 'review') return `PR #${s.pr}`
    return s.task ?? 'unknown'
  }

  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime()
    const hours = Math.floor(diff / 3600000)
    if (hours < 1) return 'just now'
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  }

  if (!loading && spaces.length === 0) {
    return null // onboarding shown by parent
  }

  return (
    <div>
      {/* Quick launch */}
      <div class="flex items-center gap-3 mb-6">
        <ActionButton label="+ New Task" variant="primary" onClick={() => onNewTask()} />
        <div class="flex gap-2">
          {['Dev', 'Design', 'Review', 'Plan'].map(t => (
            <button
              key={t}
              class="px-3 py-1.5 text-xs rounded-lg bg-forge-surface border border-forge-border text-forge-muted hover:text-forge-text hover:border-forge-accent/40 transition-colors"
              onClick={() => onNewTask(t.toLowerCase())}
            >
              {t}
            </button>
          ))}
        </div>
        <div class="flex-1" />
        <ActionButton label="Refresh" variant="secondary" onClick={onRefresh} />
      </div>

      {/* Active tasks */}
      {active.length > 0 && (
        <div class="mb-8">
          <div class="text-xs font-medium text-forge-muted uppercase tracking-wider mb-3">
            Active · {active.length} task{active.length !== 1 ? 's' : ''}
          </div>
          <div class="space-y-2">
            {active.map(s => (
              <div
                key={`${s.project}-${s.task ?? s.pr}`}
                class="flex items-center justify-between p-3 rounded-lg bg-forge-surface border border-forge-border hover:border-forge-accent/40 cursor-pointer transition-colors"
                onClick={() => onSelectTask(s)}
              >
                <div class="flex items-center gap-3 min-w-0">
                  <Badge label={typeLabel(s)} color={typeColor[s.type]} />
                  <span class="font-medium text-sm truncate">{taskName(s)}</span>
                  <span class="text-xs text-forge-muted">{s.project}</span>
                </div>
                <div class="flex items-center gap-3">
                  <span class="text-xs text-forge-muted">{timeAgo(s.last_opened)}</span>
                  <span class="text-xs text-forge-success">▶ Resume</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Done tasks */}
      {done.length > 0 && (
        <div>
          <div class="text-xs font-medium text-forge-muted uppercase tracking-wider mb-3">
            Recent (done)
          </div>
          <div class="space-y-1">
            {done.map(s => (
              <div
                key={`${s.project}-${s.task ?? s.pr}-done`}
                class="flex items-center justify-between p-2.5 rounded-lg text-forge-muted hover:bg-forge-surface/50 cursor-pointer transition-colors"
                onClick={() => onSelectTask(s)}
              >
                <div class="flex items-center gap-3 min-w-0">
                  <Badge label={typeLabel(s)} color="var(--forge-muted)" variant="outline" />
                  <span class="text-sm truncate">{taskName(s)}</span>
                  <span class="text-xs">{s.project}</span>
                </div>
                <span class="text-xs">{s.opens} session{s.opens !== 1 ? 's' : ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Rewrite app.tsx**

`packages/console/src/app.tsx`:

```typescript
import { render } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { Shell } from './shell.js'
import { TaskList } from './pages/TaskList.js'
import { EmptyState } from '@forge-dev/ui'
import type { CWSession } from '@forge-dev/core'
import './styles/theme.css'
import 'virtual:uno.css'

type View = 'list' | 'detail' | 'new-task'

function App() {
  const [spaces, setSpaces] = useState<CWSession[]>([])
  const [projects, setProjects] = useState<Record<string, { path: string }>>({})
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>('list')
  const [selectedSession, setSelectedSession] = useState<CWSession | null>(null)
  const [newTaskType, setNewTaskType] = useState<string | undefined>()

  const fetchData = async () => {
    setLoading(true)
    try {
      const [spacesRes, projectsRes] = await Promise.all([
        fetch('/api/cw/spaces'),
        fetch('/api/cw/projects')
      ])
      setSpaces(await spacesRes.json() as CWSession[])
      setProjects(await projectsRes.json() as Record<string, { path: string }>)
    } catch {
      // server not ready
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const hasProjects = Object.keys(projects).length > 0

  const handleNewTask = (type?: string) => {
    setNewTaskType(type)
    setView('new-task')
  }

  const handleSelectTask = (session: CWSession) => {
    setSelectedSession(session)
    setView('detail')
  }

  return (
    <Shell>
      {loading ? (
        <div class="py-20 text-center text-forge-muted">Loading...</div>
      ) : !hasProjects ? (
        <EmptyState
          icon="&#128296;"
          title="Welcome to Forge"
          description="No projects found in CW. Register a project with 'cw open <project>' or create one with 'cw create' first."
        />
      ) : view === 'list' ? (
        <TaskList
          spaces={spaces}
          loading={loading}
          onNewTask={handleNewTask}
          onSelectTask={handleSelectTask}
          onRefresh={fetchData}
        />
      ) : view === 'detail' && selectedSession ? (
        <div>
          <button
            class="text-sm text-forge-muted hover:text-forge-text mb-4"
            onClick={() => setView('list')}
          >
            ← Back to tasks
          </button>
          <div class="text-forge-muted py-8 text-center">
            Task detail view (Task 5)
          </div>
        </div>
      ) : view === 'new-task' ? (
        <div>
          <button
            class="text-sm text-forge-muted hover:text-forge-text mb-4"
            onClick={() => setView('list')}
          >
            ← Back to tasks
          </button>
          <div class="text-forge-muted py-8 text-center">
            New task form (Task 6)
          </div>
        </div>
      ) : null}
    </Shell>
  )
}

render(<App />, document.getElementById('app')!)
```

- [ ] **Step 6: Run npm install + build**

```bash
npm install
npx turbo build --filter=@forge-dev/console --force
```

- [ ] **Step 7: Commit**

```bash
git add packages/console/ -A
git commit -m "refactor(console): rewrite to CW task launcher — Shell, TaskList, App"
```

---

## Task 5: Task Detail page (tabbed)

**Files:**
- Create: `packages/console/src/pages/TaskDetail.tsx`
- Modify: `packages/console/src/app.tsx`

- [ ] **Step 1: Create TaskDetail.tsx**

`packages/console/src/pages/TaskDetail.tsx`:

```typescript
import { type FunctionComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { Tabs, ActionButton, Badge, ForgeTerminal, showToast } from '@forge-dev/ui'
import type { CWSession } from '@forge-dev/core'

interface TaskDetailProps {
  session: CWSession
  onBack: () => void
  onDone: () => void
}

export const TaskDetail: FunctionComponent<TaskDetailProps> = ({ session, onBack, onDone }) => {
  const [activeTab, setActiveTab] = useState('status')
  const [gitLog, setGitLog] = useState<string>('')
  const [gitDiff, setGitDiff] = useState<string>('')
  const [gitStatus, setGitStatus] = useState<string>('')
  const [notes, setNotes] = useState<string>('')
  const [testOutput, setTestOutput] = useState<string | null>(null)
  const [runningTests, setRunningTests] = useState(false)

  const sessionDir = session.type === 'review' ? `review-pr-${session.pr}` : `task-${session.task}`

  const fetchGit = async () => {
    const [logRes, diffRes, statusRes] = await Promise.all([
      fetch(`/api/cw/git/log/${session.project}/${sessionDir}`),
      fetch(`/api/cw/git/diff/${session.project}/${sessionDir}`),
      fetch(`/api/cw/git/status/${session.project}/${sessionDir}`)
    ])
    setGitLog((await logRes.json() as { output: string }).output)
    setGitDiff((await diffRes.json() as { output: string }).output)
    setGitStatus((await statusRes.json() as { output: string }).output)
  }

  const fetchNotes = async () => {
    const res = await fetch(`/api/cw/notes/${session.project}/${sessionDir}`)
    setNotes((await res.json() as { content: string }).content)
  }

  useEffect(() => { fetchGit(); fetchNotes() }, [session])

  const resume = async () => {
    try {
      await fetch('/api/cw/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: session.type === 'review' ? 'review' : 'dev',
          project: session.project,
          task: session.type === 'review' ? session.pr : session.task
        })
      })
      showToast('Session resumed in terminal', 'success')
    } catch {
      showToast('Failed to resume', 'error')
    }
  }

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

  const taskName = session.type === 'review' ? `PR #${session.pr}` : session.task
  const typeLabel = session.type === 'review' ? 'REVIEW' : 'DEV'
  const typeColor = session.type === 'review' ? 'var(--forge-accent)' : 'var(--forge-warning)'

  const tabs = [
    { id: 'status', label: 'Status' },
    { id: 'diff', label: 'Diff' },
    { id: 'tests', label: 'Tests' },
    { id: 'notes', label: 'Notes' },
  ]

  return (
    <div>
      <button class="text-sm text-forge-muted hover:text-forge-text mb-4" onClick={onBack}>
        ← Back to tasks
      </button>

      {/* Header */}
      <div class="flex items-center justify-between mb-6">
        <div class="flex items-center gap-3">
          <Badge label={typeLabel} color={typeColor} />
          <h2 class="text-xl font-bold">{taskName}</h2>
          <span class="text-sm text-forge-muted">{session.project}</span>
        </div>
        <div class="flex gap-2">
          {session.status === 'active' && (
            <>
              <ActionButton label="▶ Resume" variant="primary" onClick={resume} />
              <ActionButton label="✓ Done" variant="secondary" onClick={markDone} />
            </>
          )}
        </div>
      </div>

      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {/* Status tab */}
      {activeTab === 'status' && (
        <div>
          <div class="grid grid-cols-3 gap-4 mb-6">
            <div class="p-3 rounded-lg bg-forge-surface border border-forge-border">
              <div class="text-xs text-forge-muted mb-1">Branch</div>
              <div class="text-sm font-medium truncate">{session.task ?? session.pr}</div>
            </div>
            <div class="p-3 rounded-lg bg-forge-surface border border-forge-border">
              <div class="text-xs text-forge-muted mb-1">Sessions</div>
              <div class="text-sm font-medium">{session.opens} open{session.opens !== 1 ? 's' : ''}</div>
            </div>
            <div class="p-3 rounded-lg bg-forge-surface border border-forge-border">
              <div class="text-xs text-forge-muted mb-1">Status</div>
              <div class="text-sm font-medium">{session.status}</div>
            </div>
          </div>

          {gitStatus && (
            <div>
              <div class="text-xs text-forge-muted uppercase mb-2">Changed files</div>
              <pre class="p-3 rounded-lg bg-forge-surface border border-forge-border text-xs font-mono whitespace-pre-wrap">{gitStatus}</pre>
            </div>
          )}

          {gitLog && (
            <div class="mt-4">
              <div class="text-xs text-forge-muted uppercase mb-2">Recent commits</div>
              <pre class="p-3 rounded-lg bg-forge-surface border border-forge-border text-xs font-mono whitespace-pre-wrap">{gitLog}</pre>
            </div>
          )}
        </div>
      )}

      {/* Diff tab */}
      {activeTab === 'diff' && (
        <div>
          {gitDiff ? (
            <pre class="p-3 rounded-lg bg-forge-surface border border-forge-border text-xs font-mono whitespace-pre-wrap overflow-auto max-h-[600px]">{gitDiff}</pre>
          ) : (
            <div class="text-forge-muted text-sm py-8 text-center">No diff available</div>
          )}
        </div>
      )}

      {/* Tests tab */}
      {activeTab === 'tests' && (
        <div>
          <ActionButton
            label={runningTests ? 'Running...' : 'Run Tests'}
            variant="primary"
            loading={runningTests}
            onClick={async () => {
              setRunningTests(true)
              try {
                const res = await fetch(`/api/cw/git/status/${session.project}/${sessionDir}`)
                setTestOutput('Tests would run in worktree: ' + session.worktree)
              } catch {
                setTestOutput('Failed to run tests')
              } finally {
                setRunningTests(false)
              }
            }}
          />
          {testOutput && (
            <div class="mt-4">
              <ForgeTerminal content={testOutput} height={300} />
            </div>
          )}
        </div>
      )}

      {/* Notes tab */}
      {activeTab === 'notes' && (
        <div>
          {notes ? (
            <pre class="p-4 rounded-lg bg-forge-surface border border-forge-border text-sm font-mono whitespace-pre-wrap overflow-auto max-h-[600px]">{notes}</pre>
          ) : (
            <div class="text-forge-muted text-sm py-8 text-center">No notes for this task</div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Wire into app.tsx**

In `packages/console/src/app.tsx`, add import:
```typescript
import { TaskDetail } from './pages/TaskDetail.js'
```

Replace the `view === 'detail'` placeholder with:
```typescript
      ) : view === 'detail' && selectedSession ? (
        <TaskDetail
          session={selectedSession}
          onBack={() => { setView('list'); fetchData() }}
          onDone={() => { setView('list'); fetchData() }}
        />
```

- [ ] **Step 3: Build**

Run: `npx turbo build --filter=@forge-dev/console --force`

- [ ] **Step 4: Commit**

```bash
git add packages/console/
git commit -m "feat(console): TaskDetail page — Status, Diff, Tests, Notes tabs"
```

---

## Task 6: New Task modal

**Files:**
- Create: `packages/console/src/pages/NewTask.tsx`
- Modify: `packages/console/src/app.tsx`

- [ ] **Step 1: Create NewTask.tsx**

`packages/console/src/pages/NewTask.tsx`:

```typescript
import { type FunctionComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { ActionButton, Badge, showToast } from '@forge-dev/ui'

interface NewTaskProps {
  projects: Record<string, { path: string }>
  initialType?: string
  onBack: () => void
  onCreated: () => void
}

const TYPES = [
  { id: 'dev', label: 'Dev', color: '#f59e0b' },
  { id: 'design', label: 'Design', color: '#8b5cf6' },
  { id: 'review', label: 'Review', color: '#6366f1' },
  { id: 'plan', label: 'Plan', color: '#3b82f6' },
  { id: 'create', label: 'Create Project', color: '#10b981' },
]

export const NewTask: FunctionComponent<NewTaskProps> = ({
  projects, initialType, onBack, onCreated
}) => {
  const [type, setType] = useState(initialType ?? 'dev')
  const [project, setProject] = useState('')
  const [task, setTask] = useState('')
  const [description, setDescription] = useState('')
  const [workflow, setWorkflow] = useState('')
  const [starting, setStarting] = useState(false)
  const [detection, setDetection] = useState<Record<string, unknown> | null>(null)

  const projectNames = Object.keys(projects)

  useEffect(() => {
    if (projectNames.length > 0 && !project) {
      setProject(projectNames[0])
    }
  }, [projectNames])

  useEffect(() => {
    if (project && type !== 'create') {
      fetch(`/api/cw/detect/${project}`)
        .then(r => r.json())
        .then(d => setDetection(d as Record<string, unknown>))
        .catch(() => setDetection(null))
    }
  }, [project, type])

  const handleStart = async () => {
    if (type !== 'create' && !task.trim()) return
    if (type === 'create' && !description.trim()) return

    setStarting(true)
    try {
      const res = await fetch('/api/cw/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: type === 'design' ? 'dev' : type,
          project: type === 'create' ? task.trim() : project,
          task: type === 'review' ? task.trim() : task.trim(),
          description: description.trim() || undefined,
          workflow: workflow || undefined
        })
      })
      const result = await res.json() as { ok: boolean; error?: string }
      if (result.ok) {
        showToast('Task started — check your terminal', 'success')
        onCreated()
      } else {
        showToast(result.error ?? 'Failed to start task', 'error')
      }
    } catch {
      showToast('Failed to start task', 'error')
    } finally {
      setStarting(false)
    }
  }

  const isReview = type === 'review'
  const isCreate = type === 'create'

  return (
    <div>
      <button class="text-sm text-forge-muted hover:text-forge-text mb-4" onClick={onBack}>
        ← Back to tasks
      </button>

      <h2 class="text-xl font-bold mb-6">New Task</h2>

      <div class="max-w-lg">
        {/* Type selector */}
        <div class="flex flex-wrap gap-2 mb-6">
          {TYPES.map(t => (
            <button
              key={t.id}
              class={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                type === t.id
                  ? 'border-forge-accent bg-forge-accent/10 text-forge-accent'
                  : 'border-forge-border bg-forge-surface text-forge-muted hover:text-forge-text'
              }`}
              onClick={() => setType(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Project selector (not for Create) */}
        {!isCreate && (
          <div class="mb-4">
            <label class="block text-sm font-medium mb-1">Project</label>
            <select
              class="w-full px-3 py-2 rounded-lg bg-forge-surface border border-forge-border text-forge-text text-sm focus:border-forge-accent focus:outline-none"
              value={project}
              onChange={(e) => setProject((e.target as HTMLSelectElement).value)}
            >
              {projectNames.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            {projects[project] && (
              <div class="text-xs text-forge-muted mt-1">{projects[project].path}</div>
            )}
          </div>
        )}

        {/* Task name / PR number / Project name */}
        <div class="mb-4">
          <label class="block text-sm font-medium mb-1">
            {isReview ? 'PR Number or URL' : isCreate ? 'Project Name' : 'Task Name or URL'}
          </label>
          <input
            type="text"
            value={task}
            onInput={(e) => setTask((e.target as HTMLInputElement).value)}
            placeholder={isReview ? '42 or https://github.com/...' : isCreate ? 'my-new-project' : 'fix-auth or https://linear.app/...'}
            class="w-full px-3 py-2 rounded-lg bg-forge-surface border border-forge-border text-forge-text text-sm focus:border-forge-accent focus:outline-none"
          />
        </div>

        {/* Description */}
        <div class="mb-4">
          <label class="block text-sm font-medium mb-1">
            {isCreate ? 'Describe what you want to build' : 'Description (optional)'}
          </label>
          <textarea
            value={description}
            onInput={(e) => setDescription((e.target as HTMLTextAreaElement).value)}
            placeholder={isCreate ? 'A SaaS platform for...' : 'Describe the task...'}
            rows={3}
            class="w-full px-3 py-2 rounded-lg bg-forge-surface border border-forge-border text-forge-text text-sm focus:border-forge-accent focus:outline-none resize-none"
          />
        </div>

        {/* Workflow (dev only) */}
        {type === 'dev' && (
          <div class="mb-4">
            <label class="block text-sm font-medium mb-1">Workflow</label>
            <div class="flex gap-2">
              {['', 'feature', 'bugfix', 'refactor'].map(w => (
                <button
                  key={w}
                  class={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                    workflow === w
                      ? 'border-forge-accent bg-forge-accent/10 text-forge-accent'
                      : 'border-forge-border bg-forge-surface text-forge-muted'
                  }`}
                  onClick={() => setWorkflow(w)}
                >
                  {w || 'Auto'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Stack detection */}
        {detection && !isCreate && (
          <div class="flex flex-wrap gap-2 mb-6">
            {detection.framework && <Badge label={String(detection.framework)} color="var(--forge-accent)" />}
            {detection.testRunner && <Badge label={String(detection.testRunner)} color="var(--forge-success)" />}
            {detection.hasTailwind && <Badge label="Tailwind" color="var(--forge-accent)" variant="outline" />}
            {detection.hasShadcn && <Badge label="shadcn" color="var(--forge-accent)" variant="outline" />}
            {detection.hasPlaywright && <Badge label="Playwright" color="var(--forge-success)" variant="outline" />}
            {detection.hasDockerfile && <Badge label="Docker" color="var(--forge-warning)" variant="outline" />}
          </div>
        )}

        {/* Start button */}
        <ActionButton
          label={starting ? 'Starting...' : isCreate ? 'Create Project ▶' : 'Start Task ▶'}
          variant="primary"
          loading={starting}
          disabled={isCreate ? !description.trim() : !task.trim()}
          onClick={handleStart}
        />
        <div class="text-xs text-forge-muted mt-2">
          {isCreate
            ? 'Creates a new project with CW'
            : `Opens a CW session in your terminal for ${project}`
          }
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire into app.tsx**

In `packages/console/src/app.tsx`, add import:
```typescript
import { NewTask } from './pages/NewTask.js'
```

Replace the `view === 'new-task'` placeholder with:
```typescript
      ) : view === 'new-task' ? (
        <NewTask
          projects={projects}
          initialType={newTaskType}
          onBack={() => setView('list')}
          onCreated={() => { setView('list'); fetchData() }}
        />
```

- [ ] **Step 3: Build**

Run: `npx turbo build --filter=@forge-dev/console --force`

- [ ] **Step 4: Commit**

```bash
git add packages/console/
git commit -m "feat(console): NewTask page — smart single screen with type/project/task/detection"
```

---

## Task 7: Integration test

**Files:**
- Create: `tests/integration/cw-api.test.ts`

- [ ] **Step 1: Write integration test**

`tests/integration/cw-api.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Hono } from 'hono'
import { cwRoutes } from '@forge-dev/core'
import { CWReader } from '@forge-dev/core'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const TEST_CW = join(import.meta.dirname, '../.test-cw-integration')

describe('CW API integration', () => {
  let app: Hono

  beforeAll(() => {
    mkdirSync(join(TEST_CW, 'sessions/demo/task-feat-1'), { recursive: true })
    mkdirSync(join(TEST_CW, 'sessions/demo/review-pr-10'), { recursive: true })
    mkdirSync(join(TEST_CW, 'accounts/myaccount'), { recursive: true })

    writeFileSync(join(TEST_CW, 'projects.json'), JSON.stringify({
      demo: { path: '/tmp/demo', account: 'myaccount', type: 'fullstack', registered: '2026-01-01T00:00:00Z' }
    }))

    writeFileSync(join(TEST_CW, 'config.yaml'), 'default_account: myaccount\n')

    writeFileSync(join(TEST_CW, 'sessions/demo/task-feat-1/session.json'), JSON.stringify({
      project: 'demo', task: 'feat-1', type: 'task', account: 'myaccount',
      worktree: '/tmp/demo/.tasks/feat-1', notes: join(TEST_CW, 'sessions/demo/task-feat-1/TASK_NOTES.md'),
      status: 'active', created: '2026-04-01T10:00:00Z', last_opened: '2026-04-02T15:00:00Z', opens: 2
    }))

    writeFileSync(join(TEST_CW, 'sessions/demo/task-feat-1/TASK_NOTES.md'), '# Feature 1')

    writeFileSync(join(TEST_CW, 'sessions/demo/review-pr-10/session.json'), JSON.stringify({
      project: 'demo', pr: '10', type: 'review', account: 'myaccount',
      worktree: '/tmp/demo/.reviews/pr-10', notes: '',
      status: 'done', created: '2026-03-01T00:00:00Z', last_opened: '2026-03-01T00:00:00Z', opens: 1
    }))

    const reader = new CWReader(TEST_CW)
    app = new Hono()
    app.route('/api/cw', cwRoutes(reader))
  })

  afterAll(() => {
    rmSync(TEST_CW, { recursive: true, force: true })
  })

  it('lists projects from CW', async () => {
    const res = await app.request('/api/cw/projects')
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.demo).toBeDefined()
  })

  it('lists all spaces sorted by last_opened', async () => {
    const res = await app.request('/api/cw/spaces')
    expect(res.status).toBe(200)
    const body = await res.json() as { project: string; status: string }[]
    expect(body).toHaveLength(2)
    expect(body[0].status).toBe('active') // most recent first
  })

  it('gets single session', async () => {
    const res = await app.request('/api/cw/session/demo/task-feat-1')
    expect(res.status).toBe(200)
    const body = await res.json() as { task: string; opens: number }
    expect(body.task).toBe('feat-1')
    expect(body.opens).toBe(2)
  })

  it('returns 404 for unknown session', async () => {
    const res = await app.request('/api/cw/session/demo/task-nope')
    expect(res.status).toBe(404)
  })

  it('reads task notes', async () => {
    const res = await app.request('/api/cw/notes/demo/task-feat-1')
    const body = await res.json() as { content: string }
    expect(body.content).toContain('Feature 1')
  })

  it('lists accounts', async () => {
    const res = await app.request('/api/cw/accounts')
    const body = await res.json() as string[]
    expect(body).toContain('myaccount')
  })

  it('includes review sessions in spaces', async () => {
    const res = await app.request('/api/cw/spaces')
    const body = await res.json() as { type: string }[]
    expect(body.find(s => s.type === 'review')).toBeDefined()
  })
})
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run tests/integration/cw-api.test.ts`
Expected: ALL PASS (7 tests)

- [ ] **Step 3: Run all tests**

Run: `cd packages/core && npx vitest run && cd ../.. && npx vitest run tests/integration/cw-api.test.ts`

- [ ] **Step 4: Commit**

```bash
git add tests/integration/cw-api.test.ts
git commit -m "test: CW API integration tests — projects, spaces, sessions, notes"
```

---

## Summary

| # | Task | Files | Tests |
|---|------|-------|-------|
| 1 | CW types + data reader | 3 | 8 unit |
| 2 | CW API routes | 2 | 7 unit |
| 3 | Wire routes into server | 2 | Build |
| 4 | Rewrite console — Shell + App + TaskList | 7 (4 created, 4 deleted, 2 rewritten) | Build |
| 5 | Task Detail page (tabbed) | 2 | Build |
| 6 | New Task modal | 2 | Build |
| 7 | Integration test | 1 | 7 integration |

**Totals: 7 tasks, ~19 files changed, 22 new tests**

After this: Forge opens to a task list showing your real CW sessions. You can create new tasks by type (Dev/Design/Review/Plan/Create), resume them (opens terminal), view status/diff/notes in the detail view. Data comes directly from CW's filesystem — zero duplication.
