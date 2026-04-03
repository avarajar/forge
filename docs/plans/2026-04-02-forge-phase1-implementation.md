# Forge Phase 1: Core Modules — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build 4 core modules (mod-dev, mod-monitor, mod-scaffold, mod-planning) with real panel UIs, wire the dashboard to dynamically discover and render module panels with tabs, and extend the server with settings and log query endpoints — so that every installed module shows its panels in the sidebar and users can view worktrees, health status, project templates, and architecture diagrams from the dashboard.

**Architecture:** Each module lives in `modules/mod-*/` as a workspace package. Panel components (Preact TSX) live inside the module under `panels/`. The console imports panel components at build time via workspace deps and registers them in a `panelRegistry` map. At runtime, the console fetches available modules from the API and renders the matching registered panels in a tabbed layout. New reusable UI components (Tabs, DataList, EmptyState) go in `@forge-dev/ui`. The SDK gains a `definePanel()` helper for type-safe panel exports and a `PanelProps` interface.

**Tech Stack:** TypeScript, Preact 10.x, Hono 4.x, UnoCSS 66.x, Vite 6.x, better-sqlite3 12.x, Vitest 4.x, xterm.js 5.x

---

## File Structure

**SDK modifications:**
- Modify: `packages/sdk/src/types.ts` — add `hidden` to ActionDef, add PanelProps, PanelConfig
- Create: `packages/sdk/src/define.ts` — definePanel helper
- Modify: `packages/sdk/src/index.ts` — re-export new types and definePanel
- Modify: `packages/sdk/package.json` — add preact to peerDependencies (already present)

**UI new components:**
- Create: `packages/ui/src/Tabs.tsx` — tabbed navigation
- Create: `packages/ui/src/DataList.tsx` — list of items with badges and actions
- Create: `packages/ui/src/EmptyState.tsx` — placeholder for unconfigured features
- Modify: `packages/ui/src/index.ts` — re-export new components

**Core modifications:**
- Modify: `packages/core/src/db.ts` — add `module_settings` table, `listActionLogs()`, settings CRUD
- Modify: `packages/core/src/db.test.ts` — tests for new DB methods
- Modify: `packages/core/src/server.ts` — add action-logs + settings endpoints
- Modify: `packages/core/src/server.test.ts` — tests for new endpoints
- Modify: `packages/core/src/types.ts` — add ModuleSettingRow type

**Console modifications:**
- Modify: `packages/console/src/app.tsx` — dynamic module loading + routing
- Create: `packages/console/src/pages/ModuleShell.tsx` — tabbed module panel view
- Create: `packages/console/src/panels/registry.ts` — panel component registry
- Modify: `packages/console/package.json` — add module workspace deps
- Modify: `packages/console/vite.config.ts` — dedupe preact

**mod-dev (4 files + 3 panels):**
- Create: `modules/mod-dev/package.json`
- Create: `modules/mod-dev/tsconfig.json`
- Create: `modules/mod-dev/forge-module.json`
- Create: `modules/mod-dev/panels/index.ts`
- Create: `modules/mod-dev/panels/Workspaces.tsx`
- Create: `modules/mod-dev/panels/Sessions.tsx`
- Create: `modules/mod-dev/panels/SharedContext.tsx`

**mod-monitor (4 files + 3 panels):**
- Create: `modules/mod-monitor/package.json`
- Create: `modules/mod-monitor/tsconfig.json`
- Create: `modules/mod-monitor/forge-module.json`
- Create: `modules/mod-monitor/panels/index.ts`
- Create: `modules/mod-monitor/panels/Health.tsx`
- Create: `modules/mod-monitor/panels/Activity.tsx`
- Create: `modules/mod-monitor/panels/Costs.tsx`

**mod-scaffold (4 files + 3 panels):**
- Create: `modules/mod-scaffold/package.json`
- Create: `modules/mod-scaffold/tsconfig.json`
- Create: `modules/mod-scaffold/forge-module.json`
- Create: `modules/mod-scaffold/panels/index.ts`
- Create: `modules/mod-scaffold/panels/Templates.tsx`
- Create: `modules/mod-scaffold/panels/Wizard.tsx`
- Create: `modules/mod-scaffold/panels/Recent.tsx`

**mod-planning (4 files + 4 panels):**
- Create: `modules/mod-planning/package.json`
- Create: `modules/mod-planning/tsconfig.json`
- Create: `modules/mod-planning/forge-module.json`
- Create: `modules/mod-planning/panels/index.ts`
- Create: `modules/mod-planning/panels/Board.tsx`
- Create: `modules/mod-planning/panels/Architecture.tsx`
- Create: `modules/mod-planning/panels/Docs.tsx`
- Create: `modules/mod-planning/panels/ADR.tsx`

**Integration tests:**
- Create: `tests/integration/phase1-modules.test.ts`

---

## Task 1: SDK — Add PanelProps, PanelConfig, definePanel, hidden actions

**Files:**
- Modify: `packages/sdk/src/types.ts`
- Create: `packages/sdk/src/define.ts`
- Modify: `packages/sdk/src/index.ts`

- [ ] **Step 1: Extend types.ts with PanelProps, PanelConfig, and hidden on ActionDef**

`packages/sdk/src/types.ts` — add after the existing `SettingDef` interface:

```typescript
// Add hidden to ActionDef:
// hidden?: boolean   (data-fetching actions not shown in UI action list)

// Add new interfaces:
export interface PanelProps {
  moduleId: string
  projectId: string | null
}

export interface PanelConfig {
  id: string
  title: string
  component: import('preact').FunctionComponent<PanelProps>
}
```

The full updated file:

```typescript
export interface ModuleManifest {
  name: string
  version: string
  displayName: string
  description: string
  icon: string
  color: string
  panels: PanelDef[]
  actions: ActionDef[]
  detectors?: DetectorDef[]
  claude?: { skills?: string[]; mcpServers?: string[] }
  settings?: { schema: Record<string, SettingDef> }
}

export interface PanelDef {
  id: string
  title: string
  component: string
  default?: boolean
}

export interface ActionDef {
  id: string
  label: string
  icon: string
  command: string
  streaming?: boolean
  tags?: string[]
  hidden?: boolean
}

export interface DetectorDef {
  tool: string
  files: string[]
  packages?: string[]
  suggestion: string
}

export interface SettingDef {
  type: 'string' | 'number' | 'boolean'
  default?: unknown
}

export interface PanelProps {
  moduleId: string
  projectId: string | null
}

export interface PanelConfig {
  id: string
  title: string
  component: import('preact').FunctionComponent<PanelProps>
}
```

- [ ] **Step 2: Create define.ts with definePanel helper**

`packages/sdk/src/define.ts`:

```typescript
import type { PanelConfig } from './types.js'

export function definePanel(config: PanelConfig): PanelConfig {
  return config
}
```

- [ ] **Step 3: Update index.ts to re-export**

`packages/sdk/src/index.ts`:

```typescript
export type * from './types.js'
export { definePanel } from './define.js'
```

- [ ] **Step 4: Build and verify**

Run: `cd packages/sdk && npx tsc`
Expected: No errors. `dist/` contains define.js and updated types.

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/
git commit -m "feat(sdk): add definePanel helper, PanelProps/PanelConfig types, hidden action flag"
```

---

## Task 2: UI — Tabs, DataList, EmptyState components

**Files:**
- Create: `packages/ui/src/Tabs.tsx`
- Create: `packages/ui/src/DataList.tsx`
- Create: `packages/ui/src/EmptyState.tsx`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Create Tabs component**

`packages/ui/src/Tabs.tsx`:

```typescript
import { type FunctionComponent } from 'preact'

interface Tab {
  id: string
  label: string
  icon?: string
}

interface TabsProps {
  tabs: Tab[]
  active: string
  onChange: (id: string) => void
}

export const Tabs: FunctionComponent<TabsProps> = ({ tabs, active, onChange }) => {
  return (
    <div class="flex border-b border-forge-border mb-6">
      {tabs.map(tab => (
        <button
          key={tab.id}
          class={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px
            ${active === tab.id
              ? 'border-forge-accent text-forge-accent'
              : 'border-transparent text-forge-muted hover:text-forge-text hover:border-forge-border'}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.icon && <span class="mr-2">{tab.icon}</span>}
          {tab.label}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Create DataList component**

`packages/ui/src/DataList.tsx`:

```typescript
import { type FunctionComponent, type ComponentChildren } from 'preact'
import { Badge } from './Badge.js'

export interface DataListItem {
  id: string
  title: string
  subtitle?: string
  badge?: { label: string; color?: string }
  trailing?: ComponentChildren
}

interface DataListProps {
  items: DataListItem[]
  loading?: boolean
  onItemClick?: (id: string) => void
}

export const DataList: FunctionComponent<DataListProps> = ({ items, loading, onItemClick }) => {
  if (loading) {
    return (
      <div class="space-y-2">
        {[1, 2, 3].map(i => (
          <div key={i} class="h-16 rounded-lg bg-forge-surface animate-pulse" />
        ))}
      </div>
    )
  }

  if (items.length === 0) return null

  return (
    <div class="space-y-1">
      {items.map(item => (
        <div
          key={item.id}
          class={`flex items-center justify-between p-3 rounded-lg bg-forge-surface border border-forge-border ${onItemClick ? 'cursor-pointer hover:border-forge-accent/40' : ''}`}
          onClick={onItemClick ? () => onItemClick(item.id) : undefined}
        >
          <div class="min-w-0 flex-1">
            <div class="font-medium text-sm truncate">{item.title}</div>
            {item.subtitle && (
              <div class="text-xs text-forge-muted mt-0.5 truncate">{item.subtitle}</div>
            )}
          </div>
          <div class="flex items-center gap-2 ml-3">
            {item.badge && (
              <Badge label={item.badge.label} color={item.badge.color} variant="outline" />
            )}
            {item.trailing}
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Create EmptyState component**

`packages/ui/src/EmptyState.tsx`:

```typescript
import { type FunctionComponent } from 'preact'
import { ActionButton } from './ActionButton.js'

interface EmptyStateProps {
  icon?: string
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
}

export const EmptyState: FunctionComponent<EmptyStateProps> = ({
  icon, title, description, action
}) => {
  return (
    <div class="flex flex-col items-center justify-center py-16 text-center">
      {icon && <span class="text-4xl mb-4 opacity-50">{icon}</span>}
      <h3 class="text-base font-medium text-forge-text mb-1">{title}</h3>
      {description && (
        <p class="text-sm text-forge-muted max-w-sm mb-4">{description}</p>
      )}
      {action && (
        <ActionButton label={action.label} variant="secondary" onClick={action.onClick} />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Update index.ts exports**

`packages/ui/src/index.ts`:

```typescript
export { StatusCard } from './StatusCard.js'
export { ActionButton } from './ActionButton.js'
export { ForgeTerminal } from './Terminal.js'
export { ToastContainer, showToast, toasts } from './Toast.js'
export { Badge } from './Badge.js'
export { Modal } from './Modal.js'
export { Tabs } from './Tabs.js'
export { DataList } from './DataList.js'
export type { DataListItem } from './DataList.js'
export { EmptyState } from './EmptyState.js'
```

- [ ] **Step 5: Build and verify**

Run: `cd packages/ui && npx tsc`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/
git commit -m "feat(ui): add Tabs, DataList, EmptyState components"
```

---

## Task 3: Core DB — Settings table + action log queries

**Files:**
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/db.ts`
- Modify: `packages/core/src/db.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to the end of `packages/core/src/db.test.ts`:

```typescript
  describe('module settings', () => {
    it('stores and retrieves settings', () => {
      db.setModuleSetting('mod-test', 'apiKey', 'abc123')
      db.setModuleSetting('mod-test', 'enabled', 'true')
      const settings = db.getModuleSettings('mod-test')
      expect(settings).toEqual({ apiKey: 'abc123', enabled: 'true' })
    })

    it('overwrites existing setting', () => {
      db.setModuleSetting('mod-test', 'port', '3000')
      db.setModuleSetting('mod-test', 'port', '8080')
      const settings = db.getModuleSettings('mod-test')
      expect(settings.port).toBe('8080')
    })

    it('returns empty object for unknown module', () => {
      const settings = db.getModuleSettings('nonexistent')
      expect(settings).toEqual({})
    })
  })

  describe('action log queries', () => {
    it('lists action logs ordered by recency', () => {
      db.addProject({ name: 'proj', path: '/tmp/proj' })
      const projects = db.listProjects()
      const pid = projects[0].id

      db.logAction({ projectId: pid, moduleId: 'mod-a', actionId: 'run', command: 'echo 1' })
      db.logAction({ projectId: pid, moduleId: 'mod-b', actionId: 'test', command: 'echo 2' })

      const logs = db.listActionLogs({})
      expect(logs).toHaveLength(2)
      expect(logs[0].moduleId).toBe('mod-b') // most recent first
    })

    it('filters by moduleId', () => {
      db.addProject({ name: 'proj2', path: '/tmp/proj2' })
      const projects = db.listProjects()
      const pid = projects[0].id

      db.logAction({ projectId: pid, moduleId: 'mod-x', actionId: 'a', command: 'echo x' })
      db.logAction({ projectId: pid, moduleId: 'mod-y', actionId: 'b', command: 'echo y' })

      const logs = db.listActionLogs({ moduleId: 'mod-x' })
      expect(logs).toHaveLength(1)
      expect(logs[0].moduleId).toBe('mod-x')
    })

    it('respects limit', () => {
      db.addProject({ name: 'proj3', path: '/tmp/proj3' })
      const projects = db.listProjects()
      const pid = projects[0].id

      for (let i = 0; i < 5; i++) {
        db.logAction({ projectId: pid, moduleId: 'mod-z', actionId: `a${i}`, command: `echo ${i}` })
      }

      const logs = db.listActionLogs({ limit: 3 })
      expect(logs).toHaveLength(3)
    })
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/core && npx vitest run src/db.test.ts`
Expected: FAIL — `db.setModuleSetting is not a function`, `db.listActionLogs is not a function`

- [ ] **Step 3: Add ModuleSettingRow to types.ts**

In `packages/core/src/types.ts`, add at the end:

```typescript
export interface ModuleSetting {
  moduleId: string
  key: string
  value: string
}
```

- [ ] **Step 4: Implement settings table and methods in db.ts**

In `packages/core/src/db.ts`, add to the `migrate()` method's SQL string, after the `action_logs` table:

```sql
      CREATE TABLE IF NOT EXISTS module_settings (
        module_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        PRIMARY KEY (module_id, key)
      );
```

Add these methods to the `ForgeDB` class:

```typescript
  getModuleSettings(moduleId: string): Record<string, string> {
    const rows = this.db.prepare(
      'SELECT key, value FROM module_settings WHERE module_id = ?'
    ).all(moduleId) as { key: string; value: string }[]
    const result: Record<string, string> = {}
    for (const row of rows) {
      result[row.key] = row.value
    }
    return result
  }

  setModuleSetting(moduleId: string, key: string, value: string): void {
    this.db.prepare(
      'INSERT INTO module_settings (module_id, key, value) VALUES (?, ?, ?) ON CONFLICT(module_id, key) DO UPDATE SET value = excluded.value'
    ).run(moduleId, key, value)
  }

  listActionLogs(opts: { moduleId?: string; limit?: number }): ActionLog[] {
    const { moduleId, limit = 50 } = opts
    let sql = 'SELECT * FROM action_logs'
    const params: unknown[] = []

    if (moduleId) {
      sql += ' WHERE module_id = ?'
      params.push(moduleId)
    }

    sql += ' ORDER BY started_at DESC LIMIT ?'
    params.push(limit)

    const rows = this.db.prepare(sql).all(...params) as RawActionLog[]
    return rows.map(r => ({
      id: r.id,
      projectId: r.project_id,
      moduleId: r.module_id,
      actionId: r.action_id,
      command: r.command,
      exitCode: r.exit_code,
      startedAt: r.started_at,
      finishedAt: r.finished_at,
    }))
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/core && npx vitest run src/db.test.ts`
Expected: ALL PASS (6 existing + 5 new = 11 tests)

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/db.ts packages/core/src/db.test.ts packages/core/src/types.ts
git commit -m "feat(core): add module_settings table + listActionLogs query"
```

---

## Task 4: Core Server — Action logs + settings endpoints

**Files:**
- Modify: `packages/core/src/server.ts`
- Modify: `packages/core/src/server.test.ts`

- [ ] **Step 1: Write failing tests for new endpoints**

Add to the end of the test suite in `packages/core/src/server.test.ts`:

```typescript
  it('GET /api/action-logs returns action logs', async () => {
    // Create a project first
    await server.fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'log-proj', path: '/tmp/log-proj' })
    })

    const res = await server.fetch('/api/action-logs')
    expect(res.status).toBe(200)
    const logs = await res.json()
    expect(Array.isArray(logs)).toBe(true)
  })

  it('GET /api/modules/:module/settings returns settings', async () => {
    const res = await server.fetch('/api/modules/mod-test/settings')
    expect(res.status).toBe(200)
    const settings = await res.json()
    expect(typeof settings).toBe('object')
  })

  it('PUT /api/modules/:module/settings stores settings', async () => {
    const putRes = await server.fetch('/api/modules/mod-test/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: 'dark', port: '8080' })
    })
    expect(putRes.status).toBe(200)

    const getRes = await server.fetch('/api/modules/mod-test/settings')
    const settings = await getRes.json()
    expect(settings).toEqual({ theme: 'dark', port: '8080' })
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/core && npx vitest run src/server.test.ts`
Expected: FAIL — 404 for new endpoints

- [ ] **Step 3: Add endpoints to server.ts**

In `packages/core/src/server.ts`, add these routes before the `const fetch = ...` line at the bottom:

```typescript
  app.get('/api/action-logs', (c) => {
    const moduleId = c.req.query('moduleId')
    const limitStr = c.req.query('limit')
    const limit = limitStr ? parseInt(limitStr, 10) : undefined
    return c.json(db.listActionLogs({ moduleId, limit }))
  })

  app.get('/api/modules/:module/settings', (c) => {
    const moduleId = c.req.param('module')
    return c.json(db.getModuleSettings(moduleId))
  })

  app.put('/api/modules/:module/settings', async (c) => {
    const moduleId = c.req.param('module')
    const body = await c.req.json<Record<string, string>>()
    for (const [key, value] of Object.entries(body)) {
      db.setModuleSetting(moduleId, key, String(value))
    }
    return c.json({ ok: true })
  })
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/core && npx vitest run src/server.test.ts`
Expected: ALL PASS (5 existing + 3 new = 8 tests)

- [ ] **Step 5: Run all core tests**

Run: `cd packages/core && npx vitest run`
Expected: ALL PASS (11 db + 8 server + 5 modules + 5 runner = 29 tests)

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/server.ts packages/core/src/server.test.ts
git commit -m "feat(core): add action-logs query + module settings API endpoints"
```

---

## Task 5: Console — Dynamic module loading + tabbed panel shell

**Files:**
- Create: `packages/console/src/pages/ModuleShell.tsx`
- Create: `packages/console/src/panels/registry.ts`
- Modify: `packages/console/src/app.tsx`
- Modify: `packages/console/vite.config.ts`
- Modify: `packages/console/package.json`

- [ ] **Step 1: Create the panel registry**

`packages/console/src/panels/registry.ts`:

```typescript
import type { PanelConfig } from '@forge-dev/sdk'

// Maps moduleId (directory name, e.g. "mod-dev") to a map of panelId -> PanelConfig
const registry = new Map<string, Map<string, PanelConfig>>()

export function registerPanels(moduleId: string, panels: PanelConfig[]): void {
  registry.set(moduleId, new Map(panels.map(p => [p.id, p])))
}

export function getPanels(moduleId: string): Map<string, PanelConfig> | undefined {
  return registry.get(moduleId)
}

export function hasPanels(moduleId: string): boolean {
  return registry.has(moduleId)
}

// Module panels will be registered here as they are created.
// Example:
// import workspaces from '@forge-dev/mod-dev/panels/Workspaces'
// registerPanels('mod-dev', [workspaces, sessions, sharedContext])
```

- [ ] **Step 2: Create ModuleShell page**

`packages/console/src/pages/ModuleShell.tsx`:

```typescript
import { type FunctionComponent } from 'preact'
import { useState } from 'preact/hooks'
import { Tabs, ActionButton, ForgeTerminal } from '@forge-dev/ui'
import { apiPost } from '../hooks/useApi.js'
import { getPanels } from '../panels/registry.js'
import type { ModuleManifest } from '@forge-dev/sdk'

interface ModuleShellProps {
  moduleId: string
  manifest: ModuleManifest
  projectId: string | null
}

export const ModuleShell: FunctionComponent<ModuleShellProps> = ({
  moduleId, manifest, projectId
}) => {
  const defaultPanel = manifest.panels.find(p => p.default)?.id ?? manifest.panels[0]?.id
  const [activeTab, setActiveTab] = useState(defaultPanel ?? '')
  const [terminalOutput, setTerminalOutput] = useState<string | null>(null)

  const registeredPanels = getPanels(moduleId)
  const panelConfig = registeredPanels?.get(activeTab)
  const PanelComponent = panelConfig?.component

  const visibleActions = manifest.actions.filter(a => !a.hidden)

  const runAction = async (actionId: string) => {
    setTerminalOutput(null)
    const result = await apiPost<{ exitCode: number; output: string }>(
      `/api/actions/${moduleId}/${actionId}`,
      { projectId }
    )
    setTerminalOutput(result.output ?? `Exit code: ${result.exitCode}`)
  }

  return (
    <div>
      {/* Module header */}
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-3">
          <div
            class="w-10 h-10 rounded-lg flex items-center justify-center text-lg"
            style={{ backgroundColor: manifest.color + '20', color: manifest.color }}
          >
            {manifest.icon}
          </div>
          <div>
            <h2 class="text-xl font-bold">{manifest.displayName}</h2>
            <p class="text-sm text-forge-muted">{manifest.description}</p>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      {visibleActions.length > 0 && (
        <div class="flex flex-wrap gap-2 mb-4">
          {visibleActions.map(action => (
            <ActionButton
              key={action.id}
              label={action.label}
              icon={action.icon}
              variant="secondary"
              onClick={() => runAction(action.id)}
            />
          ))}
        </div>
      )}

      {/* Panel tabs */}
      {manifest.panels.length > 1 && (
        <Tabs
          tabs={manifest.panels.map(p => ({ id: p.id, label: p.title }))}
          active={activeTab}
          onChange={setActiveTab}
        />
      )}

      {/* Panel content */}
      {PanelComponent ? (
        <PanelComponent moduleId={moduleId} projectId={projectId} />
      ) : (
        <div class="text-forge-muted text-sm py-8 text-center">
          Panel "{activeTab}" not yet implemented
        </div>
      )}

      {/* Terminal output from quick actions */}
      {terminalOutput && (
        <div class="mt-6">
          <ForgeTerminal content={terminalOutput} height={300} />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Update app.tsx with dynamic module loading**

Replace `packages/console/src/app.tsx`:

```typescript
import { render } from 'preact'
import { useEffect } from 'preact/hooks'
import { signal } from '@preact/signals'
import { Shell, currentModule } from './shell.js'
import { Home } from './pages/Home.js'
import { ModuleShell } from './pages/ModuleShell.js'
import { hasPanels } from './panels/registry.js'
import { useApi } from './hooks/useApi.js'
import type { ModuleManifest } from '@forge-dev/sdk'
import './styles/theme.css'
import 'virtual:uno.css'

// Import panel registrations (added as modules are built)
import './panels/registry.js'

export const currentProject = signal<string | null>(null)

function App() {
  const modules = useApi<ModuleManifest[]>('/api/modules/available')

  const sidebarModules = [
    { id: 'home', name: 'Home', icon: 'home', color: '#6366f1' },
    ...(modules.data.value ?? []).map(m => {
      const dirName = m.name.replace('@forge-dev/', '')
      return { id: dirName, name: m.displayName, icon: m.icon, color: m.color }
    })
  ]

  const activeModuleId = currentModule.value
  const activeManifest = (modules.data.value ?? []).find(
    m => m.name.replace('@forge-dev/', '') === activeModuleId
  )

  return (
    <Shell modules={sidebarModules}>
      {activeModuleId === null || activeModuleId === 'home' ? (
        <Home />
      ) : activeManifest ? (
        <ModuleShell
          moduleId={activeModuleId}
          manifest={activeManifest}
          projectId={currentProject.value}
        />
      ) : (
        <div class="text-forge-muted py-8 text-center">Loading module...</div>
      )}
    </Shell>
  )
}

render(<App />, document.getElementById('app')!)
```

- [ ] **Step 4: Update vite.config.ts to dedupe preact**

`packages/console/vite.config.ts`:

```typescript
import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import UnoCSS from 'unocss/vite'

export default defineConfig({
  plugins: [preact(), UnoCSS()],
  resolve: {
    dedupe: ['preact', '@preact/signals']
  },
  build: {
    outDir: 'dist',
    emptyDirOnBuild: true
  }
})
```

- [ ] **Step 5: Build and verify**

Run: `npx turbo build --filter=@forge-dev/console`
Expected: Build succeeds. Console bundles with dynamic module loading.

- [ ] **Step 6: Commit**

```bash
git add packages/console/
git commit -m "feat(console): dynamic module loading with tabbed panel shell"
```

---

## Task 6: mod-dev — Package scaffold + manifest + Workspaces panel

**Files:**
- Create: `modules/mod-dev/package.json`
- Create: `modules/mod-dev/tsconfig.json`
- Create: `modules/mod-dev/forge-module.json`
- Create: `modules/mod-dev/panels/index.ts`
- Create: `modules/mod-dev/panels/Workspaces.tsx`
- Modify: `packages/console/src/panels/registry.ts`
- Modify: `packages/console/package.json`

- [ ] **Step 1: Create package.json**

`modules/mod-dev/package.json`:

```json
{
  "name": "@forge-dev/mod-dev",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "description": "CW wrapper — worktrees, sessions, shared context",
  "exports": {
    "./panels": "./panels/index.ts"
  },
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

- [ ] **Step 2: Create tsconfig.json**

`modules/mod-dev/tsconfig.json`:

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

- [ ] **Step 3: Create forge-module.json manifest**

`modules/mod-dev/forge-module.json`:

```json
{
  "name": "@forge-dev/mod-dev",
  "version": "0.1.0",
  "displayName": "Dev Sessions",
  "description": "Manage git worktrees, Claude sessions, and shared project context",
  "icon": "terminal",
  "color": "#8b5cf6",
  "panels": [
    {
      "id": "workspaces",
      "title": "Workspaces",
      "component": "./panels/Workspaces",
      "default": true
    },
    {
      "id": "sessions",
      "title": "Sessions",
      "component": "./panels/Sessions"
    },
    {
      "id": "shared-context",
      "title": "Shared Context",
      "component": "./panels/SharedContext"
    }
  ],
  "actions": [
    {
      "id": "list-worktrees",
      "label": "List Worktrees",
      "icon": "git-branch",
      "command": "git worktree list --porcelain",
      "hidden": true
    },
    {
      "id": "read-context",
      "label": "Read Context",
      "icon": "file-text",
      "command": "cat CLAUDE.md 2>/dev/null || echo '(No CLAUDE.md found in this directory)'",
      "hidden": true
    },
    {
      "id": "start-task",
      "label": "Start Task",
      "icon": "play",
      "command": "echo 'Usage: provide a task name via the dashboard'",
      "streaming": true,
      "tags": ["dev", "task"]
    },
    {
      "id": "open-project",
      "label": "Open in Editor",
      "icon": "external-link",
      "command": "code . || open .",
      "tags": ["dev", "project"]
    },
    {
      "id": "git-status",
      "label": "Git Status",
      "icon": "git-commit",
      "command": "git status --short && echo '---' && git log --oneline -5",
      "streaming": false,
      "tags": ["dev", "git"]
    }
  ],
  "detectors": [
    {
      "tool": "git-worktrees",
      "files": [".git"],
      "suggestion": "Git repository detected. Use Workspaces panel to manage worktrees."
    },
    {
      "tool": "claude-config",
      "files": ["CLAUDE.md", ".claude"],
      "suggestion": "Claude configuration found. View in Shared Context panel."
    }
  ]
}
```

- [ ] **Step 4: Create Workspaces panel**

`modules/mod-dev/panels/Workspaces.tsx`:

```typescript
import { type FunctionComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { DataList, EmptyState, ActionButton, type DataListItem } from '@forge-dev/ui'

interface WorktreeInfo {
  path: string
  head: string
  branch: string
  bare: boolean
}

function parseWorktreeOutput(output: string): WorktreeInfo[] {
  const worktrees: WorktreeInfo[] = []
  const blocks = output.trim().split('\n\n')

  for (const block of blocks) {
    if (!block.trim()) continue
    const lines = block.trim().split('\n')
    const wt: Partial<WorktreeInfo> = { bare: false }

    for (const line of lines) {
      if (line.startsWith('worktree ')) wt.path = line.slice(9)
      else if (line.startsWith('HEAD ')) wt.head = line.slice(5)
      else if (line.startsWith('branch ')) wt.branch = line.slice(7).replace('refs/heads/', '')
      else if (line === 'bare') wt.bare = true
    }

    if (wt.path) {
      worktrees.push({
        path: wt.path,
        head: wt.head ?? 'unknown',
        branch: wt.branch ?? '(detached)',
        bare: wt.bare ?? false
      })
    }
  }

  return worktrees
}

function WorkspacesPanel({ moduleId, projectId }: PanelProps) {
  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchWorktrees = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/actions/${moduleId}/list-worktrees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId })
      })
      const result = await res.json() as { output: string; exitCode: number }
      if (result.exitCode === 0) {
        setWorktrees(parseWorktreeOutput(result.output))
      } else {
        setError('Not a git repository or git not available')
      }
    } catch {
      setError('Failed to fetch worktree data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchWorktrees() }, [moduleId, projectId])

  if (error) {
    return (
      <EmptyState
        icon="git-branch"
        title="No Git Repository"
        description={error}
      />
    )
  }

  const items: DataListItem[] = worktrees.map((wt, i) => ({
    id: wt.path,
    title: wt.branch,
    subtitle: wt.path,
    badge: i === 0
      ? { label: 'main', color: 'var(--forge-success)' }
      : { label: 'worktree', color: 'var(--forge-accent)' }
  }))

  return (
    <div>
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-medium text-forge-muted">
          {worktrees.length} worktree{worktrees.length !== 1 ? 's' : ''}
        </h3>
        <ActionButton label="Refresh" variant="secondary" onClick={fetchWorktrees} />
      </div>
      <DataList items={items} loading={loading} />
    </div>
  )
}

export default definePanel({
  id: 'workspaces',
  title: 'Workspaces',
  component: WorkspacesPanel
})
```

- [ ] **Step 5: Create panels/index.ts**

`modules/mod-dev/panels/index.ts`:

```typescript
export { default as workspaces } from './Workspaces.js'
export { default as sessions } from './Sessions.js'
export { default as sharedContext } from './SharedContext.js'
```

Note: Sessions.tsx and SharedContext.tsx will be created in Task 7. This file is complete — it references all panels that will exist.

- [ ] **Step 6: Add mod-dev to console dependencies + register panels**

In `packages/console/package.json`, add to `dependencies`:

```json
    "@forge-dev/mod-dev": "*"
```

Update `packages/console/src/panels/registry.ts` — add panel registrations:

```typescript
import type { PanelConfig } from '@forge-dev/sdk'

const registry = new Map<string, Map<string, PanelConfig>>()

export function registerPanels(moduleId: string, panels: PanelConfig[]): void {
  registry.set(moduleId, new Map(panels.map(p => [p.id, p])))
}

export function getPanels(moduleId: string): Map<string, PanelConfig> | undefined {
  return registry.get(moduleId)
}

export function hasPanels(moduleId: string): boolean {
  return registry.has(moduleId)
}

// --- Module registrations ---
import { workspaces } from '@forge-dev/mod-dev/panels'
registerPanels('mod-dev', [workspaces])
// Sessions and SharedContext will be added in Task 7
```

- [ ] **Step 7: Install dependencies**

Run: `cd /Users/joselito/Workspace/personal/forge/.tasks/initial && npm install`
Expected: Workspace links created for mod-dev.

- [ ] **Step 8: Commit**

```bash
git add modules/mod-dev/ packages/console/
git commit -m "feat(mod-dev): scaffold module with Workspaces panel — git worktree integration"
```

---

## Task 7: mod-dev — Sessions + SharedContext panels

**Files:**
- Create: `modules/mod-dev/panels/Sessions.tsx`
- Create: `modules/mod-dev/panels/SharedContext.tsx`
- Modify: `packages/console/src/panels/registry.ts`

- [ ] **Step 1: Create Sessions panel**

`modules/mod-dev/panels/Sessions.tsx`:

```typescript
import { type FunctionComponent } from 'preact'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { EmptyState } from '@forge-dev/ui'

function SessionsPanel(_props: PanelProps) {
  return (
    <EmptyState
      icon="terminal"
      title="Claude Sessions"
      description="Connect CW (Claude Worktrees) to view active Claude Code sessions, token usage, and session history. Install CW and configure it in module settings."
      action={{
        label: 'Learn about CW',
        onClick: () => { window.open('https://github.com/anthropics/claude-code', '_blank') }
      }}
    />
  )
}

export default definePanel({
  id: 'sessions',
  title: 'Sessions',
  component: SessionsPanel
})
```

- [ ] **Step 2: Create SharedContext panel**

`modules/mod-dev/panels/SharedContext.tsx`:

```typescript
import { type FunctionComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { EmptyState, ActionButton } from '@forge-dev/ui'

function SharedContextPanel({ moduleId, projectId }: PanelProps) {
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchContext = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/actions/${moduleId}/read-context`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId })
      })
      const result = await res.json() as { output: string; exitCode: number }
      setContent(result.output)
    } catch {
      setContent(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchContext() }, [moduleId, projectId])

  if (loading) {
    return <div class="animate-pulse h-40 bg-forge-surface rounded-lg" />
  }

  if (!content || content.includes('No CLAUDE.md found')) {
    return (
      <EmptyState
        icon="file-text"
        title="No Shared Context"
        description="No CLAUDE.md file found in the current project directory. Create one to share context between Claude sessions."
      />
    )
  }

  return (
    <div>
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-medium text-forge-muted">CLAUDE.md</h3>
        <ActionButton label="Refresh" variant="secondary" onClick={fetchContext} />
      </div>
      <pre class="p-4 rounded-lg bg-forge-surface border border-forge-border text-sm font-mono overflow-auto max-h-96 whitespace-pre-wrap">
        {content}
      </pre>
    </div>
  )
}

export default definePanel({
  id: 'shared-context',
  title: 'Shared Context',
  component: SharedContextPanel
})
```

- [ ] **Step 3: Update console panel registry**

Update `packages/console/src/panels/registry.ts` — replace the mod-dev registration:

```typescript
// --- Module registrations ---
import { workspaces, sessions, sharedContext } from '@forge-dev/mod-dev/panels'
registerPanels('mod-dev', [workspaces, sessions, sharedContext])
```

- [ ] **Step 4: Build and verify**

Run: `npx turbo build`
Expected: All packages build. Console bundles with mod-dev panels.

- [ ] **Step 5: Commit**

```bash
git add modules/mod-dev/panels/ packages/console/src/panels/registry.ts
git commit -m "feat(mod-dev): add Sessions (placeholder) + SharedContext panel"
```

---

## Task 8: mod-dev — Integration test

**Files:**
- Create: `tests/integration/mod-dev.test.ts`

- [ ] **Step 1: Write the integration test**

`tests/integration/mod-dev.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createForgeServer } from '@forge-dev/core'
import { mkdirSync, writeFileSync, rmSync, readFileSync, cpSync } from 'node:fs'
import { join } from 'node:path'

const TEST_DIR = join(import.meta.dirname, '../.test-mod-dev')
const MODULES_DIR = join(TEST_DIR, 'modules')

describe('mod-dev integration', () => {
  let server: ReturnType<typeof createForgeServer>

  beforeAll(() => {
    mkdirSync(MODULES_DIR, { recursive: true })

    // Copy mod-dev manifest to test modules dir
    const modDevSrc = join(import.meta.dirname, '../../modules/mod-dev')
    const modDevDest = join(MODULES_DIR, 'mod-dev')
    mkdirSync(modDevDest, { recursive: true })
    cpSync(
      join(modDevSrc, 'forge-module.json'),
      join(modDevDest, 'forge-module.json')
    )

    server = createForgeServer({ dataDir: TEST_DIR })
  })

  afterAll(() => {
    server.close()
    rmSync(TEST_DIR, { recursive: true, force: true })
  })

  it('discovers mod-dev module', async () => {
    const res = await server.fetch('/api/modules/available')
    expect(res.status).toBe(200)
    const modules = await res.json() as { name: string; displayName: string }[]
    const modDev = modules.find(m => m.name === '@forge-dev/mod-dev')
    expect(modDev).toBeDefined()
    expect(modDev!.displayName).toBe('Dev Sessions')
  })

  it('has correct panels in manifest', async () => {
    const res = await server.fetch('/api/modules/available')
    const modules = await res.json() as { name: string; panels: { id: string }[] }[]
    const modDev = modules.find(m => m.name === '@forge-dev/mod-dev')!
    const panelIds = modDev.panels.map(p => p.id)
    expect(panelIds).toContain('workspaces')
    expect(panelIds).toContain('sessions')
    expect(panelIds).toContain('shared-context')
  })

  it('runs list-worktrees action (hidden)', async () => {
    const res = await server.fetch('/api/actions/mod-dev/list-worktrees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: null })
    })
    expect(res.status).toBe(200)
    const result = await res.json() as { exitCode: number; output: string }
    // We're in a git repo, so this should succeed
    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('worktree')
  })

  it('runs git-status action', async () => {
    const res = await server.fetch('/api/actions/mod-dev/git-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: null })
    })
    expect(res.status).toBe(200)
    const result = await res.json() as { exitCode: number }
    expect(result.exitCode).toBe(0)
  })
})
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run tests/integration/mod-dev.test.ts`
Expected: ALL PASS (4 tests)

- [ ] **Step 3: Commit**

```bash
git add tests/integration/mod-dev.test.ts
git commit -m "test(mod-dev): integration test — discovery, panels, actions"
```

---

## Task 9: mod-monitor — Package scaffold + manifest + Health panel

**Files:**
- Create: `modules/mod-monitor/package.json`
- Create: `modules/mod-monitor/tsconfig.json`
- Create: `modules/mod-monitor/forge-module.json`
- Create: `modules/mod-monitor/panels/index.ts`
- Create: `modules/mod-monitor/panels/Health.tsx`
- Modify: `packages/console/package.json`
- Modify: `packages/console/src/panels/registry.ts`

- [ ] **Step 1: Create package.json**

`modules/mod-monitor/package.json`:

```json
{
  "name": "@forge-dev/mod-monitor",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "description": "Health checks, activity feed, cost tracking",
  "exports": {
    "./panels": "./panels/index.ts"
  },
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

- [ ] **Step 2: Create tsconfig.json**

`modules/mod-monitor/tsconfig.json`:

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

- [ ] **Step 3: Create forge-module.json**

`modules/mod-monitor/forge-module.json`:

```json
{
  "name": "@forge-dev/mod-monitor",
  "version": "0.1.0",
  "displayName": "Monitor",
  "description": "System health, activity feed, and cost tracking",
  "icon": "activity",
  "color": "#10b981",
  "panels": [
    {
      "id": "health",
      "title": "Health",
      "component": "./panels/Health",
      "default": true
    },
    {
      "id": "activity",
      "title": "Activity",
      "component": "./panels/Activity"
    },
    {
      "id": "costs",
      "title": "Costs",
      "component": "./panels/Costs"
    }
  ],
  "actions": [
    {
      "id": "check-health",
      "label": "Check Health",
      "icon": "heart-pulse",
      "command": "curl -s -o /dev/null -w '%{http_code} %{time_total}s' http://localhost:3000/api/health",
      "tags": ["monitor", "health"]
    },
    {
      "id": "view-logs",
      "label": "View Logs",
      "icon": "scroll-text",
      "command": "tail -50 ~/.forge/logs/forge.log 2>/dev/null || echo '(No log file found)'",
      "streaming": true,
      "tags": ["monitor", "logs"]
    }
  ],
  "detectors": [
    {
      "tool": "sentry",
      "files": [".sentryrc", "sentry.properties"],
      "packages": ["@sentry/node"],
      "suggestion": "Sentry detected. Enable error tracking in Monitor module."
    }
  ]
}
```

- [ ] **Step 4: Create Health panel**

`modules/mod-monitor/panels/Health.tsx`:

```typescript
import { type FunctionComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { StatusCard, ActionButton, EmptyState } from '@forge-dev/ui'

interface HealthCheck {
  name: string
  url: string
  status: 'up' | 'down' | 'slow' | 'unchecked'
  responseTime: number | null
  statusCode: number | null
}

function HealthPanel({ moduleId }: PanelProps) {
  const [checks, setChecks] = useState<HealthCheck[]>([])
  const [loading, setLoading] = useState(true)

  const defaultEndpoints = [
    { name: 'Forge API', url: '/api/health' }
  ]

  const runChecks = async () => {
    setLoading(true)
    const results: HealthCheck[] = []

    for (const endpoint of defaultEndpoints) {
      const start = Date.now()
      try {
        const res = await fetch(endpoint.url)
        const elapsed = Date.now() - start
        results.push({
          name: endpoint.name,
          url: endpoint.url,
          status: res.ok ? (elapsed > 2000 ? 'slow' : 'up') : 'down',
          responseTime: elapsed,
          statusCode: res.status
        })
      } catch {
        results.push({
          name: endpoint.name,
          url: endpoint.url,
          status: 'down',
          responseTime: null,
          statusCode: null
        })
      }
    }

    setChecks(results)
    setLoading(false)
  }

  useEffect(() => { runChecks() }, [])

  const statusToCardStatus = (s: HealthCheck['status']): 'good' | 'warn' | 'bad' | 'neutral' => {
    switch (s) {
      case 'up': return 'good'
      case 'slow': return 'warn'
      case 'down': return 'bad'
      default: return 'neutral'
    }
  }

  return (
    <div>
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-medium text-forge-muted">Service Health</h3>
        <ActionButton label="Refresh" variant="secondary" onClick={runChecks} />
      </div>

      {loading ? (
        <div class="grid grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} class="h-24 rounded-lg bg-forge-surface animate-pulse" />
          ))}
        </div>
      ) : checks.length === 0 ? (
        <EmptyState
          icon="heart-pulse"
          title="No Endpoints Configured"
          description="Add health check endpoints in module settings to monitor service availability."
        />
      ) : (
        <div class="grid grid-cols-3 gap-4">
          {checks.map(check => (
            <StatusCard
              key={check.name}
              icon="heart-pulse"
              label={check.name}
              value={check.status === 'up' ? 'Online' : check.status === 'slow' ? 'Slow' : 'Offline'}
              trend={check.responseTime !== null ? `${check.responseTime}ms` : undefined}
              status={statusToCardStatus(check.status)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default definePanel({
  id: 'health',
  title: 'Health',
  component: HealthPanel
})
```

- [ ] **Step 5: Create panels/index.ts**

`modules/mod-monitor/panels/index.ts`:

```typescript
export { default as health } from './Health.js'
export { default as activity } from './Activity.js'
export { default as costs } from './Costs.js'
```

- [ ] **Step 6: Add mod-monitor to console + register panels**

In `packages/console/package.json`, add to `dependencies`:

```json
    "@forge-dev/mod-monitor": "*"
```

Append to `packages/console/src/panels/registry.ts`:

```typescript
import { health } from '@forge-dev/mod-monitor/panels'
registerPanels('mod-monitor', [health])
// Activity and Costs will be added in Task 10
```

- [ ] **Step 7: Run npm install**

Run: `npm install`

- [ ] **Step 8: Commit**

```bash
git add modules/mod-monitor/ packages/console/
git commit -m "feat(mod-monitor): scaffold module with Health panel — endpoint monitoring"
```

---

## Task 10: mod-monitor — Activity + Costs panels

**Files:**
- Create: `modules/mod-monitor/panels/Activity.tsx`
- Create: `modules/mod-monitor/panels/Costs.tsx`
- Modify: `packages/console/src/panels/registry.ts`

- [ ] **Step 1: Create Activity panel**

`modules/mod-monitor/panels/Activity.tsx`:

```typescript
import { type FunctionComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { DataList, EmptyState, ActionButton, Badge, type DataListItem } from '@forge-dev/ui'

interface ActionLogEntry {
  id: string
  moduleId: string
  actionId: string
  command: string
  exitCode: number | null
  startedAt: string
  finishedAt: string | null
}

function ActivityPanel(_props: PanelProps) {
  const [logs, setLogs] = useState<ActionLogEntry[]>([])
  const [loading, setLoading] = useState(true)

  const fetchLogs = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/action-logs?limit=50')
      setLogs(await res.json() as ActionLogEntry[])
    } catch {
      setLogs([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchLogs() }, [])

  if (!loading && logs.length === 0) {
    return (
      <EmptyState
        icon="activity"
        title="No Activity Yet"
        description="Run some actions from any module to see activity here."
      />
    )
  }

  const items: DataListItem[] = logs.map(log => {
    const isRunning = log.exitCode === null
    const isSuccess = log.exitCode === 0
    const badgeColor = isRunning
      ? 'var(--forge-accent)'
      : isSuccess
        ? 'var(--forge-success)'
        : 'var(--forge-error)'
    const badgeLabel = isRunning ? 'running' : isSuccess ? 'ok' : `exit ${log.exitCode}`

    return {
      id: log.id,
      title: `${log.moduleId} / ${log.actionId}`,
      subtitle: log.startedAt,
      badge: { label: badgeLabel, color: badgeColor }
    }
  })

  return (
    <div>
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-medium text-forge-muted">
          {logs.length} action{logs.length !== 1 ? 's' : ''}
        </h3>
        <ActionButton label="Refresh" variant="secondary" onClick={fetchLogs} />
      </div>
      <DataList items={items} loading={loading} />
    </div>
  )
}

export default definePanel({
  id: 'activity',
  title: 'Activity',
  component: ActivityPanel
})
```

- [ ] **Step 2: Create Costs panel**

`modules/mod-monitor/panels/Costs.tsx`:

```typescript
import { type FunctionComponent } from 'preact'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { EmptyState } from '@forge-dev/ui'

function CostsPanel(_props: PanelProps) {
  return (
    <EmptyState
      icon="dollar-sign"
      title="Cost Tracking"
      description="Connect CW stats or a cloud billing API to track AI and infrastructure costs. Configure API keys in module settings."
    />
  )
}

export default definePanel({
  id: 'costs',
  title: 'Costs',
  component: CostsPanel
})
```

- [ ] **Step 3: Update console registry**

In `packages/console/src/panels/registry.ts`, update mod-monitor registration:

```typescript
import { health, activity, costs } from '@forge-dev/mod-monitor/panels'
registerPanels('mod-monitor', [health, activity, costs])
```

- [ ] **Step 4: Build and verify**

Run: `npx turbo build`
Expected: All packages build successfully.

- [ ] **Step 5: Commit**

```bash
git add modules/mod-monitor/panels/ packages/console/src/panels/registry.ts
git commit -m "feat(mod-monitor): add Activity feed (action logs) + Costs placeholder panel"
```

---

## Task 11: mod-monitor — Integration test

**Files:**
- Create: `tests/integration/mod-monitor.test.ts`

- [ ] **Step 1: Write the integration test**

`tests/integration/mod-monitor.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createForgeServer } from '@forge-dev/core'
import { mkdirSync, rmSync, cpSync } from 'node:fs'
import { join } from 'node:path'

const TEST_DIR = join(import.meta.dirname, '../.test-mod-monitor')
const MODULES_DIR = join(TEST_DIR, 'modules')

describe('mod-monitor integration', () => {
  let server: ReturnType<typeof createForgeServer>

  beforeAll(() => {
    mkdirSync(MODULES_DIR, { recursive: true })

    const modSrc = join(import.meta.dirname, '../../modules/mod-monitor')
    const modDest = join(MODULES_DIR, 'mod-monitor')
    mkdirSync(modDest, { recursive: true })
    cpSync(join(modSrc, 'forge-module.json'), join(modDest, 'forge-module.json'))

    server = createForgeServer({ dataDir: TEST_DIR })
  })

  afterAll(() => {
    server.close()
    rmSync(TEST_DIR, { recursive: true, force: true })
  })

  it('discovers mod-monitor module', async () => {
    const res = await server.fetch('/api/modules/available')
    const modules = await res.json() as { name: string }[]
    expect(modules.find(m => m.name === '@forge-dev/mod-monitor')).toBeDefined()
  })

  it('has health, activity, costs panels', async () => {
    const res = await server.fetch('/api/modules/available')
    const modules = await res.json() as { name: string; panels: { id: string }[] }[]
    const mod = modules.find(m => m.name === '@forge-dev/mod-monitor')!
    expect(mod.panels.map(p => p.id)).toEqual(['health', 'activity', 'costs'])
  })

  it('action-logs endpoint works', async () => {
    const res = await server.fetch('/api/action-logs')
    expect(res.status).toBe(200)
    const logs = await res.json()
    expect(Array.isArray(logs)).toBe(true)
  })

  it('runs check-health action', async () => {
    const res = await server.fetch('/api/actions/mod-monitor/check-health', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: null })
    })
    expect(res.status).toBe(200)
    const result = await res.json() as { exitCode: number }
    // curl may not be available or endpoint may not be running, but the action should execute
    expect(typeof result.exitCode).toBe('number')
  })
})
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run tests/integration/mod-monitor.test.ts`
Expected: ALL PASS (4 tests)

- [ ] **Step 3: Commit**

```bash
git add tests/integration/mod-monitor.test.ts
git commit -m "test(mod-monitor): integration test — discovery, panels, action-logs API"
```

---

## Task 12: mod-scaffold — Package scaffold + manifest + Templates panel

**Files:**
- Create: `modules/mod-scaffold/package.json`
- Create: `modules/mod-scaffold/tsconfig.json`
- Create: `modules/mod-scaffold/forge-module.json`
- Create: `modules/mod-scaffold/panels/index.ts`
- Create: `modules/mod-scaffold/panels/Templates.tsx`
- Modify: `packages/console/package.json`
- Modify: `packages/console/src/panels/registry.ts`

- [ ] **Step 1: Create package.json**

`modules/mod-scaffold/package.json`:

```json
{
  "name": "@forge-dev/mod-scaffold",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "description": "Project creation wizard with templates and integrations",
  "exports": {
    "./panels": "./panels/index.ts"
  },
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

- [ ] **Step 2: Create tsconfig.json**

`modules/mod-scaffold/tsconfig.json`:

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

- [ ] **Step 3: Create forge-module.json**

`modules/mod-scaffold/forge-module.json`:

```json
{
  "name": "@forge-dev/mod-scaffold",
  "version": "0.1.0",
  "displayName": "Scaffold",
  "description": "Create new projects from templates with one click",
  "icon": "hammer",
  "color": "#f59e0b",
  "panels": [
    {
      "id": "templates",
      "title": "Templates",
      "component": "./panels/Templates",
      "default": true
    },
    {
      "id": "wizard",
      "title": "New Project",
      "component": "./panels/Wizard"
    },
    {
      "id": "recent",
      "title": "Recent",
      "component": "./panels/Recent"
    }
  ],
  "actions": [
    {
      "id": "detect-stack",
      "label": "Detect Stack",
      "icon": "search",
      "command": "node -e \"const p=require('./package.json');console.log(JSON.stringify({name:p.name,deps:Object.keys(p.dependencies||{})}))\" 2>/dev/null || echo '{}'",
      "tags": ["scaffold", "detect"]
    },
    {
      "id": "init-git",
      "label": "Init Git",
      "icon": "git-branch",
      "command": "git init && git add -A && git commit -m 'chore: initial commit'",
      "streaming": true,
      "tags": ["scaffold", "git"]
    },
    {
      "id": "create-vite",
      "label": "Create Vite Project",
      "icon": "zap",
      "command": "npm create vite@latest",
      "streaming": true,
      "hidden": true,
      "tags": ["scaffold", "template"]
    }
  ],
  "detectors": [
    {
      "tool": "vite",
      "files": ["vite.config.ts", "vite.config.js"],
      "packages": ["vite"],
      "suggestion": "Vite project detected. Manage with Scaffold module."
    },
    {
      "tool": "npm-workspaces",
      "files": ["packages"],
      "suggestion": "Monorepo detected. Use Scaffold to add new packages."
    }
  ]
}
```

- [ ] **Step 4: Create Templates panel**

`modules/mod-scaffold/panels/Templates.tsx`:

```typescript
import { type FunctionComponent } from 'preact'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { DataList, type DataListItem, ActionButton } from '@forge-dev/ui'

interface Template {
  id: string
  name: string
  description: string
  command: string
  category: string
}

const TEMPLATES: Template[] = [
  {
    id: 'vite-react',
    name: 'Vite + React',
    description: 'Fast React SPA with Vite bundler',
    command: 'npm create vite@latest -- --template react-ts',
    category: 'Frontend'
  },
  {
    id: 'vite-preact',
    name: 'Vite + Preact',
    description: 'Lightweight Preact SPA with Vite',
    command: 'npm create vite@latest -- --template preact-ts',
    category: 'Frontend'
  },
  {
    id: 'nextjs',
    name: 'Next.js',
    description: 'Full-stack React framework',
    command: 'npx create-next-app@latest --ts --app --tailwind',
    category: 'Full-stack'
  },
  {
    id: 'hono',
    name: 'Hono API',
    description: 'Fast edge-ready API server',
    command: 'npm create hono@latest',
    category: 'Backend'
  },
  {
    id: 'astro',
    name: 'Astro',
    description: 'Content-focused static site framework',
    command: 'npm create astro@latest',
    category: 'Frontend'
  },
  {
    id: 'express',
    name: 'Express API',
    description: 'Classic Node.js HTTP server',
    command: 'npx express-generator --no-view',
    category: 'Backend'
  }
]

function TemplatesPanel(_props: PanelProps) {
  const items: DataListItem[] = TEMPLATES.map(t => ({
    id: t.id,
    title: t.name,
    subtitle: t.description,
    badge: { label: t.category, color: t.category === 'Frontend' ? 'var(--forge-accent)' : t.category === 'Backend' ? 'var(--forge-success)' : 'var(--forge-warning)' },
    trailing: (
      <ActionButton
        label="Use"
        variant="secondary"
        onClick={() => {
          navigator.clipboard.writeText(t.command)
        }}
      />
    )
  }))

  return (
    <div>
      <div class="mb-4">
        <h3 class="text-sm font-medium text-forge-muted">
          {TEMPLATES.length} templates available
        </h3>
      </div>
      <DataList items={items} />
    </div>
  )
}

export default definePanel({
  id: 'templates',
  title: 'Templates',
  component: TemplatesPanel
})
```

- [ ] **Step 5: Create panels/index.ts**

`modules/mod-scaffold/panels/index.ts`:

```typescript
export { default as templates } from './Templates.js'
export { default as wizard } from './Wizard.js'
export { default as recent } from './Recent.js'
```

- [ ] **Step 6: Add mod-scaffold to console + register panels**

In `packages/console/package.json`, add to `dependencies`:

```json
    "@forge-dev/mod-scaffold": "*"
```

Append to `packages/console/src/panels/registry.ts`:

```typescript
import { templates } from '@forge-dev/mod-scaffold/panels'
registerPanels('mod-scaffold', [templates])
// Wizard and Recent will be added in Task 13
```

- [ ] **Step 7: Run npm install**

Run: `npm install`

- [ ] **Step 8: Commit**

```bash
git add modules/mod-scaffold/ packages/console/
git commit -m "feat(mod-scaffold): scaffold module with Templates panel — project template gallery"
```

---

## Task 13: mod-scaffold — Wizard + Recent panels

**Files:**
- Create: `modules/mod-scaffold/panels/Wizard.tsx`
- Create: `modules/mod-scaffold/panels/Recent.tsx`
- Modify: `packages/console/src/panels/registry.ts`

- [ ] **Step 1: Create Wizard panel**

`modules/mod-scaffold/panels/Wizard.tsx`:

```typescript
import { type FunctionComponent } from 'preact'
import { useState } from 'preact/hooks'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { ActionButton } from '@forge-dev/ui'

type WizardStep = 'name' | 'template' | 'options' | 'creating' | 'done'

const STEP_LABELS: Record<WizardStep, string> = {
  name: 'Project Name',
  template: 'Template',
  options: 'Options',
  creating: 'Creating...',
  done: 'Done'
}

const TEMPLATES = [
  { id: 'vite-react', name: 'Vite + React' },
  { id: 'vite-preact', name: 'Vite + Preact' },
  { id: 'nextjs', name: 'Next.js' },
  { id: 'hono', name: 'Hono API' },
  { id: 'astro', name: 'Astro' },
  { id: 'express', name: 'Express API' },
]

function WizardPanel(_props: PanelProps) {
  const [step, setStep] = useState<WizardStep>('name')
  const [projectName, setProjectName] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [initGit, setInitGit] = useState(true)
  const [output, setOutput] = useState<string | null>(null)

  const steps: WizardStep[] = ['name', 'template', 'options']
  const currentIndex = steps.indexOf(step)

  const handleCreate = async () => {
    setStep('creating')
    // In a real implementation this would POST to the server
    setOutput(`Would create project "${projectName}" using template "${selectedTemplate}"${initGit ? ' with git init' : ''}`)
    setStep('done')
  }

  return (
    <div class="max-w-lg">
      {/* Progress indicator */}
      <div class="flex items-center gap-2 mb-8">
        {steps.map((s, i) => (
          <div key={s} class="flex items-center gap-2">
            <div class={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium
              ${i < currentIndex ? 'bg-forge-success text-white'
                : i === currentIndex ? 'bg-forge-accent text-white'
                : 'bg-forge-surface border border-forge-border text-forge-muted'}`}>
              {i < currentIndex ? '\u2713' : i + 1}
            </div>
            <span class={`text-xs ${i === currentIndex ? 'text-forge-text font-medium' : 'text-forge-muted'}`}>
              {STEP_LABELS[s]}
            </span>
            {i < steps.length - 1 && (
              <div class={`w-8 h-px ${i < currentIndex ? 'bg-forge-success' : 'bg-forge-border'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      {step === 'name' && (
        <div>
          <label class="block text-sm font-medium mb-2">Project Name</label>
          <input
            type="text"
            value={projectName}
            onInput={(e) => setProjectName((e.target as HTMLInputElement).value)}
            placeholder="my-awesome-project"
            class="w-full px-3 py-2 rounded-lg bg-forge-surface border border-forge-border text-forge-text text-sm focus:border-forge-accent focus:outline-none"
          />
          <div class="mt-4">
            <ActionButton
              label="Next"
              variant="primary"
              disabled={!projectName.trim()}
              onClick={() => setStep('template')}
            />
          </div>
        </div>
      )}

      {step === 'template' && (
        <div>
          <label class="block text-sm font-medium mb-2">Choose Template</label>
          <div class="space-y-2">
            {TEMPLATES.map(t => (
              <button
                key={t.id}
                class={`w-full text-left px-4 py-3 rounded-lg border text-sm transition-colors
                  ${selectedTemplate === t.id
                    ? 'border-forge-accent bg-forge-accent/10 text-forge-accent'
                    : 'border-forge-border bg-forge-surface text-forge-text hover:border-forge-accent/40'}`}
                onClick={() => setSelectedTemplate(t.id)}
              >
                {t.name}
              </button>
            ))}
          </div>
          <div class="flex gap-2 mt-4">
            <ActionButton label="Back" variant="secondary" onClick={() => setStep('name')} />
            <ActionButton label="Next" variant="primary" disabled={!selectedTemplate} onClick={() => setStep('options')} />
          </div>
        </div>
      )}

      {step === 'options' && (
        <div>
          <label class="block text-sm font-medium mb-2">Options</label>
          <label class="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={initGit}
              onChange={(e) => setInitGit((e.target as HTMLInputElement).checked)}
              class="rounded"
            />
            Initialize Git repository
          </label>
          <div class="flex gap-2 mt-4">
            <ActionButton label="Back" variant="secondary" onClick={() => setStep('template')} />
            <ActionButton label="Create Project" variant="primary" onClick={handleCreate} />
          </div>
        </div>
      )}

      {step === 'creating' && (
        <div class="text-center py-8">
          <div class="text-forge-muted animate-pulse">Creating project...</div>
        </div>
      )}

      {step === 'done' && (
        <div>
          <div class="p-4 rounded-lg bg-forge-success/10 border border-forge-success/30 text-sm mb-4">
            {output}
          </div>
          <ActionButton
            label="Create Another"
            variant="secondary"
            onClick={() => {
              setStep('name')
              setProjectName('')
              setSelectedTemplate('')
              setOutput(null)
            }}
          />
        </div>
      )}
    </div>
  )
}

export default definePanel({
  id: 'wizard',
  title: 'New Project',
  component: WizardPanel
})
```

- [ ] **Step 2: Create Recent panel**

`modules/mod-scaffold/panels/Recent.tsx`:

```typescript
import { type FunctionComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { DataList, EmptyState, type DataListItem } from '@forge-dev/ui'

interface ProjectEntry {
  id: string
  name: string
  path: string
  createdAt: string
}

function RecentPanel(_props: PanelProps) {
  const [projects, setProjects] = useState<ProjectEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/projects')
      .then(r => r.json())
      .then((data: ProjectEntry[]) => setProjects(data))
      .catch(() => setProjects([]))
      .finally(() => setLoading(false))
  }, [])

  if (!loading && projects.length === 0) {
    return (
      <EmptyState
        icon="folder-plus"
        title="No Projects Yet"
        description="Create your first project using the New Project wizard or register an existing project."
      />
    )
  }

  const items: DataListItem[] = projects.map(p => ({
    id: p.id,
    title: p.name,
    subtitle: p.path,
    badge: { label: new Date(p.createdAt).toLocaleDateString() }
  }))

  return (
    <div>
      <h3 class="text-sm font-medium text-forge-muted mb-4">
        {projects.length} project{projects.length !== 1 ? 's' : ''}
      </h3>
      <DataList items={items} loading={loading} />
    </div>
  )
}

export default definePanel({
  id: 'recent',
  title: 'Recent',
  component: RecentPanel
})
```

- [ ] **Step 3: Update console registry**

In `packages/console/src/panels/registry.ts`, update mod-scaffold registration:

```typescript
import { templates, wizard, recent } from '@forge-dev/mod-scaffold/panels'
registerPanels('mod-scaffold', [templates, wizard, recent])
```

- [ ] **Step 4: Build and verify**

Run: `npx turbo build`
Expected: All packages build.

- [ ] **Step 5: Commit**

```bash
git add modules/mod-scaffold/panels/ packages/console/src/panels/registry.ts
git commit -m "feat(mod-scaffold): add Wizard (project creation flow) + Recent panels"
```

---

## Task 14: mod-scaffold — Integration test

**Files:**
- Create: `tests/integration/mod-scaffold.test.ts`

- [ ] **Step 1: Write the integration test**

`tests/integration/mod-scaffold.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createForgeServer } from '@forge-dev/core'
import { mkdirSync, rmSync, cpSync } from 'node:fs'
import { join } from 'node:path'

const TEST_DIR = join(import.meta.dirname, '../.test-mod-scaffold')
const MODULES_DIR = join(TEST_DIR, 'modules')

describe('mod-scaffold integration', () => {
  let server: ReturnType<typeof createForgeServer>

  beforeAll(() => {
    mkdirSync(MODULES_DIR, { recursive: true })

    const modSrc = join(import.meta.dirname, '../../modules/mod-scaffold')
    const modDest = join(MODULES_DIR, 'mod-scaffold')
    mkdirSync(modDest, { recursive: true })
    cpSync(join(modSrc, 'forge-module.json'), join(modDest, 'forge-module.json'))

    server = createForgeServer({ dataDir: TEST_DIR })
  })

  afterAll(() => {
    server.close()
    rmSync(TEST_DIR, { recursive: true, force: true })
  })

  it('discovers mod-scaffold module', async () => {
    const res = await server.fetch('/api/modules/available')
    const modules = await res.json() as { name: string; displayName: string }[]
    const mod = modules.find(m => m.name === '@forge-dev/mod-scaffold')
    expect(mod).toBeDefined()
    expect(mod!.displayName).toBe('Scaffold')
  })

  it('has templates, wizard, recent panels', async () => {
    const res = await server.fetch('/api/modules/available')
    const modules = await res.json() as { name: string; panels: { id: string }[] }[]
    const mod = modules.find(m => m.name === '@forge-dev/mod-scaffold')!
    expect(mod.panels.map(p => p.id)).toEqual(['templates', 'wizard', 'recent'])
  })

  it('runs detect-stack action', async () => {
    const res = await server.fetch('/api/actions/mod-scaffold/detect-stack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: null })
    })
    expect(res.status).toBe(200)
    const result = await res.json() as { exitCode: number }
    expect(typeof result.exitCode).toBe('number')
  })
})
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run tests/integration/mod-scaffold.test.ts`
Expected: ALL PASS (3 tests)

- [ ] **Step 3: Commit**

```bash
git add tests/integration/mod-scaffold.test.ts
git commit -m "test(mod-scaffold): integration test — discovery, panels, detect-stack action"
```

---

## Task 15: mod-planning — Package scaffold + manifest + Board panel

**Files:**
- Create: `modules/mod-planning/package.json`
- Create: `modules/mod-planning/tsconfig.json`
- Create: `modules/mod-planning/forge-module.json`
- Create: `modules/mod-planning/panels/index.ts`
- Create: `modules/mod-planning/panels/Board.tsx`
- Modify: `packages/console/package.json`
- Modify: `packages/console/src/panels/registry.ts`

- [ ] **Step 1: Create package.json**

`modules/mod-planning/package.json`:

```json
{
  "name": "@forge-dev/mod-planning",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "description": "Issue tracking, documentation, architecture diagrams, and ADRs",
  "exports": {
    "./panels": "./panels/index.ts"
  },
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

- [ ] **Step 2: Create tsconfig.json**

`modules/mod-planning/tsconfig.json`:

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

- [ ] **Step 3: Create forge-module.json**

`modules/mod-planning/forge-module.json`:

```json
{
  "name": "@forge-dev/mod-planning",
  "version": "0.1.0",
  "displayName": "Planning",
  "description": "Issues, docs, architecture diagrams, and decision records",
  "icon": "kanban",
  "color": "#3b82f6",
  "panels": [
    {
      "id": "board",
      "title": "Board",
      "component": "./panels/Board",
      "default": true
    },
    {
      "id": "architecture",
      "title": "Architecture",
      "component": "./panels/Architecture"
    },
    {
      "id": "docs",
      "title": "Docs",
      "component": "./panels/Docs"
    },
    {
      "id": "adr",
      "title": "ADR",
      "component": "./panels/ADR"
    }
  ],
  "actions": [
    {
      "id": "list-issues",
      "label": "List Issues",
      "icon": "list-checks",
      "command": "gh issue list --limit 20 --json number,title,state,labels 2>/dev/null || echo '[]'",
      "hidden": true,
      "tags": ["planning", "issues"]
    },
    {
      "id": "list-diagrams",
      "label": "List Diagrams",
      "icon": "shapes",
      "command": "find docs -name '*.mmd' -o -name '*.d2' 2>/dev/null | head -20 || echo ''",
      "hidden": true,
      "tags": ["planning", "diagrams"]
    },
    {
      "id": "list-adrs",
      "label": "List ADRs",
      "icon": "file-check",
      "command": "ls -1 docs/adr/*.md docs/decisions/*.md 2>/dev/null | head -20 || echo ''",
      "hidden": true,
      "tags": ["planning", "adr"]
    },
    {
      "id": "create-adr",
      "label": "New ADR",
      "icon": "file-plus",
      "command": "echo 'Create an ADR by adding a markdown file to docs/adr/'",
      "tags": ["planning", "adr"]
    }
  ],
  "detectors": [
    {
      "tool": "mermaid",
      "files": ["docs/diagrams", "docs/architecture"],
      "suggestion": "Diagram files found. View in Architecture panel."
    },
    {
      "tool": "adr",
      "files": ["docs/adr", "docs/decisions"],
      "suggestion": "Decision records found. View in ADR panel."
    }
  ]
}
```

- [ ] **Step 4: Create Board panel**

`modules/mod-planning/panels/Board.tsx`:

```typescript
import { type FunctionComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { DataList, EmptyState, ActionButton, type DataListItem } from '@forge-dev/ui'

interface GitHubIssue {
  number: number
  title: string
  state: string
  labels: { name: string }[]
}

function BoardPanel({ moduleId, projectId }: PanelProps) {
  const [issues, setIssues] = useState<GitHubIssue[]>([])
  const [loading, setLoading] = useState(true)
  const [noGh, setNoGh] = useState(false)

  const fetchIssues = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/actions/${moduleId}/list-issues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId })
      })
      const result = await res.json() as { output: string; exitCode: number }

      if (result.exitCode !== 0 || result.output.trim() === '[]' || !result.output.trim()) {
        setNoGh(true)
        setIssues([])
      } else {
        try {
          setIssues(JSON.parse(result.output))
        } catch {
          setNoGh(true)
        }
      }
    } catch {
      setNoGh(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchIssues() }, [moduleId, projectId])

  if (noGh && !loading) {
    return (
      <EmptyState
        icon="kanban"
        title="No Issues Found"
        description="Connect GitHub CLI (gh) to view issues, or configure Linear in module settings for full board functionality."
      />
    )
  }

  const items: DataListItem[] = issues.map(issue => ({
    id: String(issue.number),
    title: `#${issue.number} ${issue.title}`,
    subtitle: issue.labels.map(l => l.name).join(', ') || 'No labels',
    badge: {
      label: issue.state,
      color: issue.state === 'open' ? 'var(--forge-success)' : 'var(--forge-muted)'
    }
  }))

  return (
    <div>
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-medium text-forge-muted">
          {issues.length} issue{issues.length !== 1 ? 's' : ''}
        </h3>
        <ActionButton label="Refresh" variant="secondary" onClick={fetchIssues} />
      </div>
      <DataList items={items} loading={loading} />
    </div>
  )
}

export default definePanel({
  id: 'board',
  title: 'Board',
  component: BoardPanel
})
```

- [ ] **Step 5: Create panels/index.ts**

`modules/mod-planning/panels/index.ts`:

```typescript
export { default as board } from './Board.js'
export { default as architecture } from './Architecture.js'
export { default as docs } from './Docs.js'
export { default as adr } from './ADR.js'
```

- [ ] **Step 6: Add mod-planning to console + register panels**

In `packages/console/package.json`, add to `dependencies`:

```json
    "@forge-dev/mod-planning": "*"
```

Append to `packages/console/src/panels/registry.ts`:

```typescript
import { board } from '@forge-dev/mod-planning/panels'
registerPanels('mod-planning', [board])
// Architecture, Docs, ADR will be added in Task 16
```

- [ ] **Step 7: Run npm install**

Run: `npm install`

- [ ] **Step 8: Commit**

```bash
git add modules/mod-planning/ packages/console/
git commit -m "feat(mod-planning): scaffold module with Board panel — GitHub Issues integration"
```

---

## Task 16: mod-planning — Architecture + Docs + ADR panels

**Files:**
- Create: `modules/mod-planning/panels/Architecture.tsx`
- Create: `modules/mod-planning/panels/Docs.tsx`
- Create: `modules/mod-planning/panels/ADR.tsx`
- Modify: `packages/console/src/panels/registry.ts`

- [ ] **Step 1: Create Architecture panel**

`modules/mod-planning/panels/Architecture.tsx`:

```typescript
import { type FunctionComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { DataList, EmptyState, ActionButton, type DataListItem } from '@forge-dev/ui'

function ArchitecturePanel({ moduleId, projectId }: PanelProps) {
  const [files, setFiles] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<string | null>(null)

  const fetchDiagrams = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/actions/${moduleId}/list-diagrams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId })
      })
      const result = await res.json() as { output: string; exitCode: number }
      const found = result.output.trim().split('\n').filter(Boolean)
      setFiles(found)
    } catch {
      setFiles([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchDiagrams() }, [moduleId, projectId])

  if (!loading && files.length === 0) {
    return (
      <EmptyState
        icon="shapes"
        title="No Diagrams Found"
        description="Add Mermaid (.mmd) or D2 (.d2) files to docs/diagrams/ or docs/architecture/ to view them here."
      />
    )
  }

  const items: DataListItem[] = files.map(f => ({
    id: f,
    title: f.split('/').pop() ?? f,
    subtitle: f,
    badge: {
      label: f.endsWith('.mmd') ? 'mermaid' : 'd2',
      color: 'var(--forge-accent)'
    }
  }))

  return (
    <div>
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-medium text-forge-muted">
          {files.length} diagram{files.length !== 1 ? 's' : ''}
        </h3>
        <ActionButton label="Refresh" variant="secondary" onClick={fetchDiagrams} />
      </div>
      <DataList items={items} loading={loading} onItemClick={setSelectedFile} />
      {selectedFile && (
        <div class="mt-4 p-4 rounded-lg bg-forge-surface border border-forge-border">
          <div class="text-xs text-forge-muted mb-2">{selectedFile}</div>
          <p class="text-sm text-forge-text">
            Open this file in your editor to view or edit the diagram.
          </p>
        </div>
      )}
    </div>
  )
}

export default definePanel({
  id: 'architecture',
  title: 'Architecture',
  component: ArchitecturePanel
})
```

- [ ] **Step 2: Create Docs panel**

`modules/mod-planning/panels/Docs.tsx`:

```typescript
import { type FunctionComponent } from 'preact'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { EmptyState } from '@forge-dev/ui'

function DocsPanel(_props: PanelProps) {
  return (
    <EmptyState
      icon="book-open"
      title="Documentation Hub"
      description="Connect Notion to browse and search your project documentation. Configure the Notion integration in module settings."
    />
  )
}

export default definePanel({
  id: 'docs',
  title: 'Docs',
  component: DocsPanel
})
```

- [ ] **Step 3: Create ADR panel**

`modules/mod-planning/panels/ADR.tsx`:

```typescript
import { type FunctionComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { DataList, EmptyState, ActionButton, type DataListItem } from '@forge-dev/ui'

function ADRPanel({ moduleId, projectId }: PanelProps) {
  const [files, setFiles] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  const fetchADRs = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/actions/${moduleId}/list-adrs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId })
      })
      const result = await res.json() as { output: string; exitCode: number }
      const found = result.output.trim().split('\n').filter(Boolean)
      setFiles(found)
    } catch {
      setFiles([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchADRs() }, [moduleId, projectId])

  if (!loading && files.length === 0) {
    return (
      <EmptyState
        icon="file-check"
        title="No Decision Records"
        description="Add Architecture Decision Records as markdown files in docs/adr/ to track important decisions."
        action={{
          label: 'Create First ADR',
          onClick: () => {
            // Trigger the create-adr action via the action bar
          }
        }}
      />
    )
  }

  const items: DataListItem[] = files.map((f, i) => {
    const filename = f.split('/').pop() ?? f
    const title = filename.replace(/^\d+-/, '').replace('.md', '').replace(/-/g, ' ')
    return {
      id: f,
      title: title.charAt(0).toUpperCase() + title.slice(1),
      subtitle: f,
      badge: { label: `ADR-${String(i + 1).padStart(3, '0')}` }
    }
  })

  return (
    <div>
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-medium text-forge-muted">
          {files.length} decision record{files.length !== 1 ? 's' : ''}
        </h3>
        <ActionButton label="Refresh" variant="secondary" onClick={fetchADRs} />
      </div>
      <DataList items={items} loading={loading} />
    </div>
  )
}

export default definePanel({
  id: 'adr',
  title: 'ADR',
  component: ADRPanel
})
```

- [ ] **Step 4: Update console registry**

In `packages/console/src/panels/registry.ts`, update mod-planning registration:

```typescript
import { board, architecture, docs, adr } from '@forge-dev/mod-planning/panels'
registerPanels('mod-planning', [board, architecture, docs, adr])
```

- [ ] **Step 5: Build and verify**

Run: `npx turbo build`
Expected: All packages build.

- [ ] **Step 6: Commit**

```bash
git add modules/mod-planning/panels/ packages/console/src/panels/registry.ts
git commit -m "feat(mod-planning): add Architecture (diagram browser), Docs (Notion placeholder), ADR panels"
```

---

## Task 17: mod-planning — Integration test

**Files:**
- Create: `tests/integration/mod-planning.test.ts`

- [ ] **Step 1: Write the integration test**

`tests/integration/mod-planning.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createForgeServer } from '@forge-dev/core'
import { mkdirSync, rmSync, cpSync } from 'node:fs'
import { join } from 'node:path'

const TEST_DIR = join(import.meta.dirname, '../.test-mod-planning')
const MODULES_DIR = join(TEST_DIR, 'modules')

describe('mod-planning integration', () => {
  let server: ReturnType<typeof createForgeServer>

  beforeAll(() => {
    mkdirSync(MODULES_DIR, { recursive: true })

    const modSrc = join(import.meta.dirname, '../../modules/mod-planning')
    const modDest = join(MODULES_DIR, 'mod-planning')
    mkdirSync(modDest, { recursive: true })
    cpSync(join(modSrc, 'forge-module.json'), join(modDest, 'forge-module.json'))

    server = createForgeServer({ dataDir: TEST_DIR })
  })

  afterAll(() => {
    server.close()
    rmSync(TEST_DIR, { recursive: true, force: true })
  })

  it('discovers mod-planning module', async () => {
    const res = await server.fetch('/api/modules/available')
    const modules = await res.json() as { name: string; displayName: string }[]
    const mod = modules.find(m => m.name === '@forge-dev/mod-planning')
    expect(mod).toBeDefined()
    expect(mod!.displayName).toBe('Planning')
  })

  it('has board, architecture, docs, adr panels', async () => {
    const res = await server.fetch('/api/modules/available')
    const modules = await res.json() as { name: string; panels: { id: string }[] }[]
    const mod = modules.find(m => m.name === '@forge-dev/mod-planning')!
    expect(mod.panels.map(p => p.id)).toEqual(['board', 'architecture', 'docs', 'adr'])
  })

  it('runs list-diagrams action', async () => {
    const res = await server.fetch('/api/actions/mod-planning/list-diagrams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: null })
    })
    expect(res.status).toBe(200)
    const result = await res.json() as { exitCode: number }
    expect(typeof result.exitCode).toBe('number')
  })

  it('runs list-adrs action', async () => {
    const res = await server.fetch('/api/actions/mod-planning/list-adrs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: null })
    })
    expect(res.status).toBe(200)
    const result = await res.json() as { exitCode: number }
    expect(typeof result.exitCode).toBe('number')
  })
})
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run tests/integration/mod-planning.test.ts`
Expected: ALL PASS (4 tests)

- [ ] **Step 3: Commit**

```bash
git add tests/integration/mod-planning.test.ts
git commit -m "test(mod-planning): integration test — discovery, panels, diagram + ADR actions"
```

---

## Task 18: Full integration test — all 4 modules together

**Files:**
- Create: `tests/integration/phase1-modules.test.ts`

- [ ] **Step 1: Write the full integration test**

`tests/integration/phase1-modules.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createForgeServer } from '@forge-dev/core'
import { mkdirSync, rmSync, cpSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const TEST_DIR = join(import.meta.dirname, '../.test-phase1')
const MODULES_DIR = join(TEST_DIR, 'modules')

const MODULE_NAMES = ['mod-dev', 'mod-monitor', 'mod-scaffold', 'mod-planning']

describe('Phase 1: All modules integration', () => {
  let server: ReturnType<typeof createForgeServer>

  beforeAll(() => {
    mkdirSync(MODULES_DIR, { recursive: true })

    // Copy all module manifests
    for (const mod of MODULE_NAMES) {
      const src = join(import.meta.dirname, '../../modules', mod, 'forge-module.json')
      if (existsSync(src)) {
        const dest = join(MODULES_DIR, mod)
        mkdirSync(dest, { recursive: true })
        cpSync(src, join(dest, 'forge-module.json'))
      }
    }

    server = createForgeServer({ dataDir: TEST_DIR })
  })

  afterAll(() => {
    server.close()
    rmSync(TEST_DIR, { recursive: true, force: true })
  })

  it('discovers all 4 Phase 1 modules', async () => {
    const res = await server.fetch('/api/modules/available')
    const modules = await res.json() as { name: string }[]
    const names = modules.map(m => m.name)

    expect(names).toContain('@forge-dev/mod-dev')
    expect(names).toContain('@forge-dev/mod-monitor')
    expect(names).toContain('@forge-dev/mod-scaffold')
    expect(names).toContain('@forge-dev/mod-planning')
  })

  it('each module has at least one panel and one action', async () => {
    const res = await server.fetch('/api/modules/available')
    const modules = await res.json() as {
      name: string
      panels: { id: string }[]
      actions: { id: string }[]
    }[]

    for (const mod of modules) {
      expect(mod.panels.length).toBeGreaterThan(0)
      expect(mod.actions.length).toBeGreaterThan(0)
    }
  })

  it('module settings CRUD works', async () => {
    // Set settings
    const putRes = await server.fetch('/api/modules/mod-dev/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cwPath: '/usr/local/bin/cw', maxWorktrees: '5' })
    })
    expect(putRes.status).toBe(200)

    // Get settings
    const getRes = await server.fetch('/api/modules/mod-dev/settings')
    const settings = await getRes.json() as Record<string, string>
    expect(settings.cwPath).toBe('/usr/local/bin/cw')
    expect(settings.maxWorktrees).toBe('5')
  })

  it('action logs accumulate across modules', async () => {
    // Register a project first
    await server.fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'test-proj', path: '/tmp/test-proj' })
    })

    // Run actions from different modules
    await server.fetch('/api/actions/mod-dev/git-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: null })
    })

    await server.fetch('/api/actions/mod-planning/list-adrs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: null })
    })

    // Check action logs
    const res = await server.fetch('/api/action-logs')
    const logs = await res.json() as { moduleId: string }[]
    expect(logs.length).toBeGreaterThanOrEqual(2)

    const moduleIds = logs.map(l => l.moduleId)
    expect(moduleIds).toContain('mod-dev')
    expect(moduleIds).toContain('mod-planning')
  })

  it('action logs filter by module works', async () => {
    const res = await server.fetch('/api/action-logs?moduleId=mod-dev')
    const logs = await res.json() as { moduleId: string }[]
    for (const log of logs) {
      expect(log.moduleId).toBe('mod-dev')
    }
  })
})
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run tests/integration/phase1-modules.test.ts`
Expected: ALL PASS (5 tests)

- [ ] **Step 3: Run ALL tests**

Run: `npx turbo test && npx vitest run tests/integration/`
Expected:
- Core: 29 tests pass (11 db + 8 server + 5 modules + 5 runner)
- Integration: ~20 tests pass across all integration test files

- [ ] **Step 4: Build everything**

Run: `npx turbo build`
Expected: All packages build. Console bundles with all 4 module panel registrations.

- [ ] **Step 5: Commit**

```bash
git add tests/integration/phase1-modules.test.ts
git commit -m "test: Phase 1 full integration — all 4 modules discovered, settings, action log filtering"
```

---

## Summary of Phase 1 Tasks

| # | Task | Files | Tests |
|---|------|-------|-------|
| 1 | SDK: definePanel + PanelProps + hidden | 3 | Build |
| 2 | UI: Tabs, DataList, EmptyState | 4 | Build |
| 3 | Core DB: settings + listActionLogs | 3 | 5 unit |
| 4 | Core Server: action-logs + settings API | 2 | 3 unit |
| 5 | Console: dynamic modules + ModuleShell | 5 | Build |
| 6 | mod-dev: scaffold + Workspaces panel | 7 | Build |
| 7 | mod-dev: Sessions + SharedContext panels | 3 | Build |
| 8 | mod-dev: integration test | 1 | 4 integration |
| 9 | mod-monitor: scaffold + Health panel | 7 | Build |
| 10 | mod-monitor: Activity + Costs panels | 3 | Build |
| 11 | mod-monitor: integration test | 1 | 4 integration |
| 12 | mod-scaffold: scaffold + Templates panel | 7 | Build |
| 13 | mod-scaffold: Wizard + Recent panels | 3 | Build |
| 14 | mod-scaffold: integration test | 1 | 3 integration |
| 15 | mod-planning: scaffold + Board panel | 7 | Build |
| 16 | mod-planning: Arch + Docs + ADR panels | 4 | Build |
| 17 | mod-planning: integration test | 1 | 4 integration |
| 18 | Full integration test | 1 | 5 integration |

**Totals: 18 tasks, ~62 files, 8 new unit tests, 20 integration tests, 13 panel components**

**Final Console Panel Registry:**

```typescript
import { workspaces, sessions, sharedContext } from '@forge-dev/mod-dev/panels'
import { health, activity, costs } from '@forge-dev/mod-monitor/panels'
import { templates, wizard, recent } from '@forge-dev/mod-scaffold/panels'
import { board, architecture, docs, adr } from '@forge-dev/mod-planning/panels'

registerPanels('mod-dev', [workspaces, sessions, sharedContext])
registerPanels('mod-monitor', [health, activity, costs])
registerPanels('mod-scaffold', [templates, wizard, recent])
registerPanels('mod-planning', [board, architecture, docs, adr])
```

After Phase 1, the dashboard shows: Home + 4 modules in sidebar. Each module has tabbed panels with real functionality. Workspaces shows git worktrees. Health shows endpoint status. Templates lists project scaffolds. Board shows GitHub issues. Architecture lists diagrams. Activity shows the action log. The foundation supports full Phase 2 (mod-qa, mod-design, mod-release).

---

## Next: Phase 2

After Phase 1 is verified, create plans for:
- mod-qa: Tests, security scans, load testing, visual regression
- mod-design: Figma integration, design tokens, wireframe viewer
- mod-release: Deploy automation, feature flags, rollback, changelog
