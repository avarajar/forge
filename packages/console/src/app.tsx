import { render } from 'preact'
import { useState, useEffect, useCallback, useMemo } from 'preact/hooks'
import { Shell, toggleTheme } from './shell.js'
import { Sidebar, type View } from './components/Sidebar.js'
import { harnesses, loadHarnesses } from './hooks/useHarnesses.js'
import { forgetOutput } from './hooks/useTerminalMetrics.js'
import { TaskList } from './pages/TaskList.js'
import { TaskDetail } from './pages/TaskDetail.js'
import { NewTask } from './pages/NewTask.js'
import { Skills } from './pages/Skills.js'
import { PrototypePanel } from './pages/PrototypePanel.js'
import { CreateProjectModal } from './pages/CreateProjectModal.js'
import { Accounts } from './pages/Accounts.js'
import { TabBar } from './components/TabBar.js'
import { CloseTaskDialog, type CloseRequest } from './components/CloseTaskDialog.js'
import { EmptyState, showToast } from '@forge-dev/ui'
import type { CWSession } from '@forge-dev/core'
import { sessionKey } from './config/types.js'
import { useTabManager } from './hooks/useTabManager.js'
import { useTaskFilters } from './hooks/useTaskFilters.js'
import { loadReviewState, refreshReviewStates } from './hooks/useTaskReview.js'
import './styles/theme.css'
import 'virtual:uno.css'

function App() {
  const [spaces, setSpaces] = useState<CWSession[]>([])
  const [projects, setProjects] = useState<Record<string, { path: string; account: string }>>({})
  const [accounts, setAccounts] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  const [view, setView] = useState<View>('list')
  const [newTaskOpen, setNewTaskOpen] = useState(false)
  const [skillCount, setSkillCount] = useState<number | null>(null)
  const [prototypeCount, setPrototypeCount] = useState<number | null>(null)
  const [newTaskType, setNewTaskType] = useState<string | undefined>()

  // Create Project modal
  const [showCreateProject, setShowCreateProject] = useState(false)

  const [prototypeProject, setPrototypeProject] = useState<string | null>(null)

  useEffect(() => {
    void loadHarnesses()
    fetch('/api/prototype/list').then(r => r.json() as Promise<unknown[]>).then(l => setPrototypeCount(l.length)).catch(() => {})
  }, [])

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
      refreshReviewStates()
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
    setNewTaskOpen(true)
  }

  const [closeRequest, setCloseRequest] = useState<CloseRequest | null>(null)

  const performClose = useCallback(async (session: CWSession, onClosed?: () => void) => {
    try {
      const res = await fetch('/api/cw/done', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: session.project,
          task: session.type === 'review' ? session.pr : session.task,
          type: session.type,
          sessionDir: session.sessionDir,
        }),
      })
      const result = await res.json() as { ok: boolean; error?: string }
      if (result.ok) {
        showToast('Task closed', 'info')
        onClosed?.()
        refreshAfterAction()
      } else {
        const error = result.error ?? 'cw --done failed'
        console.error(`[forge] closing ${session.project}/${session.task ?? session.pr} failed:\n${error}`)
        showToast(error.split('\n')[0], 'error')
      }
    } catch {
      showToast('Failed to close the task', 'error')
    }
  }, [refreshAfterAction])

  // checks the task first and only asks when closing could lose work or cut a review short
  const requestClose = useCallback(async (session: CWSession, onClosed?: () => void) => {
    const entry = await loadReviewState(session, true)
    if (entry.state && entry.state.closeWarnings.length === 0) {
      await performClose(session, onClosed)
      return
    }
    setCloseRequest({ session, state: entry.state, error: entry.error, onClosed })
  }, [performClose])

  const handleMarkDone = useCallback((session: CWSession) => requestClose(session), [requestClose])

  const closeDialog = (
    <CloseTaskDialog
      request={closeRequest}
      onCancel={() => setCloseRequest(null)}
      onConfirm={async () => {
        const request = closeRequest
        if (!request) return
        // the dialog stays open until cw --done settles, so Close task shows its spinner
        try {
          await performClose(request.session, request.onClosed)
        } finally {
          setCloseRequest(null)
        }
      }}
    />
  )

  const navigate = useCallback((next: View) => {
    if (!tabs.showList) tabs.goToList()
    setNewTaskOpen(false)
    setView(next)
  }, [tabs.showList, tabs.goToList])

  const handleGoToList = useCallback(() => navigate('list'), [navigate])

  const selectProject = useCallback((project: string) => {
    filters.setFilterProject(filters.filterProject === project ? null : project)
    navigate('list')
  }, [filters.filterProject, filters.setFilterProject, navigate])

  const openSession = useCallback((session: CWSession) => {
    setNewTaskOpen(false)
    tabs.openTab(session)
  }, [tabs.openTab])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
        e.preventDefault()
        toggleTheme()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const handleCreateSkillWithAI = useCallback(async (scope: string, scopeRef: string, description: string) => {
    let targetDir = ''
    if (scope === 'global') targetDir = '~/.claude/skills/'
    else if (scope === 'account') targetDir = `~/.cw/accounts/${scopeRef}/skills/`
    else targetDir = `<project>/.claude/skills/`

    const initDescription = [
      'Use the skill-creator skill to create a new Claude Code skill.',
      '',
      `The user wants: ${description}`,
      `Target scope: ${scope}${scopeRef ? ` (${scopeRef})` : ''}`,
      `Save location: ${targetDir}`,
      '',
      'Before creating from scratch, search for existing similar skills:',
      '1. Search skills.sh for related skills (WebSearch or WebFetch https://skills.sh/api/search?q=<keywords>)',
      '2. Search GitHub for claude-code skill repos',
      '3. Present what you find — let the user pick a base or start fresh',
      '',
      'Then use skill-creator to build/customize the skill and save it.',
    ].join('\n')

    try {
      const res = await fetch('/api/cw/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'general',
          account: accounts[0] || 'default',
          description: initDescription,
        })
      })
      const result = await res.json() as { ok: boolean; session?: CWSession }
      if (result.ok && result.session) {
        openSession(result.session)
        showToast('AI skill creation session started', 'success')
      } else {
        showToast('Failed to start session', 'error')
      }
    } catch {
      showToast('Failed to start skill creation session', 'error')
    }
  }, [accounts, openSession])

  const handleStartPrototype = useCallback((project: string) => {
    setPrototypeProject(project)
    navigate('prototypes')
  }, [navigate])

  const activeSessions = useMemo(() => spaces.filter(s => s.status === 'active'), [spaces])

  const live = useMemo(
    () => tabs.openTabs.filter(s => s.status === 'active' && s.type !== 'login').map(s => ({ key: sessionKey(s), session: s })),
    [tabs.openTabs],
  )

  const sidebarProjects = useMemo(() => filters.projectNames.map(name => ({
    name,
    count: activeSessions.filter(s => s.project === name).length,
    live: live.some(l => l.session.project === name),
  })), [filters.projectNames, activeSessions, live])

  const doctor = harnesses.value?.available ? harnesses.value.doctor : null
  const detailShown = !tabs.showList && tabs.openTabs.length > 0
  const sidebarView: View = detailShown ? 'list' : view
  const prototypeTarget = prototypeProject ?? filters.filterProject ?? Object.keys(projects)[0] ?? null

  const closeTab = useCallback((index: number) => {
    const session = tabs.openTabs[index]
    if (session) forgetOutput(sessionKey(session))
    return tabs.closeTab(index)
  }, [tabs.openTabs, tabs.closeTab])

  const sidebar = (
    <Sidebar
      version={doctor?.cw_version ?? null}
      view={sidebarView}
      nav={[
        { view: 'list', label: 'Tasks', glyph: 'T', token: '--blue', count: activeSessions.length },
        { view: 'accounts', label: 'Accounts', glyph: 'A', token: '--purple', count: filters.accountNames.length },
        { view: 'skills', label: 'Skills', glyph: 'S', token: '--green', count: skillCount },
        { view: 'prototypes', label: 'Prototypes', glyph: 'P', token: '--orange', count: prototypeCount },
      ]}
      projects={sidebarProjects}
      selectedProject={filters.filterProject}
      live={live}
      onNavigate={navigate}
      onSelectProject={selectProject}
      onAddProject={() => setShowCreateProject(true)}
      onOpenLive={openSession}
    />
  )

  const page = loading ? (
    <div class="py-20 text-center text-ink2">Loading…</div>
  ) : view === 'list' && !hasProjects ? (
    <div style={{ padding: '56px 22px' }}>
      <EmptyState
        icon="i-lucide-folder"
        title="Welcome to Forge"
        description="No projects found in CW. Register a project with 'cw open <project>' or create one with 'cw create' first."
        action={{ label: 'Add project', onClick: () => setShowCreateProject(true) }}
      />
    </div>
  ) : view === 'list' ? (
    <div style={{ padding: '18px 22px 40px', maxWidth: '1180px', width: '100%' }}>
      <TaskList
        spaces={filters.filteredSpaces}
        allSpaces={spaces}
        loading={loading}
        onNewTask={handleNewTask}
        onCreateProject={() => setShowCreateProject(true)}
        onOpenAccounts={() => navigate('accounts')}
        onSelectTask={openSession}
        onRefresh={() => fetchData()}
        projects={projects}
        accountNames={filters.accountNames}
        filterAccount={filters.filterAccount}
        onFilterAccount={filters.setFilterAccount}
        projectNames={filters.projectNames}
        filterProject={filters.filterProject}
        onFilterProject={filters.setFilterProject}
        filterType={filters.filterType}
        onFilterType={filters.setFilterType}
        harnessNames={filters.harnessNames}
        filterHarness={filters.filterHarness}
        onFilterHarness={filters.setFilterHarness}
        showDone={filters.showDone}
        onShowDone={filters.setShowDone}
        openTabKeys={tabs.openTabKeys}
        onMarkDone={handleMarkDone}
      />
    </div>
  ) : view === 'prototypes' ? (
    prototypeTarget ? (
      <div style={{ height: '100vh' }}>
        <PrototypePanel project={prototypeTarget} onBack={handleGoToList} />
      </div>
    ) : null
  ) : view === 'accounts' ? (
    <div style={{ padding: '18px 22px 40px', maxWidth: '1180px', width: '100%' }}>
      <Accounts
        onBack={handleGoToList}
        onOpenSession={openSession}
        onAccountsChanged={() => { fetchData() }}
      />
    </div>
  ) : (
    <div style={{ padding: '18px 22px 40px', maxWidth: '1180px', width: '100%' }}>
      <Skills
        accounts={filters.accountNames}
        projects={projects}
        onBack={handleGoToList}
        onCreateWithAI={handleCreateSkillWithAI}
        onCount={setSkillCount}
      />
    </div>
  )

  return (
    <Shell sidebar={sidebar}>
      {!detailShown && page}

      {tabs.openTabs.length > 0 && (
        <div
          class="flex flex-col"
          aria-hidden={!detailShown}
          style={detailShown
            ? { height: '100vh' }
            : { position: 'absolute', top: 0, left: 0, right: 0, height: '100vh', visibility: 'hidden', pointerEvents: 'none' }}
        >
          <TabBar
            tabs={tabs.openTabs}
            activeIndex={tabs.activeTabIndex}
            onActivate={tabs.setActiveTabIndex}
            onClose={closeTab}
            allSessions={activeSessions}
            openTabKeys={tabs.openTabKeys}
            onOpenSession={openSession}
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
                    active={isActive && detailShown}
                    onClose={() => closeTab(i)}
                    onDone={() => requestClose(session, () => { forgetOutput(sessionKey(session)); void tabs.closeTabByKey(sessionKey(session)) })}
                  />
                </div>
              )
            })}
          </div>
        </div>
      )}

      {newTaskOpen && (
        <div class="fixed inset-0 z-50 overflow-auto" style={{ background: 'var(--bg)', padding: '18px 22px 40px' }}>
          <NewTask
            projects={projects}
            accounts={filters.accountNames}
            initialType={newTaskType}
            initialAccount={filters.filterAccount ?? undefined}
            initialProject={filters.filterProject ?? undefined}
            onBack={() => setNewTaskOpen(false)}
            onCreated={(session) => {
              setNewTaskOpen(false)
              if (session) openSession(session)
              refreshAfterAction()
            }}
            onStartPrototype={handleStartPrototype}
            onOpenAccounts={() => navigate('accounts')}
          />
        </div>
      )}

      <CreateProjectModal
        open={showCreateProject}
        accounts={filters.accountNames}
        onClose={() => setShowCreateProject(false)}
        onCreated={(session) => { setShowCreateProject(false); if (session) openSession(session); refreshAfterAction() }}
      />
      {closeDialog}
    </Shell>
  )
}

render(<App />, document.getElementById('app')!)
