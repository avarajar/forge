# Module Authoring Guide

This guide walks you through creating a custom Forge module from scratch — a self-contained npm package that adds panels, actions, and stack detectors to the Forge dashboard.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Module Structure](#2-module-structure)
3. [package.json](#3-packagejson)
4. [tsconfig.json](#4-tsconfigjson)
5. [forge-module.json Manifest](#5-forge-modulejson-manifest)
6. [Creating Panels with definePanel](#6-creating-panels-with-definepanel)
7. [Available UI Components](#7-available-ui-components)
8. [Registering in the Console](#8-registering-in-the-console)
9. [Testing](#9-testing)
10. [Publishing to npm](#10-publishing-to-npm)

---

## 1. Prerequisites

- Node.js >= 20
- A working Forge monorepo (run `npm install` at the root)
- Familiarity with TypeScript and Preact

All examples use `@yourorg/mod-yourname` as the module name. Replace `yourorg` and `yourname` with your own values throughout.

---

## 2. Module Structure

Every module lives either inside the Forge monorepo under `modules/` or in a standalone npm package. The minimum required files are:

```
modules/mod-yourname/          (or any directory name)
  forge-module.json            ← module manifest (required)
  package.json                 ← npm package metadata (required)
  tsconfig.json                ← TypeScript config for panels
  panels/
    index.ts                   ← re-exports all panel configs
    Overview.tsx               ← one file per panel
    Detail.tsx
```

Panels are optional — a module that only exposes CLI actions does not need a `panels/` directory — but most modules have at least one panel.

---

## 3. package.json

```json
{
  "name": "@yourorg/mod-yourname",
  "version": "0.1.0",
  "type": "module",
  "description": "One-line description of what this module does",
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
    "typescript": "^5.8.0",
    "vitest": "^2.0.0"
  }
}
```

Key points:

- `"type": "module"` — ESM only, no CommonJS.
- `exports["./panels"]` — the console imports panels through this entry point.
- Declare `preact`, `@forge-dev/sdk`, and `@forge-dev/ui` as peer dependencies so they are not bundled twice.

---

## 4. tsconfig.json

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

- `jsxImportSource: "preact"` is required — do not use React's JSX transform.
- Only the `panels/` directory needs to be compiled; server-side logic (if any) runs from source.

If your module lives outside the monorepo, replace `"extends": "../../tsconfig.base.json"` with the full compiler options from `tsconfig.base.json`.

---

## 5. forge-module.json Manifest

The manifest is the single source of truth for your module. Forge reads it at startup to know what actions to expose and what panels to render.

### Complete example

```json
{
  "name": "@yourorg/mod-yourname",
  "version": "0.1.0",
  "displayName": "Your Module Name",
  "description": "Short description shown in the sidebar tooltip",
  "icon": "bar-chart",
  "color": "#8b5cf6",
  "panels": [
    {
      "id": "overview",
      "title": "Overview",
      "component": "./panels/Overview",
      "default": true
    },
    {
      "id": "detail",
      "title": "Detail",
      "component": "./panels/Detail"
    }
  ],
  "actions": [
    {
      "id": "sync",
      "label": "Sync Data",
      "icon": "refresh-cw",
      "command": "npx your-cli pull --json",
      "streaming": true,
      "tags": ["yourname", "sync"]
    },
    {
      "id": "detect-config",
      "label": "Detect Config",
      "icon": "search",
      "command": "[ -f yourname.config.ts ] && echo 'found' || echo 'not found'",
      "streaming": false,
      "hidden": true
    }
  ],
  "detectors": [
    {
      "tool": "yourname",
      "files": ["yourname.config.ts", "yourname.config.js"],
      "packages": ["yourname"],
      "suggestion": "yourname detected. Enable the module?"
    }
  ],
  "claude": {
    "skills": ["data-analyst"],
    "mcpServers": ["yourname-mcp"]
  },
  "settings": {
    "schema": {
      "apiKey": { "type": "string" },
      "pollInterval": { "type": "number", "default": 60 },
      "autoSync": { "type": "boolean", "default": false }
    }
  }
}
```

### Field reference

#### Top-level fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | npm package name, e.g. `@yourorg/mod-yourname` |
| `version` | string | yes | semver version string |
| `displayName` | string | yes | Human-readable name shown in the sidebar |
| `description` | string | yes | Short description shown in tooltips |
| `icon` | string | yes | Lucide icon name (e.g. `bar-chart`, `shield-check`) |
| `color` | string | yes | Hex accent color used for the module badge |
| `panels` | PanelDef[] | yes | List of panels this module provides |
| `actions` | ActionDef[] | yes | List of shell actions this module exposes |
| `detectors` | DetectorDef[] | no | Stack detection rules |
| `claude` | object | no | Claude Code skills and MCP servers |
| `settings` | object | no | Configurable settings schema |

#### PanelDef

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Unique panel ID within this module |
| `title` | string | yes | Tab label shown in the dashboard |
| `component` | string | yes | Relative path to the panel file (without extension) |
| `default` | boolean | no | If `true`, this panel is shown first |

#### ActionDef

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Unique action ID within this module |
| `label` | string | yes | Button label in the dashboard |
| `icon` | string | yes | Lucide icon name |
| `command` | string | yes | Shell command to execute |
| `streaming` | boolean | no | If `true`, stdout is streamed via SSE in real time |
| `tags` | string[] | no | Arbitrary tags for filtering actions |
| `hidden` | boolean | no | If `true`, the action is not shown as a button but can still be invoked via the API |

Actions run in the project's working directory. Use `streaming: true` for long-running commands (tests, builds, deploys) so the user sees live output.

#### DetectorDef

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tool` | string | yes | Short tool name used in logs |
| `files` | string[] | yes | Glob patterns — if any match in the project root, the detector fires |
| `packages` | string[] | no | `package.json` dependency names to also check |
| `suggestion` | string | yes | Message shown to the user when the detector fires |

#### claude

| Field | Type | Description |
|-------|------|-------------|
| `skills` | string[] | Claude Code skill IDs to activate for this module |
| `mcpServers` | string[] | MCP server names to start alongside this module |

#### settings.schema

Each key is a setting name. Each value is a `SettingDef`:

| Field | Type | Description |
|-------|------|-------------|
| `type` | `"string"` \| `"number"` \| `"boolean"` | Value type |
| `default` | any | Default value if not configured |

---

## 6. Creating Panels with definePanel

Panels are Preact components wrapped with `definePanel` from `@forge-dev/sdk`. They receive `moduleId` and `projectId` as props via `PanelProps`.

### PanelProps

```typescript
interface PanelProps {
  moduleId: string        // e.g. "mod-yourname" (the directory name)
  projectId: string | null  // currently selected project, or null if none
}
```

### PanelConfig

```typescript
interface PanelConfig {
  id: string
  title: string
  component: import('preact').FunctionComponent<PanelProps>
}
```

### definePanel signature

```typescript
function definePanel(config: PanelConfig): PanelConfig
```

`definePanel` is a thin identity function that provides TypeScript type-checking and a consistent authoring convention. It returns the config unchanged.

### Minimal panel example

```tsx
// panels/Overview.tsx
import { definePanel, type PanelProps } from '@forge-dev/sdk'

function OverviewPanel({ moduleId, projectId }: PanelProps) {
  return (
    <div>
      <p>Module: {moduleId}</p>
      <p>Project: {projectId ?? 'none selected'}</p>
    </div>
  )
}

export default definePanel({
  id: 'overview',
  title: 'Overview',
  component: OverviewPanel
})
```

### Full panel example — calling actions

Actions are invoked by posting to `/api/actions/{moduleId}/{actionId}`. Non-streaming actions return `{ exitCode, output }`. Streaming actions accept an `EventSource` connection to `/api/actions/{moduleId}/{actionId}/stream`.

```tsx
// panels/Overview.tsx
import { useState, useEffect } from 'preact/hooks'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { StatusCard, ActionButton, ForgeTerminal, showToast } from '@forge-dev/ui'

function OverviewPanel({ moduleId, projectId }: PanelProps) {
  const [status, setStatus] = useState<'good' | 'warn' | 'bad' | 'neutral'>('neutral')
  const [value, setValue] = useState('Unknown')
  const [streamUrl, setStreamUrl] = useState<string | undefined>()

  // Call a hidden "detect" action on mount
  useEffect(() => {
    fetch(`/api/actions/${moduleId}/detect-config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId })
    })
      .then(r => r.json())
      .then((res: { output: string }) => {
        const found = res.output.trim() === 'found'
        setStatus(found ? 'good' : 'warn')
        setValue(found ? 'Configured' : 'Not found')
      })
      .catch(() => setStatus('bad'))
  }, [moduleId, projectId])

  // Trigger the "sync" streaming action
  const handleSync = () => {
    const url = `/api/actions/${moduleId}/sync/stream?projectId=${projectId ?? ''}`
    setStreamUrl(url)
    showToast('Sync started', 'info')
  }

  return (
    <div class="space-y-6">
      <div class="grid grid-cols-2 gap-4">
        <StatusCard icon="settings" label="Config" value={value} status={status} />
        <StatusCard icon="activity" label="Last Sync" value="2 min ago" status="good" />
      </div>

      <ActionButton
        label="Sync Data"
        icon="refresh-cw"
        variant="primary"
        onClick={handleSync}
      />

      {streamUrl && <ForgeTerminal streamUrl={streamUrl} height={300} />}
    </div>
  )
}

export default definePanel({
  id: 'overview',
  title: 'Overview',
  component: OverviewPanel
})
```

### panels/index.ts

Re-export every panel config from a single index file. The console imports panels via this file.

```typescript
// panels/index.ts
export { default as overview } from './Overview.js'
export { default as detail } from './Detail.js'
```

Note the `.js` extension in imports — required for ESM resolution even though the source files are `.tsx`.

---

## 7. Available UI Components

All components are exported from `@forge-dev/ui`. Import only what you need:

```typescript
import { StatusCard, ActionButton, DataList, EmptyState } from '@forge-dev/ui'
```

### Component reference

| Component | Import | Description |
|-----------|--------|-------------|
| `StatusCard` | `@forge-dev/ui` | Metric card with icon, label, value, optional trend, and a colored bottom border indicating status |
| `ActionButton` | `@forge-dev/ui` | Button that manages its own loading state; supports `primary`, `secondary`, `danger` variants |
| `DataList` | `@forge-dev/ui` | Scrollable list of items with title, subtitle, badge, and trailing slot; shows skeleton loaders while loading |
| `EmptyState` | `@forge-dev/ui` | Centered placeholder with icon, title, description, and optional action button |
| `Tabs` | `@forge-dev/ui` | Horizontal tab bar; controlled — you manage the `active` tab ID |
| `Badge` | `@forge-dev/ui` | Inline pill with `solid` or `outline` variant and custom color |
| `Modal` | `@forge-dev/ui` | Overlay dialog with title, body slot, and optional confirm/cancel buttons |
| `ForgeTerminal` | `@forge-dev/ui` | xterm.js terminal that accepts either static `content` or a live `streamUrl` (SSE) |
| `ToggleSwitch` | `@forge-dev/ui` | Accessible toggle switch with optional label |
| `showToast` | `@forge-dev/ui` | Imperative function — `showToast(message, 'success' \| 'error' \| 'info')` |
| `ToastContainer` | `@forge-dev/ui` | Mount once at the app root to render toasts; already included in the console shell |

### StatusCard props

```typescript
interface StatusCardProps {
  icon: string                              // Lucide icon name or emoji
  label: string                             // Card label
  value: string | number                   // Main displayed value
  trend?: string                            // Optional trend string (e.g. "+5%")
  status: 'good' | 'warn' | 'bad' | 'neutral'
}
```

### ActionButton props

```typescript
interface ActionButtonProps {
  label: string
  icon?: string                             // Lucide icon name or emoji
  variant?: 'primary' | 'secondary' | 'danger'  // default: 'primary'
  disabled?: boolean
  loading?: boolean                         // Overrides internal loading state
  onClick: () => void | Promise<void>       // Async onClick is supported
}
```

### DataList / DataListItem

```typescript
interface DataListItem {
  id: string
  title: string
  subtitle?: string
  badge?: { label: string; color?: string }
  trailing?: ComponentChildren             // Any Preact node
}

interface DataListProps {
  items: DataListItem[]
  loading?: boolean
  onItemClick?: (id: string) => void
}
```

### EmptyState props

```typescript
interface EmptyStateProps {
  icon?: string
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
}
```

### Tabs props

```typescript
interface Tab { id: string; label: string; icon?: string }

interface TabsProps {
  tabs: Tab[]
  active: string
  onChange: (id: string) => void
}
```

### Badge props

```typescript
interface BadgeProps {
  label: string
  color?: string                            // CSS color string, default: var(--forge-muted)
  variant?: 'solid' | 'outline'            // default: 'solid'
}
```

### Modal props

```typescript
interface ModalProps {
  open: boolean
  title: string
  onClose: () => void
  onConfirm?: () => void
  confirmLabel?: string                     // default: 'Confirm'
  children: ComponentChildren
}
```

### ForgeTerminal props

```typescript
interface TerminalProps {
  streamUrl?: string   // SSE endpoint — terminal connects and streams output live
  content?: string     // Static string written to the terminal on mount
  height?: number      // Pixel height, default: 300
}
```

### ToggleSwitch props

```typescript
interface ToggleSwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
  disabled?: boolean
}
```

---

## 8. Registering in the Console

After creating your module, add it to the console panel registry so the dashboard can render your panels.

### Step 1 — Add to workspace

If your module is inside the monorepo, ensure its directory is listed in the root `package.json` workspaces array:

```json
{
  "workspaces": [
    "packages/*",
    "modules/*"
  ]
}
```

Modules placed under `modules/` are automatically included. Run `npm install` after adding a new package.

### Step 2 — Register panels in registry.ts

Open `packages/console/src/panels/registry.ts` and add your module:

```typescript
// At the top, import your panels
import { overview, detail } from '@yourorg/mod-yourname/panels'

// At the bottom, register them
registerPanels('mod-yourname', [overview, detail])
```

The first argument to `registerPanels` is the **module directory name** (the part after the last `/` in your package name). This must match what the server uses as `moduleId`.

### Step 3 — Add the dependency

Add your module as a dependency in `packages/console/package.json`:

```json
{
  "dependencies": {
    "@yourorg/mod-yourname": "*"
  }
}
```

Then run `npm install` again.

### Step 4 — Verify

Start the dev server and confirm your module appears in the sidebar:

```bash
npx turbo dev
```

If the module does not appear, check that `forge-module.json` is present in the module root and that `name` matches exactly.

---

## 9. Testing

Write tests with Vitest. Place test files adjacent to the code they test or in a `tests/` subdirectory.

### Panel unit test example

```typescript
// panels/Overview.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/preact'
import overviewConfig from './Overview.js'

describe('Overview panel', () => {
  it('exports a valid PanelConfig', () => {
    expect(overviewConfig.id).toBe('overview')
    expect(overviewConfig.title).toBe('Overview')
    expect(typeof overviewConfig.component).toBe('function')
  })

  it('renders without crashing', () => {
    const Panel = overviewConfig.component
    const { container } = render(
      <Panel moduleId="mod-yourname" projectId="proj-1" />
    )
    expect(container).toBeTruthy()
  })
})
```

### manifest validation test example

```typescript
// forge-module.test.ts
import { describe, it, expect } from 'vitest'
import manifest from './forge-module.json' assert { type: 'json' }

describe('forge-module.json', () => {
  it('has required fields', () => {
    expect(manifest.name).toBe('@yourorg/mod-yourname')
    expect(manifest.panels.length).toBeGreaterThan(0)
    expect(manifest.actions.length).toBeGreaterThan(0)
  })

  it('every panel has an id, title, and component', () => {
    for (const panel of manifest.panels) {
      expect(panel.id).toBeTruthy()
      expect(panel.title).toBeTruthy()
      expect(panel.component).toBeTruthy()
    }
  })

  it('every action has an id, label, and command', () => {
    for (const action of manifest.actions) {
      expect(action.id).toBeTruthy()
      expect(action.label).toBeTruthy()
      expect(action.command).toBeTruthy()
    }
  })
})
```

Add a `vitest.config.ts` to your module if needed:

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'happy-dom'
  }
})
```

Run tests:

```bash
# From the monorepo root
npx turbo test

# Or from your module directory
npx vitest run
```

---

## 10. Publishing to npm

When your module is ready to share:

### Step 1 — Update package.json for publishing

Remove `"private": true` and add build and publish fields:

```json
{
  "name": "@yourorg/mod-yourname",
  "version": "1.0.0",
  "type": "module",
  "description": "Short description of your module",
  "exports": {
    "./panels": "./dist/panels/index.js"
  },
  "files": ["dist", "forge-module.json"],
  "scripts": {
    "build": "tsc",
    "prepublishOnly": "npm run build"
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

Key changes for publishing:

- `exports` now points to `./dist/...` (compiled output) instead of source `.ts` files.
- `files` ensures only the `dist/` directory and `forge-module.json` are included in the package.
- `prepublishOnly` builds before publish.

### Step 2 — Build

```bash
npm run build
```

Check that `dist/panels/index.js` and the compiled panel files exist.

### Step 3 — Publish

```bash
npm publish --access public
```

For scoped packages (`@yourorg/...`) the `--access public` flag is required on first publish.

### Step 4 — Install in any Forge project

Once published, anyone can add your module:

```bash
forge module add @yourorg/mod-yourname
```

Or manually:

```bash
npm install @yourorg/mod-yourname
```

Then follow the registry steps in [Section 8](#8-registering-in-the-console).

---

## Complete file listing

Here is the full set of files for a minimal module:

```
modules/mod-yourname/
  forge-module.json        ← manifest
  package.json             ← package metadata
  tsconfig.json            ← TypeScript config
  panels/
    index.ts               ← re-exports all PanelConfig objects
    Overview.tsx           ← overview panel
    Detail.tsx             ← detail panel (optional)
  tests/
    forge-module.test.ts   ← manifest validation tests
    Overview.test.tsx      ← panel unit tests
```

All files are shown in full in the sections above.
