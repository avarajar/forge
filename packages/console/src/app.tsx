import { render, type FunctionComponent } from 'preact'
import { useState, useEffect, useCallback } from 'preact/hooks'
import { Shell } from './shell.js'
import { TaskList } from './pages/TaskList.js'
import { TaskDetail } from './pages/TaskDetail.js'
import { NewTask } from './pages/NewTask.js'
import { PrototypePanel } from './pages/PrototypePanel.js'
import { CreateProjectModal } from './pages/CreateProjectModal.js'
import { CreateAccountModal } from './pages/CreateAccountModal.js'
import { TabBar } from './components/TabBar.js'
import { EmptyState, showToast } from '@forge-dev/ui'
import type { CWSession } from '@forge-dev/core'
import { TYPE_STYLES, sessionKey, sessionLabel } from './config/types.js'
import { useTabManager } from './hooks/useTabManager.js'
import { useTaskFilters } from './hooks/useTaskFilters.js'
import './styles/theme.css'
import 'virtual:uno.css'

/* ── Open tabs banner: shown at top of list view ── */

const OpenTabsBanner: FunctionComponent<{
  tabs: CWSession[]
  onSwitch: (index: number) => void
}> = ({ tabs, onSwitch }) => {
  if (tabs.length === 0) return null
  return (
    <div
      class="mb-6 rounded-xl px-4 py-4"
      style={{ backgroundColor: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.12)' }}
    >
      <div class="flex items-center gap-2 mb-3">
        <span class="w-2 h-2 rounded-full bg-forge-accent animate-pulse" />
        <span class="text-[10px] font-bold uppercase tracking-widest text-forge-muted">
          Open in tabs
        </span>
      </div>

      <div class="flex flex-wrap gap-2">
        {tabs.map((s, i) => {
          const cfg = TYPE_STYLES[s.type] ?? TYPE_STYLES.task
          return (
            <button
              key={sessionKey(s)}
              class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all cursor-pointer"
              style={{
                backgroundColor: 'var(--forge-surface)',
                border: `1px solid ${cfg.border}`,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = cfg.color;
                (e.currentTarget as HTMLElement).style.boxShadow = `0 2px 8px ${cfg.bg}`
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = cfg.border;
                (e.currentTarget as HTMLElement).style.boxShadow = 'none'
              }}
              onClick={() => onSwitch(i)}
            >
              <span class="w-2 h-2 rounded-full animate-pulse shrink-0" style={{ backgroundColor: cfg.color }} />
              <span class="text-xs font-semibold text-forge-text truncate max-w-[160px]">{sessionLabel(s)}</span>
              <span class="text-[10px] text-forge-muted truncate max-w-[100px]">{s.project}</span>
              <span
                class="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0"
                style={{ color: cfg.color, backgroundColor: cfg.bg }}
              >
                {cfg.label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function App() {
  const [spaces, setSpaces] = useState<CWSession[]>([])
  const [projects, setProjects] = useState<Record<string, { path: string; account: string }>>({})
  const [accounts, setAccounts] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  // Sub-views within list
  const [listView, setListView] = useState<'list' | 'new-task'>('list')
  const [newTaskType, setNewTaskType] = useState<string | undefined>()

  // Create Project / Account modals
  const [showCreateProject, setShowCreateProject] = useState(false)
  const [showCreateAccount, setShowCreateAccount] = useState(false)

  const [prototypeProject, setPrototypeProject] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
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
      showToast('Failed to connect to server', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  /** Fetch after a short delay, then again after a longer one to catch async state changes */
  const refreshAfterAction = useCallback(() => {
    setTimeout(fetchData, 500)
    setTimeout(fetchData, 2500)
  }, [fetchData])

  useEffect(() => { fetchData() }, [fetchData])

  const tabs = useTabManager({ spaces, loading, onFetchData: fetchData })

  const filters = useTaskFilters({ spaces, accounts, projects })

  const hasProjects = Object.keys(projects).length > 0

  const handleNewTask = (type?: string) => {
    setNewTaskType(type)
    setListView('new-task')
  }

  const handleMarkDone = useCallback(async (session: CWSession) => {
    try {
      const res = await fetch('/api/cw/done', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: session.project,
          task: session.type === 'review' ? session.pr : session.task,
          type: session.type,
          sessionDir: session.sessionDir
        })
      })
      const result = await res.json() as { ok: boolean; error?: string }
      if (result.ok) {
        showToast('Task closed', 'info')
        refreshAfterAction()
      } else {
        showToast(result.error ?? 'Failed to mark task as done', 'error')
      }
    } catch {
      showToast('Failed to mark task as done', 'error')
    }
  }, [refreshAfterAction])

  const handleGoToList = useCallback(() => {
    tabs.goToList()
    setListView('list')
  }, [tabs.goToList])

  const handleStartPrototype = useCallback((project: string) => {
    setPrototypeProject(project)
  }, [])

  const handleBackFromPrototype = useCallback(() => {
    setPrototypeProject(null)
    setListView('list')
  }, [])

  // --- Render ---

  if (tabs.showList || tabs.openTabs.length === 0) {
    return (
      <Shell onLogoClick={handleGoToList}>
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
            <OpenTabsBanner tabs={tabs.openTabs} onSwitch={tabs.switchToTab} />
            <TaskList
              spaces={filters.filteredSpaces}
              allSpaces={spaces}
              loading={loading}
              onNewTask={handleNewTask}
              onCreateProject={() => setShowCreateProject(true)}
              onCreateAccount={() => setShowCreateAccount(true)}
              onSelectTask={tabs.openTab}
              onRefresh={() => fetchData()}
              accountNames={filters.accountNames}
              filterAccount={filters.filterAccount}
              onFilterAccount={filters.setFilterAccount}
              projectNames={filters.projectNames}
              filterProject={filters.filterProject}
              onFilterProject={filters.setFilterProject}
              filterType={filters.filterType}
              onFilterType={filters.setFilterType}
              showDone={filters.showDone}
              onShowDone={filters.setShowDone}
              openTabKeys={tabs.openTabKeys}
              onMarkDone={handleMarkDone}
            />
            <CreateProjectModal
              open={showCreateProject}
              accounts={filters.accountNames}
              onClose={() => setShowCreateProject(false)}
              onCreated={(session) => { setShowCreateProject(false); if (session) tabs.openTab(session); refreshAfterAction() }}
            />
            <CreateAccountModal
              open={showCreateAccount}
              onClose={() => setShowCreateAccount(false)}
              onCreated={(session) => { setShowCreateAccount(false); if (session) tabs.openTab(session); refreshAfterAction() }}
            />
          </>
        ) : prototypeProject ? (
          <PrototypePanel
            project={prototypeProject}
            onBack={handleBackFromPrototype}
          />
        ) : listView === 'new-task' ? (
          <NewTask
            projects={projects}
            accounts={filters.accountNames}
            initialType={newTaskType}
            initialAccount={filters.filterAccount ?? undefined}
            initialProject={filters.filterProject ?? undefined}
            onBack={() => setListView('list')}
            onCreated={(session) => {
              setListView('list')
              if (session) tabs.openTab(session)
              refreshAfterAction()
            }}
            onStartPrototype={handleStartPrototype}
          />
        ) : null}
      </Shell>
    )
  }

  // --- Tabs view ---
  return (
    <Shell fullHeight onLogoClick={handleGoToList}>
      <div class="flex flex-col h-full">
        <TabBar
          tabs={tabs.openTabs}
          activeIndex={tabs.activeTabIndex}
          onActivate={tabs.setActiveTabIndex}
          onClose={tabs.closeTab}
          allSessions={spaces.filter(s => s.status === 'active')}
          openTabKeys={tabs.openTabKeys}
          onOpenSession={tabs.openTab}
          onNewTask={(type) => { handleGoToList(); handleNewTask(type) }}
        />
        <div class="flex-1 min-h-0 relative">
          {tabs.openTabs.map((session, i) => {
            const isActive = i === tabs.activeTabIndex
            return (
              <div
                key={sessionKey(session)}
                style={{
                  position: 'absolute',
                  top: 0, left: 0, right: 0, bottom: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  visibility: isActive ? 'visible' : 'hidden',
                  zIndex: isActive ? 1 : 0,
                  pointerEvents: isActive ? 'auto' : 'none',
                }}
              >
                <TaskDetail
                  session={session}
                  onClose={() => tabs.closeTab(i)}
                  onDone={() => { tabs.closeTab(i); refreshAfterAction() }}
                />
              </div>
            )
          })}
        </div>
      </div>
    </Shell>
  )
}

render(<App />, document.getElementById('app')!)
