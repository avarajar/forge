# Forge Phase 2a: Ecosystem Modules — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build 3 ecosystem modules (mod-qa, mod-design, mod-release) with panels for test running, design tokens, deploy pipelines, feature flags, and changelogs — so the dashboard covers the full development lifecycle from testing through release.

**Architecture:** Same pattern as Phase 1. Each module is a workspace package under `modules/` with `forge-module.json` manifest and Preact panel components in `panels/`. Console imports panels at build time. Actions wrap CLI tools (vitest, playwright, semgrep, style-dictionary, git-cliff, gh). One new UI component (ToggleSwitch) for feature flags.

**Tech Stack:** TypeScript, Preact 10.x, UnoCSS 66.x, Vitest 4.x — same as Phase 1.

---

## File Structure

**UI new component:**
- Create: `packages/ui/src/ToggleSwitch.tsx` — on/off toggle for feature flags
- Modify: `packages/ui/src/index.ts` — re-export

**mod-qa (4 files + 4 panels):**
- Create: `modules/mod-qa/package.json`
- Create: `modules/mod-qa/tsconfig.json`
- Create: `modules/mod-qa/forge-module.json`
- Create: `modules/mod-qa/panels/index.ts`
- Create: `modules/mod-qa/panels/Overview.tsx`
- Create: `modules/mod-qa/panels/TestRunner.tsx`
- Create: `modules/mod-qa/panels/Coverage.tsx`
- Create: `modules/mod-qa/panels/Reports.tsx`

**mod-design (4 files + 4 panels):**
- Create: `modules/mod-design/package.json`
- Create: `modules/mod-design/tsconfig.json`
- Create: `modules/mod-design/forge-module.json`
- Create: `modules/mod-design/panels/index.ts`
- Create: `modules/mod-design/panels/Designs.tsx`
- Create: `modules/mod-design/panels/Tokens.tsx`
- Create: `modules/mod-design/panels/Wireframes.tsx`
- Create: `modules/mod-design/panels/VisualDiff.tsx`

**mod-release (4 files + 5 panels):**
- Create: `modules/mod-release/package.json`
- Create: `modules/mod-release/tsconfig.json`
- Create: `modules/mod-release/forge-module.json`
- Create: `modules/mod-release/panels/index.ts`
- Create: `modules/mod-release/panels/Pipeline.tsx`
- Create: `modules/mod-release/panels/Environments.tsx`
- Create: `modules/mod-release/panels/Changelog.tsx`
- Create: `modules/mod-release/panels/FeatureFlags.tsx`
- Create: `modules/mod-release/panels/Rollback.tsx`

**Console updates:**
- Modify: `packages/console/package.json` — add 3 module deps
- Modify: `packages/console/src/panels/registry.ts` — register 3 modules

**Integration tests:**
- Create: `tests/integration/mod-qa.test.ts`
- Create: `tests/integration/mod-design.test.ts`
- Create: `tests/integration/mod-release.test.ts`
- Create: `tests/integration/phase2a-modules.test.ts`

---

## Task 1: UI — ToggleSwitch component

**Files:**
- Create: `packages/ui/src/ToggleSwitch.tsx`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Create ToggleSwitch component**

`packages/ui/src/ToggleSwitch.tsx`:

```typescript
import { type FunctionComponent } from 'preact'

interface ToggleSwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
  disabled?: boolean
}

export const ToggleSwitch: FunctionComponent<ToggleSwitchProps> = ({
  checked, onChange, label, disabled
}) => {
  return (
    <label class={`inline-flex items-center gap-2 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        class={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors
          ${checked ? 'bg-forge-success' : 'bg-forge-border'}`}
        onClick={() => !disabled && onChange(!checked)}
      >
        <span
          class={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform
            ${checked ? 'translate-x-5' : 'translate-x-0'}`}
        />
      </button>
      {label && <span class="text-sm text-forge-text">{label}</span>}
    </label>
  )
}
```

- [ ] **Step 2: Update index.ts exports**

Add to `packages/ui/src/index.ts`:

```typescript
export { ToggleSwitch } from './ToggleSwitch.js'
```

- [ ] **Step 3: Build and verify**

Run: `cd packages/ui && npx tsc`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/
git commit -m "feat(ui): add ToggleSwitch component for feature flags"
```

---

## Task 2: mod-qa — Package scaffold + manifest

**Files:**
- Create: `modules/mod-qa/package.json`
- Create: `modules/mod-qa/tsconfig.json`
- Create: `modules/mod-qa/forge-module.json`

- [ ] **Step 1: Create package.json**

`modules/mod-qa/package.json`:

```json
{
  "name": "@forge-dev/mod-qa",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "description": "E2E, unit, visual, security, and load testing",
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

`modules/mod-qa/tsconfig.json`:

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

`modules/mod-qa/forge-module.json`:

```json
{
  "name": "@forge-dev/mod-qa",
  "version": "0.1.0",
  "displayName": "Quality Assurance",
  "description": "E2E, unit, visual, security, and load testing",
  "icon": "shield-check",
  "color": "#10b981",
  "panels": [
    { "id": "overview", "title": "Overview", "component": "./panels/Overview", "default": true },
    { "id": "test-runner", "title": "Test Runner", "component": "./panels/TestRunner" },
    { "id": "coverage", "title": "Coverage", "component": "./panels/Coverage" },
    { "id": "reports", "title": "Reports", "component": "./panels/Reports" }
  ],
  "actions": [
    { "id": "detect-runner", "label": "Detect Test Runner", "icon": "search", "command": "[ -f vitest.config.ts ] && echo 'vitest' || ([ -f jest.config.js ] && echo 'jest' || ([ -f pytest.ini ] && echo 'pytest' || echo 'none'))", "hidden": true },
    { "id": "run-unit", "label": "Run Unit Tests", "icon": "play", "command": "npx vitest run 2>&1 || pytest 2>&1 || echo 'No test runner found'", "streaming": true, "tags": ["qa", "unit"] },
    { "id": "run-e2e", "label": "Run E2E", "icon": "monitor-check", "command": "npx playwright test 2>&1 || echo 'Playwright not installed'", "streaming": true, "tags": ["qa", "e2e"] },
    { "id": "security-scan", "label": "Security Scan", "icon": "shield-alert", "command": "npx semgrep scan --config auto 2>&1 || echo 'Semgrep not installed'", "streaming": true, "tags": ["qa", "security"] },
    { "id": "load-test", "label": "Load Test", "icon": "gauge", "command": "k6 run load-test.js 2>&1 || echo 'k6 not installed or no load-test.js found'", "streaming": true, "tags": ["qa", "load"] },
    { "id": "visual-regression", "label": "Visual Regression", "icon": "eye", "command": "npx lost-pixel 2>&1 || echo 'Lost Pixel not installed'", "streaming": true, "tags": ["qa", "visual"] },
    { "id": "full-suite", "label": "Full Suite", "icon": "list-checks", "command": "echo '=== Unit Tests ===' && (npx vitest run 2>&1 || echo 'skipped') && echo '=== E2E ===' && (npx playwright test 2>&1 || echo 'skipped') && echo '=== Security ===' && (npx semgrep scan --config auto 2>&1 || echo 'skipped')", "streaming": true, "tags": ["qa", "all"] },
    { "id": "list-reports", "label": "List Reports", "icon": "file-text", "command": "ls -1t coverage/ test-results/ playwright-report/ 2>/dev/null | head -20 || echo ''", "hidden": true }
  ],
  "detectors": [
    { "tool": "vitest", "files": ["vitest.config.ts", "vitest.config.js"], "packages": ["vitest"], "suggestion": "Vitest detected. Run unit tests from the QA module." },
    { "tool": "playwright", "files": ["playwright.config.ts", "e2e"], "packages": ["@playwright/test"], "suggestion": "Playwright detected. Run E2E tests from QA." },
    { "tool": "semgrep", "files": [".semgrep.yml", ".semgrep"], "suggestion": "Semgrep rules found. Run security scans from QA." },
    { "tool": "k6", "files": ["k6", "*.k6.js"], "suggestion": "k6 scripts found. Run load tests from QA." }
  ],
  "settings": {
    "schema": {
      "coverageThreshold": { "type": "number", "default": 80 },
      "runOnPush": { "type": "boolean", "default": false }
    }
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add modules/mod-qa/
git commit -m "feat(mod-qa): scaffold module with manifest — 8 actions, 4 detectors"
```

---

## Task 3: mod-qa — Overview + TestRunner panels

**Files:**
- Create: `modules/mod-qa/panels/index.ts`
- Create: `modules/mod-qa/panels/Overview.tsx`
- Create: `modules/mod-qa/panels/TestRunner.tsx`

- [ ] **Step 1: Create Overview panel**

`modules/mod-qa/panels/Overview.tsx`:

```typescript
import { type FunctionComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { StatusCard, ActionButton } from '@forge-dev/ui'

interface DetectionResult {
  runner: string
}

function OverviewPanel({ moduleId, projectId }: PanelProps) {
  const [runner, setRunner] = useState<string>('detecting...')
  const [lastUnit, setLastUnit] = useState<{ exitCode: number } | null>(null)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    fetch(`/api/actions/${moduleId}/detect-runner`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId })
    })
      .then(r => r.json())
      .then((res: { output: string }) => setRunner(res.output.trim() || 'none'))
      .catch(() => setRunner('unknown'))
  }, [moduleId, projectId])

  const runQuickCheck = async () => {
    setRunning(true)
    try {
      const res = await fetch(`/api/actions/${moduleId}/run-unit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId })
      })
      const result = await res.json() as { exitCode: number }
      setLastUnit(result)
    } catch {
      setLastUnit({ exitCode: 1 })
    } finally {
      setRunning(false)
    }
  }

  const unitStatus = lastUnit === null ? 'neutral' : lastUnit.exitCode === 0 ? 'good' : 'bad'

  return (
    <div>
      <div class="grid grid-cols-3 gap-4 mb-6">
        <StatusCard
          icon="test-tube"
          label="Test Runner"
          value={runner === 'none' ? 'Not found' : runner}
          status={runner !== 'none' && runner !== 'detecting...' ? 'good' : 'neutral'}
        />
        <StatusCard
          icon="check-circle"
          label="Unit Tests"
          value={lastUnit === null ? 'Not run' : lastUnit.exitCode === 0 ? 'Passing' : 'Failing'}
          status={unitStatus as 'good' | 'bad' | 'neutral'}
        />
        <StatusCard
          icon="shield-check"
          label="Security"
          value="Not scanned"
          status="neutral"
        />
      </div>

      <div class="flex gap-2">
        <ActionButton
          label={running ? 'Running...' : 'Quick Check'}
          variant="primary"
          loading={running}
          onClick={runQuickCheck}
        />
      </div>
    </div>
  )
}

export default definePanel({
  id: 'overview',
  title: 'Overview',
  component: OverviewPanel
})
```

- [ ] **Step 2: Create TestRunner panel**

`modules/mod-qa/panels/TestRunner.tsx`:

```typescript
import { type FunctionComponent } from 'preact'
import { useState } from 'preact/hooks'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { ActionButton, ForgeTerminal } from '@forge-dev/ui'

type TestType = 'unit' | 'e2e' | 'security' | 'load' | 'visual' | 'full'

const TEST_ACTIONS: { type: TestType; actionId: string; label: string; icon: string }[] = [
  { type: 'unit', actionId: 'run-unit', label: 'Unit Tests', icon: 'play' },
  { type: 'e2e', actionId: 'run-e2e', label: 'E2E Tests', icon: 'monitor-check' },
  { type: 'security', actionId: 'security-scan', label: 'Security Scan', icon: 'shield-alert' },
  { type: 'load', actionId: 'load-test', label: 'Load Test', icon: 'gauge' },
  { type: 'visual', actionId: 'visual-regression', label: 'Visual Regression', icon: 'eye' },
  { type: 'full', actionId: 'full-suite', label: 'Full Suite', icon: 'list-checks' },
]

function TestRunnerPanel({ moduleId, projectId }: PanelProps) {
  const [output, setOutput] = useState<string | null>(null)
  const [running, setRunning] = useState<string | null>(null)
  const [exitCode, setExitCode] = useState<number | null>(null)

  const runTest = async (actionId: string) => {
    setRunning(actionId)
    setOutput(null)
    setExitCode(null)
    try {
      const res = await fetch(`/api/actions/${moduleId}/${actionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId })
      })
      const result = await res.json() as { output: string; exitCode: number }
      setOutput(result.output)
      setExitCode(result.exitCode)
    } catch {
      setOutput('Failed to execute test')
      setExitCode(1)
    } finally {
      setRunning(null)
    }
  }

  return (
    <div>
      <div class="flex flex-wrap gap-2 mb-6">
        {TEST_ACTIONS.map(t => (
          <ActionButton
            key={t.actionId}
            label={t.label}
            icon={t.icon}
            variant={running === t.actionId ? 'primary' : 'secondary'}
            loading={running === t.actionId}
            disabled={running !== null && running !== t.actionId}
            onClick={() => runTest(t.actionId)}
          />
        ))}
      </div>

      {exitCode !== null && (
        <div class={`text-sm mb-4 px-3 py-2 rounded-lg ${exitCode === 0 ? 'bg-forge-success/10 text-forge-success' : 'bg-forge-error/10 text-forge-error'}`}>
          {exitCode === 0 ? 'Tests passed' : `Tests failed (exit code ${exitCode})`}
        </div>
      )}

      {output && <ForgeTerminal content={output} height={400} />}
    </div>
  )
}

export default definePanel({
  id: 'test-runner',
  title: 'Test Runner',
  component: TestRunnerPanel
})
```

- [ ] **Step 3: Create panels/index.ts**

`modules/mod-qa/panels/index.ts`:

```typescript
export { default as overview } from './Overview.js'
export { default as testRunner } from './TestRunner.js'
export { default as coverage } from './Coverage.js'
export { default as reports } from './Reports.js'
```

- [ ] **Step 4: Commit**

```bash
git add modules/mod-qa/panels/Overview.tsx modules/mod-qa/panels/TestRunner.tsx modules/mod-qa/panels/index.ts
git commit -m "feat(mod-qa): Overview (status cards) + TestRunner (multi-type executor) panels"
```

---

## Task 4: mod-qa — Coverage + Reports panels

**Files:**
- Create: `modules/mod-qa/panels/Coverage.tsx`
- Create: `modules/mod-qa/panels/Reports.tsx`

- [ ] **Step 1: Create Coverage panel**

`modules/mod-qa/panels/Coverage.tsx`:

```typescript
import { type FunctionComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { EmptyState, ActionButton, StatusCard } from '@forge-dev/ui'

interface CoverageSummary {
  lines: number
  branches: number
  functions: number
  statements: number
}

function CoveragePanel({ moduleId, projectId }: PanelProps) {
  const [coverage, setCoverage] = useState<CoverageSummary | null>(null)
  const [loading, setLoading] = useState(false)

  const runCoverage = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/actions/${moduleId}/run-unit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId })
      })
      const result = await res.json() as { output: string; exitCode: number }

      // Try to parse vitest/jest coverage summary from output
      const lines = result.output.match(/Lines\s*:\s*([\d.]+)%/)
      const branches = result.output.match(/Branches\s*:\s*([\d.]+)%/)
      const functions = result.output.match(/Functions\s*:\s*([\d.]+)%/)
      const stmts = result.output.match(/Statements?\s*:\s*([\d.]+)%/)

      if (lines || stmts) {
        setCoverage({
          lines: lines ? parseFloat(lines[1]) : 0,
          branches: branches ? parseFloat(branches[1]) : 0,
          functions: functions ? parseFloat(functions[1]) : 0,
          statements: stmts ? parseFloat(stmts[1]) : 0
        })
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  if (!coverage) {
    return (
      <EmptyState
        icon="bar-chart-3"
        title="No Coverage Data"
        description="Run unit tests with coverage enabled to see coverage metrics. Add --coverage flag to your test runner."
        action={{ label: loading ? 'Running...' : 'Run with Coverage', onClick: runCoverage }}
      />
    )
  }

  const threshold = (val: number): 'good' | 'warn' | 'bad' =>
    val >= 80 ? 'good' : val >= 50 ? 'warn' : 'bad'

  return (
    <div>
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-medium text-forge-muted">Coverage Summary</h3>
        <ActionButton label="Refresh" variant="secondary" loading={loading} onClick={runCoverage} />
      </div>
      <div class="grid grid-cols-4 gap-4">
        <StatusCard icon="minus" label="Lines" value={`${coverage.lines}%`} status={threshold(coverage.lines)} />
        <StatusCard icon="git-branch" label="Branches" value={`${coverage.branches}%`} status={threshold(coverage.branches)} />
        <StatusCard icon="braces" label="Functions" value={`${coverage.functions}%`} status={threshold(coverage.functions)} />
        <StatusCard icon="file-code" label="Statements" value={`${coverage.statements}%`} status={threshold(coverage.statements)} />
      </div>
    </div>
  )
}

export default definePanel({
  id: 'coverage',
  title: 'Coverage',
  component: CoveragePanel
})
```

- [ ] **Step 2: Create Reports panel**

`modules/mod-qa/panels/Reports.tsx`:

```typescript
import { type FunctionComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { DataList, EmptyState, ActionButton, type DataListItem } from '@forge-dev/ui'

interface ActionLogEntry {
  id: string
  moduleId: string
  actionId: string
  exitCode: number | null
  startedAt: string
  finishedAt: string | null
}

function ReportsPanel({ moduleId }: PanelProps) {
  const [logs, setLogs] = useState<ActionLogEntry[]>([])
  const [loading, setLoading] = useState(true)

  const fetchReports = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/action-logs?moduleId=${moduleId}&limit=30`)
      setLogs(await res.json() as ActionLogEntry[])
    } catch {
      setLogs([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchReports() }, [moduleId])

  if (!loading && logs.length === 0) {
    return (
      <EmptyState
        icon="file-text"
        title="No Test Reports"
        description="Run some tests to see results history here."
      />
    )
  }

  const items: DataListItem[] = logs.map(log => {
    const isPass = log.exitCode === 0
    const isRunning = log.exitCode === null
    return {
      id: log.id,
      title: log.actionId.replace(/-/g, ' ').replace(/^\w/, c => c.toUpperCase()),
      subtitle: log.startedAt,
      badge: {
        label: isRunning ? 'running' : isPass ? 'pass' : 'fail',
        color: isRunning ? 'var(--forge-accent)' : isPass ? 'var(--forge-success)' : 'var(--forge-error)'
      }
    }
  })

  return (
    <div>
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-medium text-forge-muted">{logs.length} test run{logs.length !== 1 ? 's' : ''}</h3>
        <ActionButton label="Refresh" variant="secondary" onClick={fetchReports} />
      </div>
      <DataList items={items} loading={loading} />
    </div>
  )
}

export default definePanel({
  id: 'reports',
  title: 'Reports',
  component: ReportsPanel
})
```

- [ ] **Step 3: Commit**

```bash
git add modules/mod-qa/panels/Coverage.tsx modules/mod-qa/panels/Reports.tsx
git commit -m "feat(mod-qa): Coverage (metrics cards) + Reports (test history) panels"
```

---

## Task 5: mod-design — Package scaffold + manifest + all panels

**Files:**
- Create: `modules/mod-design/package.json`
- Create: `modules/mod-design/tsconfig.json`
- Create: `modules/mod-design/forge-module.json`
- Create: `modules/mod-design/panels/index.ts`
- Create: `modules/mod-design/panels/Designs.tsx`
- Create: `modules/mod-design/panels/Tokens.tsx`
- Create: `modules/mod-design/panels/Wireframes.tsx`
- Create: `modules/mod-design/panels/VisualDiff.tsx`

- [ ] **Step 1: Create package.json**

`modules/mod-design/package.json`:

```json
{
  "name": "@forge-dev/mod-design",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "description": "Figma integration, design tokens, wireframes, visual regression",
  "exports": { "./panels": "./panels/index.ts" },
  "peerDependencies": { "preact": "^10.0.0", "@forge-dev/sdk": "*", "@forge-dev/ui": "*" },
  "devDependencies": { "preact": "^10.0.0", "@forge-dev/sdk": "*", "@forge-dev/ui": "*", "typescript": "^5.8.0" }
}
```

- [ ] **Step 2: Create tsconfig.json**

`modules/mod-design/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": ".", "jsx": "react-jsx", "jsxImportSource": "preact", "lib": ["ES2022", "DOM"] },
  "include": ["panels"]
}
```

- [ ] **Step 3: Create forge-module.json**

`modules/mod-design/forge-module.json`:

```json
{
  "name": "@forge-dev/mod-design",
  "version": "0.1.0",
  "displayName": "Design & UI",
  "description": "Figma integration, design tokens, wireframes, visual regression",
  "icon": "palette",
  "color": "#8b5cf6",
  "panels": [
    { "id": "designs", "title": "Designs", "component": "./panels/Designs", "default": true },
    { "id": "tokens", "title": "Tokens", "component": "./panels/Tokens" },
    { "id": "wireframes", "title": "Wireframes", "component": "./panels/Wireframes" },
    { "id": "visual-diff", "title": "Visual Diff", "component": "./panels/VisualDiff" }
  ],
  "actions": [
    { "id": "export-tokens", "label": "Export Tokens", "icon": "download", "command": "npx style-dictionary build 2>&1 || echo 'Style Dictionary not configured'", "streaming": true, "tags": ["design", "tokens"] },
    { "id": "visual-regression", "label": "Visual Regression", "icon": "eye", "command": "npx lost-pixel 2>&1 || echo 'Lost Pixel not configured'", "streaming": true, "tags": ["design", "visual"] },
    { "id": "list-tokens", "label": "List Tokens", "icon": "list", "command": "find tokens src/tokens -name '*.json' -o -name '*.ts' 2>/dev/null | head -20 || echo ''", "hidden": true },
    { "id": "list-wireframes", "label": "List Wireframes", "icon": "pencil-ruler", "command": "find . -name '*.excalidraw' -o -name '*.excalidraw.json' 2>/dev/null | head -20 || echo ''", "hidden": true }
  ],
  "detectors": [
    { "tool": "figma", "files": [".figma.json", "figma.config.ts"], "suggestion": "Figma configuration found. Import designs in the Design module." },
    { "tool": "style-dictionary", "files": ["tokens", "style-dictionary.config.json"], "suggestion": "Design tokens found. Manage in the Tokens panel." },
    { "tool": "excalidraw", "files": [".excalidraw.json", "wireframes"], "suggestion": "Excalidraw files found. View in Wireframes panel." },
    { "tool": "lost-pixel", "files": ["lost-pixel.config.ts", "lost-pixel.config.js"], "packages": ["lost-pixel"], "suggestion": "Lost Pixel detected. Run visual regression from Design module." }
  ],
  "settings": {
    "schema": {
      "figmaToken": { "type": "string" },
      "exportPath": { "type": "string", "default": "./src/design-tokens" },
      "visualRegressionThreshold": { "type": "number", "default": 5 }
    }
  }
}
```

- [ ] **Step 4: Create Designs panel**

`modules/mod-design/panels/Designs.tsx`:

```typescript
import { type FunctionComponent } from 'preact'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { EmptyState } from '@forge-dev/ui'

function DesignsPanel(_props: PanelProps) {
  return (
    <EmptyState
      icon="palette"
      title="Design Library"
      description="Connect Figma or Penpot to browse and import design frames. Configure the Figma API token in module settings."
    />
  )
}

export default definePanel({ id: 'designs', title: 'Designs', component: DesignsPanel })
```

- [ ] **Step 5: Create Tokens panel**

`modules/mod-design/panels/Tokens.tsx`:

```typescript
import { type FunctionComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { DataList, EmptyState, ActionButton, type DataListItem } from '@forge-dev/ui'

function TokensPanel({ moduleId, projectId }: PanelProps) {
  const [files, setFiles] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  const fetchTokens = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/actions/${moduleId}/list-tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId })
      })
      const result = await res.json() as { output: string }
      setFiles(result.output.trim().split('\n').filter(Boolean))
    } catch {
      setFiles([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchTokens() }, [moduleId, projectId])

  if (!loading && files.length === 0) {
    return (
      <EmptyState
        icon="swatch-book"
        title="No Design Tokens"
        description="Add token files in tokens/ or src/tokens/ directory. Supports Style Dictionary JSON format."
      />
    )
  }

  const items: DataListItem[] = files.map(f => ({
    id: f,
    title: f.split('/').pop() ?? f,
    subtitle: f,
    badge: { label: f.endsWith('.json') ? 'JSON' : 'TS', color: 'var(--forge-accent)' }
  }))

  return (
    <div>
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-medium text-forge-muted">{files.length} token file{files.length !== 1 ? 's' : ''}</h3>
        <ActionButton label="Refresh" variant="secondary" onClick={fetchTokens} />
      </div>
      <DataList items={items} loading={loading} />
    </div>
  )
}

export default definePanel({ id: 'tokens', title: 'Tokens', component: TokensPanel })
```

- [ ] **Step 6: Create Wireframes panel**

`modules/mod-design/panels/Wireframes.tsx`:

```typescript
import { type FunctionComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { DataList, EmptyState, ActionButton, type DataListItem } from '@forge-dev/ui'

function WireframesPanel({ moduleId, projectId }: PanelProps) {
  const [files, setFiles] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  const fetchWireframes = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/actions/${moduleId}/list-wireframes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId })
      })
      const result = await res.json() as { output: string }
      setFiles(result.output.trim().split('\n').filter(Boolean))
    } catch {
      setFiles([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchWireframes() }, [moduleId, projectId])

  if (!loading && files.length === 0) {
    return (
      <EmptyState
        icon="pencil-ruler"
        title="No Wireframes"
        description="Add Excalidraw files (.excalidraw.json) to your project to browse wireframes here."
      />
    )
  }

  const items: DataListItem[] = files.map(f => ({
    id: f,
    title: f.split('/').pop()?.replace('.excalidraw.json', '').replace('.excalidraw', '') ?? f,
    subtitle: f,
    badge: { label: 'excalidraw', color: 'var(--forge-accent)' }
  }))

  return (
    <div>
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-medium text-forge-muted">{files.length} wireframe{files.length !== 1 ? 's' : ''}</h3>
        <ActionButton label="Refresh" variant="secondary" onClick={fetchWireframes} />
      </div>
      <DataList items={items} loading={loading} />
    </div>
  )
}

export default definePanel({ id: 'wireframes', title: 'Wireframes', component: WireframesPanel })
```

- [ ] **Step 7: Create VisualDiff panel**

`modules/mod-design/panels/VisualDiff.tsx`:

```typescript
import { type FunctionComponent } from 'preact'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { EmptyState } from '@forge-dev/ui'

function VisualDiffPanel(_props: PanelProps) {
  return (
    <EmptyState
      icon="eye"
      title="Visual Diff"
      description="Run visual regression tests with Lost Pixel to see pixel-level differences. Configure Lost Pixel and run the Visual Regression action."
    />
  )
}

export default definePanel({ id: 'visual-diff', title: 'Visual Diff', component: VisualDiffPanel })
```

- [ ] **Step 8: Create panels/index.ts**

`modules/mod-design/panels/index.ts`:

```typescript
export { default as designs } from './Designs.js'
export { default as tokens } from './Tokens.js'
export { default as wireframes } from './Wireframes.js'
export { default as visualDiff } from './VisualDiff.js'
```

- [ ] **Step 9: Commit**

```bash
git add modules/mod-design/
git commit -m "feat(mod-design): Design & UI module — Designs, Tokens, Wireframes, VisualDiff panels"
```

---

## Task 6: mod-release — Package scaffold + manifest

**Files:**
- Create: `modules/mod-release/package.json`
- Create: `modules/mod-release/tsconfig.json`
- Create: `modules/mod-release/forge-module.json`

- [ ] **Step 1: Create package.json**

`modules/mod-release/package.json`:

```json
{
  "name": "@forge-dev/mod-release",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "description": "Deploy automation, feature flags, rollback, changelog",
  "exports": { "./panels": "./panels/index.ts" },
  "peerDependencies": { "preact": "^10.0.0", "@forge-dev/sdk": "*", "@forge-dev/ui": "*" },
  "devDependencies": { "preact": "^10.0.0", "@forge-dev/sdk": "*", "@forge-dev/ui": "*", "typescript": "^5.8.0" }
}
```

- [ ] **Step 2: Create tsconfig.json**

`modules/mod-release/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": ".", "jsx": "react-jsx", "jsxImportSource": "preact", "lib": ["ES2022", "DOM"] },
  "include": ["panels"]
}
```

- [ ] **Step 3: Create forge-module.json**

`modules/mod-release/forge-module.json`:

```json
{
  "name": "@forge-dev/mod-release",
  "version": "0.1.0",
  "displayName": "Release & Deploy",
  "description": "Deploy automation, feature flags, rollback, changelog",
  "icon": "rocket",
  "color": "#f59e0b",
  "panels": [
    { "id": "pipeline", "title": "Pipeline", "component": "./panels/Pipeline", "default": true },
    { "id": "environments", "title": "Environments", "component": "./panels/Environments" },
    { "id": "changelog", "title": "Changelog", "component": "./panels/Changelog" },
    { "id": "feature-flags", "title": "Feature Flags", "component": "./panels/FeatureFlags" },
    { "id": "rollback", "title": "Rollback", "component": "./panels/Rollback" }
  ],
  "actions": [
    { "id": "detect-platform", "label": "Detect Platform", "icon": "search", "command": "[ -f vercel.json ] && echo 'vercel' || ([ -f fly.toml ] && echo 'fly' || ([ -f netlify.toml ] && echo 'netlify' || ([ -f railway.json ] && echo 'railway' || ([ -f Dockerfile ] && echo 'docker' || echo 'none'))))", "hidden": true },
    { "id": "generate-changelog", "label": "Generate Changelog", "icon": "scroll-text", "command": "npx git-cliff -o CHANGELOG.md 2>&1 || (npx conventional-changelog -p angular -i CHANGELOG.md -s 2>&1 || echo 'No changelog tool found')", "streaming": true, "tags": ["release", "changelog"] },
    { "id": "bump-version", "label": "Bump Version", "icon": "arrow-up-circle", "command": "npx changeset version 2>&1 || echo 'Changesets not configured'", "streaming": true, "tags": ["release", "version"] },
    { "id": "create-release", "label": "Create Release", "icon": "tag", "command": "VERSION=$(node -p \"require('./package.json').version\" 2>/dev/null || echo 'unknown') && gh release create v$VERSION --generate-notes 2>&1 || echo 'GitHub CLI not available or not in a repo'", "streaming": true, "tags": ["release", "github"] },
    { "id": "deploy", "label": "Deploy", "icon": "rocket", "command": "npx vercel --prod 2>&1 || (fly deploy 2>&1 || (npx netlify deploy --prod 2>&1 || echo 'No deploy platform detected'))", "streaming": true, "tags": ["release", "deploy"] },
    { "id": "list-releases", "label": "List Releases", "icon": "list", "command": "gh release list --limit 10 2>&1 || git tag --sort=-version:refname | head -10 || echo ''", "hidden": true },
    { "id": "read-changelog", "label": "Read Changelog", "icon": "file-text", "command": "cat CHANGELOG.md 2>/dev/null || echo '(No CHANGELOG.md found)'", "hidden": true }
  ],
  "detectors": [
    { "tool": "vercel", "files": ["vercel.json", "vercel.ts", ".vercel"], "suggestion": "Vercel project detected. Deploy from Release module." },
    { "tool": "fly", "files": ["fly.toml"], "suggestion": "Fly.io app detected. Deploy from Release module." },
    { "tool": "netlify", "files": ["netlify.toml"], "suggestion": "Netlify site detected. Deploy from Release module." },
    { "tool": "docker", "files": ["Dockerfile", "docker-compose.yml"], "suggestion": "Docker detected. Build and deploy containers from Release module." },
    { "tool": "changesets", "files": [".changeset"], "packages": ["@changesets/cli"], "suggestion": "Changesets detected. Manage versions from Release module." },
    { "tool": "git-cliff", "files": ["cliff.toml"], "suggestion": "git-cliff detected. Generate changelogs from Release module." }
  ],
  "settings": {
    "schema": {
      "deployPlatform": { "type": "string", "default": "auto" },
      "changelogFormat": { "type": "string", "default": "conventional" },
      "autoPublishNpm": { "type": "boolean", "default": false }
    }
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add modules/mod-release/
git commit -m "feat(mod-release): scaffold module with manifest — 7 actions, 6 detectors"
```

---

## Task 7: mod-release — Pipeline + Environments + Changelog panels

**Files:**
- Create: `modules/mod-release/panels/index.ts`
- Create: `modules/mod-release/panels/Pipeline.tsx`
- Create: `modules/mod-release/panels/Environments.tsx`
- Create: `modules/mod-release/panels/Changelog.tsx`

- [ ] **Step 1: Create Pipeline panel**

`modules/mod-release/panels/Pipeline.tsx`:

```typescript
import { type FunctionComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { StatusCard, ActionButton } from '@forge-dev/ui'

function PipelinePanel({ moduleId, projectId }: PanelProps) {
  const [platform, setPlatform] = useState<string>('detecting...')

  useEffect(() => {
    fetch(`/api/actions/${moduleId}/detect-platform`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId })
    })
      .then(r => r.json())
      .then((res: { output: string }) => setPlatform(res.output.trim() || 'none'))
      .catch(() => setPlatform('unknown'))
  }, [moduleId, projectId])

  const [deploying, setDeploying] = useState(false)
  const [deployResult, setDeployResult] = useState<string | null>(null)

  const runDeploy = async () => {
    setDeploying(true)
    setDeployResult(null)
    try {
      const res = await fetch(`/api/actions/${moduleId}/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId })
      })
      const result = await res.json() as { exitCode: number; output: string }
      setDeployResult(result.exitCode === 0 ? 'Deploy successful' : `Deploy failed: ${result.output.slice(0, 200)}`)
    } catch {
      setDeployResult('Deploy failed')
    } finally {
      setDeploying(false)
    }
  }

  return (
    <div>
      <div class="grid grid-cols-3 gap-4 mb-6">
        <StatusCard
          icon="cloud"
          label="Platform"
          value={platform === 'none' ? 'Not detected' : platform}
          status={platform !== 'none' && platform !== 'detecting...' ? 'good' : 'neutral'}
        />
        <StatusCard
          icon="git-branch"
          label="Branch"
          value="current"
          status="neutral"
        />
        <StatusCard
          icon="rocket"
          label="Last Deploy"
          value={deployResult ? (deployResult.includes('successful') ? 'Success' : 'Failed') : 'N/A'}
          status={deployResult ? (deployResult.includes('successful') ? 'good' : 'bad') : 'neutral'}
        />
      </div>

      <ActionButton
        label={deploying ? 'Deploying...' : 'Deploy Now'}
        variant="primary"
        loading={deploying}
        onClick={runDeploy}
      />

      {deployResult && (
        <div class={`mt-4 text-sm px-3 py-2 rounded-lg ${deployResult.includes('successful') ? 'bg-forge-success/10 text-forge-success' : 'bg-forge-error/10 text-forge-error'}`}>
          {deployResult}
        </div>
      )}
    </div>
  )
}

export default definePanel({ id: 'pipeline', title: 'Pipeline', component: PipelinePanel })
```

- [ ] **Step 2: Create Environments panel**

`modules/mod-release/panels/Environments.tsx`:

```typescript
import { type FunctionComponent } from 'preact'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { StatusCard } from '@forge-dev/ui'

function EnvironmentsPanel(_props: PanelProps) {
  return (
    <div>
      <h3 class="text-sm font-medium text-forge-muted mb-4">Environments</h3>
      <div class="grid grid-cols-3 gap-4">
        <StatusCard icon="code" label="Development" value="Local" status="good" />
        <StatusCard icon="eye" label="Preview" value="Not configured" status="neutral" />
        <StatusCard icon="globe" label="Production" value="Not configured" status="neutral" />
      </div>
      <p class="text-xs text-forge-muted mt-4">
        Deploy platform detection configures environments automatically. Run "Deploy" to set up.
      </p>
    </div>
  )
}

export default definePanel({ id: 'environments', title: 'Environments', component: EnvironmentsPanel })
```

- [ ] **Step 3: Create Changelog panel**

`modules/mod-release/panels/Changelog.tsx`:

```typescript
import { type FunctionComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { EmptyState, ActionButton } from '@forge-dev/ui'

function ChangelogPanel({ moduleId, projectId }: PanelProps) {
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchChangelog = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/actions/${moduleId}/read-changelog`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId })
      })
      const result = await res.json() as { output: string }
      setContent(result.output)
    } catch {
      setContent(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchChangelog() }, [moduleId, projectId])

  if (loading) return <div class="animate-pulse h-40 bg-forge-surface rounded-lg" />

  if (!content || content.includes('No CHANGELOG.md found')) {
    return (
      <EmptyState
        icon="scroll-text"
        title="No Changelog"
        description="Generate a changelog from your git history using git-cliff or conventional-changelog."
      />
    )
  }

  return (
    <div>
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-medium text-forge-muted">CHANGELOG.md</h3>
        <ActionButton label="Refresh" variant="secondary" onClick={fetchChangelog} />
      </div>
      <pre class="p-4 rounded-lg bg-forge-surface border border-forge-border text-sm font-mono overflow-auto max-h-96 whitespace-pre-wrap">
        {content}
      </pre>
    </div>
  )
}

export default definePanel({ id: 'changelog', title: 'Changelog', component: ChangelogPanel })
```

- [ ] **Step 4: Create panels/index.ts**

`modules/mod-release/panels/index.ts`:

```typescript
export { default as pipeline } from './Pipeline.js'
export { default as environments } from './Environments.js'
export { default as changelog } from './Changelog.js'
export { default as featureFlags } from './FeatureFlags.js'
export { default as rollback } from './Rollback.js'
```

- [ ] **Step 5: Commit**

```bash
git add modules/mod-release/panels/Pipeline.tsx modules/mod-release/panels/Environments.tsx modules/mod-release/panels/Changelog.tsx modules/mod-release/panels/index.ts
git commit -m "feat(mod-release): Pipeline (deploy status), Environments (status cards), Changelog panels"
```

---

## Task 8: mod-release — FeatureFlags + Rollback panels

**Files:**
- Create: `modules/mod-release/panels/FeatureFlags.tsx`
- Create: `modules/mod-release/panels/Rollback.tsx`

- [ ] **Step 1: Create FeatureFlags panel**

`modules/mod-release/panels/FeatureFlags.tsx`:

```typescript
import { type FunctionComponent } from 'preact'
import { useState } from 'preact/hooks'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { EmptyState, ActionButton, ToggleSwitch } from '@forge-dev/ui'

interface Flag {
  id: string
  name: string
  enabled: boolean
  description: string
}

function FeatureFlagsPanel(_props: PanelProps) {
  const [flags, setFlags] = useState<Flag[]>([
    { id: 'dark-mode', name: 'Dark Mode', enabled: true, description: 'Enable dark mode toggle for users' },
    { id: 'new-dashboard', name: 'New Dashboard', enabled: false, description: 'Beta dashboard layout' },
    { id: 'api-v2', name: 'API v2', enabled: false, description: 'Route traffic to v2 API endpoints' },
  ])
  const [connected, setConnected] = useState(false)

  const toggleFlag = (flagId: string) => {
    setFlags(prev => prev.map(f =>
      f.id === flagId ? { ...f, enabled: !f.enabled } : f
    ))
  }

  if (!connected) {
    return (
      <div>
        <EmptyState
          icon="toggle-right"
          title="Feature Flags"
          description="Connect Flipt or a feature flag service to manage flags remotely. For now, use local flags below."
          action={{ label: 'Use Local Flags', onClick: () => setConnected(true) }}
        />
      </div>
    )
  }

  return (
    <div>
      <h3 class="text-sm font-medium text-forge-muted mb-4">{flags.length} flag{flags.length !== 1 ? 's' : ''}</h3>
      <div class="space-y-3">
        {flags.map(flag => (
          <div key={flag.id} class="flex items-center justify-between p-3 rounded-lg bg-forge-surface border border-forge-border">
            <div>
              <div class="font-medium text-sm">{flag.name}</div>
              <div class="text-xs text-forge-muted">{flag.description}</div>
            </div>
            <ToggleSwitch checked={flag.enabled} onChange={() => toggleFlag(flag.id)} />
          </div>
        ))}
      </div>
    </div>
  )
}

export default definePanel({ id: 'feature-flags', title: 'Feature Flags', component: FeatureFlagsPanel })
```

- [ ] **Step 2: Create Rollback panel**

`modules/mod-release/panels/Rollback.tsx`:

```typescript
import { type FunctionComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { DataList, EmptyState, ActionButton, type DataListItem } from '@forge-dev/ui'

interface ReleaseEntry {
  tag: string
  date: string
  title: string
}

function RollbackPanel({ moduleId, projectId }: PanelProps) {
  const [releases, setReleases] = useState<ReleaseEntry[]>([])
  const [loading, setLoading] = useState(true)

  const fetchReleases = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/actions/${moduleId}/list-releases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId })
      })
      const result = await res.json() as { output: string; exitCode: number }
      const lines = result.output.trim().split('\n').filter(Boolean)
      const parsed: ReleaseEntry[] = lines.map(line => {
        const parts = line.split('\t')
        return {
          tag: parts[0] ?? line,
          title: parts[1] ?? '',
          date: parts[2] ?? ''
        }
      })
      setReleases(parsed)
    } catch {
      setReleases([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchReleases() }, [moduleId, projectId])

  if (!loading && releases.length === 0) {
    return (
      <EmptyState
        icon="history"
        title="No Releases"
        description="Create releases using GitHub CLI or git tags. They will appear here for rollback."
      />
    )
  }

  const items: DataListItem[] = releases.map((r, i) => ({
    id: r.tag,
    title: r.tag,
    subtitle: r.title || r.date,
    badge: i === 0 ? { label: 'latest', color: 'var(--forge-success)' } : { label: 'previous' }
  }))

  return (
    <div>
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-medium text-forge-muted">{releases.length} release{releases.length !== 1 ? 's' : ''}</h3>
        <ActionButton label="Refresh" variant="secondary" onClick={fetchReleases} />
      </div>
      <DataList items={items} loading={loading} />
    </div>
  )
}

export default definePanel({ id: 'rollback', title: 'Rollback', component: RollbackPanel })
```

- [ ] **Step 3: Commit**

```bash
git add modules/mod-release/panels/FeatureFlags.tsx modules/mod-release/panels/Rollback.tsx
git commit -m "feat(mod-release): FeatureFlags (toggles) + Rollback (release history) panels"
```

---

## Task 9: Console — Register all 3 modules

**Files:**
- Modify: `packages/console/package.json`
- Modify: `packages/console/src/panels/registry.ts`

- [ ] **Step 1: Add module deps to console package.json**

Add to `dependencies` in `packages/console/package.json`:

```json
    "@forge-dev/mod-qa": "*",
    "@forge-dev/mod-design": "*",
    "@forge-dev/mod-release": "*"
```

- [ ] **Step 2: Register panels in registry.ts**

Add to the bottom of `packages/console/src/panels/registry.ts`:

```typescript
import { overview, testRunner, coverage, reports } from '@forge-dev/mod-qa/panels'
import { designs, tokens, wireframes, visualDiff } from '@forge-dev/mod-design/panels'
import { pipeline, environments, changelog, featureFlags, rollback } from '@forge-dev/mod-release/panels'

registerPanels('mod-qa', [overview, testRunner, coverage, reports])
registerPanels('mod-design', [designs, tokens, wireframes, visualDiff])
registerPanels('mod-release', [pipeline, environments, changelog, featureFlags, rollback])
```

- [ ] **Step 3: Install and build**

Run: `npm install && npx turbo build --filter=@forge-dev/console`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add packages/console/
git commit -m "feat(console): register mod-qa, mod-design, mod-release panels"
```

---

## Task 10: Integration tests — all 3 modules + full Phase 2a

**Files:**
- Create: `tests/integration/mod-qa.test.ts`
- Create: `tests/integration/mod-design.test.ts`
- Create: `tests/integration/mod-release.test.ts`
- Create: `tests/integration/phase2a-modules.test.ts`

- [ ] **Step 1: Create mod-qa test**

`tests/integration/mod-qa.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createForgeServer } from '@forge-dev/core'
import { mkdirSync, rmSync, cpSync } from 'node:fs'
import { join } from 'node:path'

const TEST_DIR = join(import.meta.dirname, '../.test-mod-qa')
const MODULES_DIR = join(TEST_DIR, 'modules')

describe('mod-qa integration', () => {
  let server: ReturnType<typeof createForgeServer>

  beforeAll(() => {
    mkdirSync(MODULES_DIR, { recursive: true })
    const modDest = join(MODULES_DIR, 'mod-qa')
    mkdirSync(modDest, { recursive: true })
    cpSync(join(import.meta.dirname, '../../modules/mod-qa/forge-module.json'), join(modDest, 'forge-module.json'))
    server = createForgeServer({ dataDir: TEST_DIR })
  })

  afterAll(() => { server.close(); rmSync(TEST_DIR, { recursive: true, force: true }) })

  it('discovers mod-qa with correct displayName', async () => {
    const res = await server.fetch('/api/modules/available')
    const modules = await res.json() as { name: string; displayName: string }[]
    const mod = modules.find(m => m.name === '@forge-dev/mod-qa')
    expect(mod).toBeDefined()
    expect(mod!.displayName).toBe('Quality Assurance')
  })

  it('has 4 panels', async () => {
    const res = await server.fetch('/api/modules/available')
    const modules = await res.json() as { name: string; panels: { id: string }[] }[]
    const mod = modules.find(m => m.name === '@forge-dev/mod-qa')!
    expect(mod.panels.map(p => p.id)).toEqual(['overview', 'test-runner', 'coverage', 'reports'])
  })

  it('runs detect-runner hidden action', async () => {
    const res = await server.fetch('/api/actions/mod-qa/detect-runner', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: null })
    })
    expect(res.status).toBe(200)
    const result = await res.json() as { exitCode: number }
    expect(typeof result.exitCode).toBe('number')
  })
})
```

- [ ] **Step 2: Create mod-design test**

`tests/integration/mod-design.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createForgeServer } from '@forge-dev/core'
import { mkdirSync, rmSync, cpSync } from 'node:fs'
import { join } from 'node:path'

const TEST_DIR = join(import.meta.dirname, '../.test-mod-design')
const MODULES_DIR = join(TEST_DIR, 'modules')

describe('mod-design integration', () => {
  let server: ReturnType<typeof createForgeServer>

  beforeAll(() => {
    mkdirSync(MODULES_DIR, { recursive: true })
    const modDest = join(MODULES_DIR, 'mod-design')
    mkdirSync(modDest, { recursive: true })
    cpSync(join(import.meta.dirname, '../../modules/mod-design/forge-module.json'), join(modDest, 'forge-module.json'))
    server = createForgeServer({ dataDir: TEST_DIR })
  })

  afterAll(() => { server.close(); rmSync(TEST_DIR, { recursive: true, force: true }) })

  it('discovers mod-design', async () => {
    const res = await server.fetch('/api/modules/available')
    const modules = await res.json() as { name: string; displayName: string }[]
    const mod = modules.find(m => m.name === '@forge-dev/mod-design')
    expect(mod).toBeDefined()
    expect(mod!.displayName).toBe('Design & UI')
  })

  it('has 4 panels', async () => {
    const res = await server.fetch('/api/modules/available')
    const modules = await res.json() as { name: string; panels: { id: string }[] }[]
    const mod = modules.find(m => m.name === '@forge-dev/mod-design')!
    expect(mod.panels.map(p => p.id)).toEqual(['designs', 'tokens', 'wireframes', 'visual-diff'])
  })

  it('runs list-tokens hidden action', async () => {
    const res = await server.fetch('/api/actions/mod-design/list-tokens', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: null })
    })
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 3: Create mod-release test**

`tests/integration/mod-release.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createForgeServer } from '@forge-dev/core'
import { mkdirSync, rmSync, cpSync } from 'node:fs'
import { join } from 'node:path'

const TEST_DIR = join(import.meta.dirname, '../.test-mod-release')
const MODULES_DIR = join(TEST_DIR, 'modules')

describe('mod-release integration', () => {
  let server: ReturnType<typeof createForgeServer>

  beforeAll(() => {
    mkdirSync(MODULES_DIR, { recursive: true })
    const modDest = join(MODULES_DIR, 'mod-release')
    mkdirSync(modDest, { recursive: true })
    cpSync(join(import.meta.dirname, '../../modules/mod-release/forge-module.json'), join(modDest, 'forge-module.json'))
    server = createForgeServer({ dataDir: TEST_DIR })
  })

  afterAll(() => { server.close(); rmSync(TEST_DIR, { recursive: true, force: true }) })

  it('discovers mod-release', async () => {
    const res = await server.fetch('/api/modules/available')
    const modules = await res.json() as { name: string; displayName: string }[]
    const mod = modules.find(m => m.name === '@forge-dev/mod-release')
    expect(mod).toBeDefined()
    expect(mod!.displayName).toBe('Release & Deploy')
  })

  it('has 5 panels', async () => {
    const res = await server.fetch('/api/modules/available')
    const modules = await res.json() as { name: string; panels: { id: string }[] }[]
    const mod = modules.find(m => m.name === '@forge-dev/mod-release')!
    expect(mod.panels.map(p => p.id)).toEqual(['pipeline', 'environments', 'changelog', 'feature-flags', 'rollback'])
  })

  it('runs detect-platform hidden action', async () => {
    const res = await server.fetch('/api/actions/mod-release/detect-platform', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: null })
    })
    expect(res.status).toBe(200)
    const result = await res.json() as { output: string }
    expect(typeof result.output).toBe('string')
  })
})
```

- [ ] **Step 4: Create Phase 2a full integration test**

`tests/integration/phase2a-modules.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createForgeServer } from '@forge-dev/core'
import { mkdirSync, rmSync, cpSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const TEST_DIR = join(import.meta.dirname, '../.test-phase2a')
const MODULES_DIR = join(TEST_DIR, 'modules')
const MODULE_NAMES = ['mod-qa', 'mod-design', 'mod-release']

describe('Phase 2a: All ecosystem modules', () => {
  let server: ReturnType<typeof createForgeServer>

  beforeAll(() => {
    mkdirSync(MODULES_DIR, { recursive: true })
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

  afterAll(() => { server.close(); rmSync(TEST_DIR, { recursive: true, force: true }) })

  it('discovers all 3 Phase 2a modules', async () => {
    const res = await server.fetch('/api/modules/available')
    const modules = await res.json() as { name: string }[]
    const names = modules.map(m => m.name)
    expect(names).toContain('@forge-dev/mod-qa')
    expect(names).toContain('@forge-dev/mod-design')
    expect(names).toContain('@forge-dev/mod-release')
  })

  it('total panels across 3 modules is 13', async () => {
    const res = await server.fetch('/api/modules/available')
    const modules = await res.json() as { panels: { id: string }[] }[]
    const totalPanels = modules.reduce((sum, m) => sum + m.panels.length, 0)
    expect(totalPanels).toBe(13)
  })

  it('each module has detectors defined', async () => {
    const res = await server.fetch('/api/modules/available')
    const modules = await res.json() as { name: string; detectors?: { tool: string }[] }[]
    for (const mod of modules) {
      expect(mod.detectors).toBeDefined()
      expect(mod.detectors!.length).toBeGreaterThan(0)
    }
  })
})
```

- [ ] **Step 5: Run all tests**

Run: `npx vitest run tests/integration/ && npx turbo test --filter=@forge-dev/core`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add tests/integration/
git commit -m "test: Phase 2a integration tests — mod-qa, mod-design, mod-release + full integration"
```

---

## Summary

| # | Task | Files | Tests |
|---|------|-------|-------|
| 1 | UI: ToggleSwitch | 2 | Build |
| 2 | mod-qa: scaffold + manifest | 3 | Build |
| 3 | mod-qa: Overview + TestRunner | 3 | Build |
| 4 | mod-qa: Coverage + Reports | 2 | Build |
| 5 | mod-design: full module (4 panels) | 8 | Build |
| 6 | mod-release: scaffold + manifest | 3 | Build |
| 7 | mod-release: Pipeline + Environments + Changelog | 4 | Build |
| 8 | mod-release: FeatureFlags + Rollback | 2 | Build |
| 9 | Console: register 3 modules | 2 | Build |
| 10 | Integration tests | 4 | 12 integration |

**Totals: 10 tasks, ~33 files, 13 new panel components, 12 integration tests**

After Phase 2a: Dashboard shows 7 modules total (4 from Phase 1 + 3 new). QA module runs tests. Design shows tokens and wireframes. Release deploys and manages changelogs/flags. Phase 2b (team mode) is a separate plan.
