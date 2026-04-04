# Multi-Session Terminal Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow opening multiple CW sessions as tabs, each with a persistent terminal, switchable without losing state.

**Architecture:** App component manages `openTabs[]` and `activeTabIndex`. All open terminals render simultaneously (display:none for inactive). Shell logo navigates to list. Closing tab kills PTY via new API endpoint. Max 5 tabs.

**Tech Stack:** Preact, Hono, existing PTYManager/ForgeTerminal

**Spec:** `docs/superpowers/specs/2026-04-04-multi-session-tabs-design.md`

---

### Task 1: Add kill endpoint to server

**Files:**
- Modify: `packages/core/src/server.ts`

- [ ] **Step 1: Add the kill endpoint**

In `packages/core/src/server.ts`, add this route after the line `const terminalWss = createTerminalWss(ptyManager, cwReader)` (line 46) and before `async function resolveAction`:

```typescript
  app.post('/api/cw/terminal/kill', async (c) => {
    const { project, sessionDir } = await c.req.json<{ project: string; sessionDir: string }>()
    const sessionId = `${project}::${sessionDir}`
    ptyManager.kill(sessionId)
    return c.json({ ok: true })
  })
```

- [ ] **Step 2: Verify build**

```bash
cd /Users/joselito/Workspace/personal/forge/.tasks/initial/packages/core
npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/server.ts
git commit -m "feat(core): add POST /api/cw/terminal/kill endpoint to kill PTY by session"
```

---

### Task 2: Make Shell logo clickable

**Files:**
- Modify: `packages/console/src/shell.tsx`

- [ ] **Step 1: Add onLogoClick prop to Shell**

Replace the full content of `packages/console/src/shell.tsx`:

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
  fullHeight?: boolean
  onLogoClick?: () => void
}

export const Shell: FunctionComponent<ShellProps> = ({ children, fullHeight, onLogoClick }) => {
  return (
    <div class={fullHeight ? 'h-screen flex flex-col bg-forge-bg text-forge-text overflow-hidden' : 'min-h-screen bg-forge-bg text-forge-text'}>
      <header class="h-14 flex items-center justify-between px-6 backdrop-blur-sm sticky top-0 z-50 shrink-0" style={{ borderBottom: '1px solid var(--forge-ghost-border)', backgroundColor: 'var(--forge-surface)' }}>
        <div
          class="flex items-center gap-2.5 cursor-pointer"
          onClick={onLogoClick}
          role={onLogoClick ? 'button' : undefined}
        >
          <span class="text-xl select-none" aria-hidden="true">&#128293;</span>
          <h1 class="text-lg font-bold tracking-tight bg-gradient-to-r from-forge-accent to-forge-warning bg-clip-text text-transparent">
            Forge
          </h1>
        </div>
        <div class="flex items-center gap-3">
          <button
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-forge-muted hover:text-forge-text hover:bg-forge-surface border border-transparent hover:border-forge-border transition-all"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme.value === 'dark' ? 'light' : 'dark'} mode`}
          >
            <span class="text-sm">{theme.value === 'dark' ? '\u2600\uFE0F' : '\uD83C\uDF19'}</span>
            <span>{theme.value === 'dark' ? 'Light' : 'Dark'}</span>
          </button>
        </div>
      </header>
      {fullHeight ? (
        <main class="flex-1 min-h-0 overflow-hidden">
          {children}
        </main>
      ) : (
        <main class="max-w-4xl mx-auto px-6 py-8">
          {children}
        </main>
      )}
      <ToastContainer />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/console/src/shell.tsx
git commit -m "feat(console): make Forge logo clickable with onLogoClick prop"
```

---

### Task 3: Create TabBar component

**Files:**
- Create: `packages/console/src/components/TabBar.tsx`

- [ ] **Step 1: Create the TabBar component**

Create `packages/console/src/components/TabBar.tsx`:

```typescript
import { type FunctionComponent } from 'preact'
import type { CWSession } from '@forge-dev/core'

const TYPE_COLORS: Record<string, string> = {
  task: '#d97706',
  review: '#2563eb',
}

interface TabBarProps {
  tabs: CWSession[]
  activeIndex: number
  onActivate: (index: number) => void
  onClose: (index: number) => void
}

const tabKey = (s: CWSession) => `${s.project}::${s.task ?? s.pr}`
const tabLabel = (s: CWSession) => s.type === 'review' ? `PR #${s.pr}` : (s.task ?? 'unknown')

export const TabBar: FunctionComponent<TabBarProps> = ({ tabs, activeIndex, onActivate, onClose }) => {
  if (tabs.length === 0) return null

  return (
    <div
      class="flex items-center shrink-0 overflow-x-auto px-2 gap-0.5"
      style={{ borderBottom: '1px solid var(--forge-ghost-border)', backgroundColor: 'var(--forge-surface)' }}
    >
      {tabs.map((session, i) => {
        const isActive = i === activeIndex
        const color = TYPE_COLORS[session.type] ?? TYPE_COLORS.task
        return (
          <div
            key={tabKey(session)}
            class="flex items-center gap-1.5 px-3 py-2 text-xs cursor-pointer shrink-0 border-b-2 transition-colors"
            style={{
              borderBottomColor: isActive ? color : 'transparent',
              color: isActive ? 'var(--forge-text)' : 'var(--forge-muted)',
            }}
            onClick={() => onActivate(i)}
          >
            <span class="font-medium truncate max-w-[120px]">{tabLabel(session)}</span>
            <span class="text-[10px] opacity-60 truncate max-w-[80px]">({session.project})</span>
            <button
              class="ml-1 w-4 h-4 flex items-center justify-center rounded hover:bg-forge-surface text-forge-muted hover:text-forge-text transition-colors text-[10px]"
              onClick={(e: Event) => { e.stopPropagation(); onClose(i) }}
              title="Close tab"
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/console/src/components/TabBar.tsx
git commit -m "feat(console): add TabBar component for multi-session tabs"
```

---

### Task 4: Rewrite App with tab state management

**Files:**
- Modify: `packages/console/src/app.tsx`

- [ ] **Step 1: Rewrite app.tsx with tab logic**

Replace the full content of `packages/console/src/app.tsx`:

```typescript
import { render } from 'preact'
import { useState, useEffect, useMemo, useCallback } from 'preact/hooks'
import { Shell } from './shell.js'
import { TaskList } from './pages/TaskList.js'
import { TaskDetail } from './pages/TaskDetail.js'
import { NewTask } from './pages/NewTask.js'
import { CreateProjectModal } from './pages/CreateProjectModal.js'
import { TabBar } from './components/TabBar.js'
import { EmptyState, showToast } from '@forge-dev/ui'
import type { CWSession } from '@forge-dev/core'
import './styles/theme.css'
import 'virtual:uno.css'

const MAX_TABS = 5

const sessionKey = (s: CWSession) => `${s.project}::${s.task ?? s.pr}`

function App() {
  const [spaces, setSpaces] = useState<CWSession[]>([])
  const [projects, setProjects] = useState<Record<string, { path: string; account: string }>>({})
  const [accounts, setAccounts] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  // Tab state
  const [openTabs, setOpenTabs] = useState<CWSession[]>([])
  const [activeTabIndex, setActiveTabIndex] = useState(0)
  const [showList, setShowList] = useState(true) // true = list view, false = tabs view

  // Sub-views within list
  const [listView, setListView] = useState<'list' | 'new-task'>('list')
  const [newTaskType, setNewTaskType] = useState<string | undefined>()

  // Filter state
  const [filterAccount, setFilterAccount] = useState<string | null>(null)
  const [filterProject, setFilterProject] = useState<string | null>(null)
  const [filterType, setFilterType] = useState<string | null>(null)
  const [showDone, setShowDone] = useState(false)

  // Create Project modal
  const [showCreateProject, setShowCreateProject] = useState(false)

  const fetchData = async (delay?: number) => {
    if (delay) await new Promise(r => setTimeout(r, delay))
    try {
      const [spacesRes, projectsRes, accountsRes] = await Promise.all([
        fetch('/api/cw/spaces'),
        fetch('/api/cw/projects'),
        fetch('/api/cw/accounts'),
      ])
      setSpaces(await spacesRes.json() as CWSession[])
      setProjects(await projectsRes.json() as Record<string, { path: string; account: string }>)
      setAccounts(await accountsRes.json() as string[])
    } catch {
      // server not ready
    } finally {
      setLoading(false)
    }
  }

  const refreshAfterAction = () => {
    fetchData(500)
    setTimeout(() => fetchData(), 2000)
  }

  useEffect(() => { fetchData() }, [])

  const hasProjects = Object.keys(projects).length > 0

  const accountNames = useMemo(() => {
    if (accounts.length > 0) return accounts
    const names = new Set<string>()
    for (const s of spaces) if (s.account) names.add(s.account)
    return Array.from(names).sort()
  }, [accounts, spaces])

  const projectNames = useMemo(() => {
    const names = new Set<string>()
    for (const s of spaces) {
      if (filterAccount && s.account !== filterAccount) continue
      names.add(s.project)
    }
    return Array.from(names).sort()
  }, [spaces, filterAccount])

  const handleFilterAccount = (account: string | null) => {
    setFilterAccount(account)
    if (account && filterProject) {
      const proj = projects[filterProject]
      if (proj && proj.account !== account) setFilterProject(null)
    }
  }

  const filteredSpaces = useMemo(() => {
    return spaces.filter(s => {
      if (filterAccount && s.account !== filterAccount) return false
      if (filterProject && s.project !== filterProject) return false
      if (filterType) {
        if (filterType === 'dev' && s.type !== 'task') return false
        if (filterType === 'review' && s.type !== 'review') return false
        if (filterType === 'design' || filterType === 'plan') return false
      }
      if (!showDone && s.status === 'done') return false
      return true
    })
  }, [spaces, filterAccount, filterProject, filterType, showDone])

  // --- Tab operations ---

  const openTab = useCallback((session: CWSession) => {
    const key = sessionKey(session)
    const existingIndex = openTabs.findIndex(t => sessionKey(t) === key)
    if (existingIndex >= 0) {
      setActiveTabIndex(existingIndex)
    } else {
      if (openTabs.length >= MAX_TABS) {
        showToast(`Max ${MAX_TABS} tabs open`, 'error')
        return
      }
      setOpenTabs(prev => [...prev, session])
      setActiveTabIndex(openTabs.length) // new tab is last
    }
    setShowList(false)
  }, [openTabs])

  const closeTab = useCallback(async (index: number) => {
    const session = openTabs[index]
    if (!session) return

    // Kill PTY
    const sessionDir = session.type === 'review' ? `review-pr-${session.pr}` : `task-${session.task}`
    try {
      await fetch('/api/cw/terminal/kill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: session.project, sessionDir })
      })
    } catch {}

    const newTabs = openTabs.filter((_, i) => i !== index)
    setOpenTabs(newTabs)

    if (newTabs.length === 0) {
      setShowList(true)
      setActiveTabIndex(0)
      fetchData()
    } else {
      setActiveTabIndex(Math.min(index, newTabs.length - 1))
    }
  }, [openTabs])

  const goToList = useCallback(() => {
    setShowList(true)
    setListView('list')
    fetchData()
  }, [])

  const handleNewTask = (type?: string) => {
    setNewTaskType(type)
    setListView('new-task')
  }

  // --- Render ---

  if (showList || openTabs.length === 0) {
    return (
      <Shell onLogoClick={goToList}>
        {loading ? (
          <div class="py-20 text-center text-forge-muted">Loading...</div>
        ) : !hasProjects ? (
          <EmptyState
            icon="&#128296;"
            title="Welcome to Forge"
            description="No projects found in CW. Register a project with 'cw open <project>' or create one with 'cw create' first."
          />
        ) : listView === 'list' ? (
          <>
            <TaskList
              spaces={filteredSpaces}
              allSpaces={spaces}
              loading={loading}
              onNewTask={handleNewTask}
              onCreateProject={() => setShowCreateProject(true)}
              onSelectTask={openTab}
              onRefresh={() => fetchData()}
              accountNames={accountNames}
              filterAccount={filterAccount}
              onFilterAccount={handleFilterAccount}
              projectNames={projectNames}
              filterProject={filterProject}
              onFilterProject={setFilterProject}
              filterType={filterType}
              onFilterType={setFilterType}
              showDone={showDone}
              onShowDone={setShowDone}
            />
            <CreateProjectModal
              open={showCreateProject}
              accounts={accountNames}
              onClose={() => setShowCreateProject(false)}
              onCreated={() => { setShowCreateProject(false); refreshAfterAction() }}
            />
          </>
        ) : listView === 'new-task' ? (
          <NewTask
            projects={projects}
            accounts={accountNames}
            initialType={newTaskType}
            onBack={() => setListView('list')}
            onCreated={() => { setListView('list'); refreshAfterAction() }}
          />
        ) : null}
      </Shell>
    )
  }

  // --- Tabs view ---
  return (
    <Shell fullHeight onLogoClick={goToList}>
      <div class="flex flex-col h-full">
        <TabBar
          tabs={openTabs}
          activeIndex={activeTabIndex}
          onActivate={setActiveTabIndex}
          onClose={closeTab}
        />
        <div class="flex-1 min-h-0 relative">
          {openTabs.map((session, i) => (
            <div
              key={sessionKey(session)}
              style={{
                display: i === activeTabIndex ? 'flex' : 'none',
                flexDirection: 'column',
                height: '100%',
              }}
            >
              <TaskDetail
                session={session}
                onClose={() => closeTab(i)}
                onDone={() => { closeTab(i); refreshAfterAction() }}
              />
            </div>
          ))}
        </div>
      </div>
    </Shell>
  )
}

render(<App />, document.getElementById('app')!)
```

- [ ] **Step 2: Commit**

```bash
git add packages/console/src/app.tsx
git commit -m "feat(console): rewrite App with multi-tab state — open/close/activate/max 5"
```

---

### Task 5: Update TaskDetail — onClose replaces onBack

**Files:**
- Modify: `packages/console/src/pages/TaskDetail.tsx`

- [ ] **Step 1: Update TaskDetail props and close behavior**

Replace the full content of `packages/console/src/pages/TaskDetail.tsx`:

```typescript
import { type FunctionComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { ActionButton, Badge, ForgeTerminal, showToast } from '@forge-dev/ui'
import type { CWSession } from '@forge-dev/core'

interface TaskDetailProps {
  session: CWSession
  onClose: () => void
  onDone: () => void
}

export const TaskDetail: FunctionComponent<TaskDetailProps> = ({ session, onClose, onDone }) => {
  const [gitLog, setGitLog] = useState<string>('')
  const [gitDiff, setGitDiff] = useState<string>('')
  const [gitStatus, setGitStatus] = useState<string>('')
  const [notes, setNotes] = useState<string>('')
  const [branch, setBranch] = useState<string>('')
  const [ptyExited, setPtyExited] = useState(false)
  const [connected, setConnected] = useState(false)
  const [wsKey, setWsKey] = useState(0)
  const [infoExpanded, setInfoExpanded] = useState(false)

  const sessionDir = session.type === 'review' ? `review-pr-${session.pr}` : `task-${session.task}`
  const taskName = session.type === 'review' ? `PR #${session.pr}` : session.task
  const typeLabel = session.type === 'review' ? 'REVIEW' : 'DEV'
  const typeColor = session.type === 'review' ? 'var(--forge-accent)' : 'var(--forge-warning)'

  const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsUrl = `${wsProto}//${window.location.host}/ws/terminal/${session.project}/${sessionDir}?k=${wsKey}`

  const fetchData = async () => {
    const [logRes, diffRes, statusRes, notesRes] = await Promise.all([
      fetch(`/api/cw/git/log/${session.project}/${sessionDir}`).catch(() => null),
      fetch(`/api/cw/git/diff/${session.project}/${sessionDir}`).catch(() => null),
      fetch(`/api/cw/git/status/${session.project}/${sessionDir}`).catch(() => null),
      fetch(`/api/cw/notes/${session.project}/${sessionDir}`).catch(() => null)
    ])
    if (logRes) setGitLog((await logRes.json() as { output: string }).output)
    if (diffRes) setGitDiff((await diffRes.json() as { output: string }).output)
    if (statusRes) setGitStatus((await statusRes.json() as { output: string }).output)
    if (notesRes) setNotes((await notesRes.json() as { content: string }).content)
    setBranch(session.task ?? session.pr ?? '')
  }

  useEffect(() => { fetchData() }, [session])

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

  const handleRestart = () => {
    setPtyExited(false)
    setWsKey(k => k + 1)
  }

  const filesChanged = gitStatus ? gitStatus.split('\n').filter(Boolean).length : 0
  const commitCount = gitLog ? gitLog.split('\n').filter(Boolean).length : 0

  return (
    <div class="flex flex-col h-full">
      {/* ---- Header ---- */}
      <div class="flex items-center justify-between px-4 py-2.5 border-b shrink-0" style={{ borderColor: 'var(--forge-ghost-border)' }}>
        <div class="flex items-center gap-3">
          <button
            class="inline-flex items-center px-2 py-1 text-xs font-medium rounded-lg border transition-colors text-forge-muted hover:text-forge-text"
            style={{ backgroundColor: 'var(--forge-ghost-bg)', borderColor: 'var(--forge-ghost-border)' }}
            onClick={onClose}
            title="Close tab"
          >
            ×
          </button>
          <Badge label={typeLabel} color={typeColor} />
          <span class="text-sm font-bold text-forge-text">{taskName}</span>
          <span class="text-xs text-forge-muted">{session.project}</span>
          {branch && (
            <span class="text-[11px] font-mono text-forge-muted px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--forge-ghost-bg)' }}>
              {branch}
            </span>
          )}
        </div>
        <div class="flex items-center gap-2">
          <span
            class="w-2 h-2 rounded-full"
            style={{ backgroundColor: connected ? 'var(--forge-success)' : 'var(--forge-muted)' }}
            title={connected ? 'Connected' : 'Disconnected'}
          />
          {ptyExited && (
            <ActionButton label="Restart" variant="secondary" onClick={handleRestart} />
          )}
          {session.status === 'active' && (
            <ActionButton label="Done" variant="secondary" onClick={markDone} />
          )}
        </div>
      </div>

      {/* ---- Info bar (collapsible) ---- */}
      <div class="shrink-0 border-b" style={{ borderColor: 'var(--forge-ghost-border)' }}>
        <button
          class="flex items-center gap-4 w-full px-4 py-2 text-left hover:bg-forge-surface/50 transition-colors"
          onClick={() => setInfoExpanded(!infoExpanded)}
        >
          <span class="text-[11px] text-forge-muted">
            {filesChanged} file{filesChanged !== 1 ? 's' : ''} changed
          </span>
          <span class="text-[11px] text-forge-muted">
            {commitCount} commit{commitCount !== 1 ? 's' : ''}
          </span>
          <span class="text-[11px] text-forge-muted">
            {session.opens} session{session.opens !== 1 ? 's' : ''}
          </span>
          {notes && (
            <span class="text-[11px] text-forge-accent">has notes</span>
          )}
          <span class="flex-1" />
          <span
            class="text-[10px] text-forge-muted transition-transform"
            style={{ transform: infoExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
          >
            ▼
          </span>
        </button>

        {infoExpanded && (
          <div class="px-4 pb-3 grid grid-cols-2 gap-3 max-h-[280px] overflow-auto" style={{ borderTop: '1px solid var(--forge-ghost-border)' }}>
            <div>
              <div class="text-[10px] text-forge-muted uppercase tracking-wider mb-1">Changed files</div>
              {gitStatus ? (
                <pre class="text-[11px] font-mono text-forge-text whitespace-pre-wrap break-all">{gitStatus}</pre>
              ) : (
                <span class="text-[11px] text-forge-muted">Clean</span>
              )}
            </div>
            <div>
              <div class="text-[10px] text-forge-muted uppercase tracking-wider mb-1">Commits</div>
              {gitLog ? (
                <pre class="text-[11px] font-mono text-forge-text whitespace-pre-wrap break-all">{gitLog}</pre>
              ) : (
                <span class="text-[11px] text-forge-muted">No commits</span>
              )}
            </div>
            <div>
              <div class="text-[10px] text-forge-muted uppercase tracking-wider mb-1">Diff</div>
              {gitDiff ? (
                <pre class="text-[11px] font-mono text-forge-text whitespace-pre-wrap break-all max-h-[180px] overflow-auto">{gitDiff}</pre>
              ) : (
                <span class="text-[11px] text-forge-muted">No diff</span>
              )}
            </div>
            <div>
              <div class="text-[10px] text-forge-muted uppercase tracking-wider mb-1">Notes</div>
              {notes ? (
                <pre class="text-[11px] font-mono text-forge-text whitespace-pre-wrap break-all max-h-[180px] overflow-auto">{notes}</pre>
              ) : (
                <span class="text-[11px] text-forge-muted">No notes</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ---- Terminal ---- */}
      <div class="relative" style={{ flex: '1 1 0', minHeight: 0 }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <ForgeTerminal
            wsUrl={wsUrl}
            onExit={() => setPtyExited(true)}
            onConnectionChange={(c) => setConnected(c)}
          />
        </div>
        {!connected && !ptyExited && (
          <div class="absolute inset-0 flex items-center justify-center bg-black/50 pointer-events-none">
            <span class="text-sm text-white/70">Connecting...</span>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/console/src/pages/TaskDetail.tsx
git commit -m "feat(console): TaskDetail uses onClose (close tab) instead of onBack"
```

---

### Task 6: Build, restart, verify

**Files:** None (verification only)

- [ ] **Step 1: Rebuild console**

```bash
cd /Users/joselito/Workspace/personal/forge/.tasks/initial
rm -rf packages/console/dist
cd packages/console && npx vite build
```

Expected: Build succeeds

- [ ] **Step 2: Rebuild core (for kill endpoint)**

```bash
cd /Users/joselito/Workspace/personal/forge/.tasks/initial/packages/core
npx tsc
```

Expected: No errors

- [ ] **Step 3: Restart server**

```bash
lsof -ti:3000 | xargs kill -9
cd /Users/joselito/Workspace/personal/forge/.tasks/initial
nohup node packages/platform/dist/index.js > /tmp/forge-server.log 2>&1 &
```

- [ ] **Step 4: Verify kill endpoint works**

```bash
curl -s -X POST http://localhost:3000/api/cw/terminal/kill \
  -H 'Content-Type: application/json' \
  -d '{"project":"test","sessionDir":"task-test"}'
```

Expected: `{"ok":true}`

- [ ] **Step 5: Test in browser**

1. Open browser to `http://localhost:3000`
2. Click a task → terminal opens in tab
3. Click Forge logo → back to list (tab stays open)
4. Click another task → second tab appears
5. Click between tabs → terminal switches, no reconnect
6. Click × on a tab → tab closes, PTY killed
7. Close last tab → returns to list
