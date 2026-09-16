import { render } from 'preact'
import { useState, useEffect, useCallback, useMemo } from 'preact/hooks'
import { Shell, sidebarOpen, toggleTheme } from './shell.js'
import { NAV, Sidebar, type View } from './components/Sidebar.js'
import { CommandPalette, type PaletteItem } from './components/CommandPalette.js'
import { loadHarnesses } from './hooks/useHarnesses.js'
import { loadSkills } from './hooks/useSkills.js'
import { TaskList } from './pages/TaskList.js'
import { TaskDetail } from './pages/TaskDetail.js'
import { NewTask } from './pages/NewTask.js'
import { Skills } from './pages/Skills.js'
import { PrototypePanel } from './pages/PrototypePanel.js'
import { CreateProjectModal } from './pages/CreateProjectModal.js'
import { Accounts } from './pages/Accounts.js'
import { TabBar } from './components/TabBar.js'
import type { ProjectMap } from './components/StartCard.js'
import { CloseTaskDialog, type CloseRequest } from './components/CloseTaskDialog.js'
import { EmptyState, showToast } from '@forge-dev/ui'
import type { CWSession, SkillEntry } from '@forge-dev/core'
import { QUICK_TYPES, sessionKey } from './config/types.js'
import { typeOverride } from './state/startTask.js'
import { useTabManager } from './hooks/useTabManager.js'
import { useTaskFilters } from './hooks/useTaskFilters.js'
import { loadReviewState, refreshReviewStates } from './hooks/useTaskReview.js'
import './styles/theme.css'
import 'virtual:uno.css'

function App() {
  const [spaces, setSpaces] = useState<CWSession[]>([])
  const [projects, setProjects] = useState<ProjectMap>({})
  const [accounts, setAccounts] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  const [view, setView] = useState<View>('list')
  const [newTaskOpen, setNewTaskOpen] = useState(false)
  const [prototypeProject, setPrototypeProject] = useState<string | null>(null)
  const [prototypeCount, setPrototypeCount] = useState<number | null>(null)

  // Create Project modal
  const [showCreateProject, setShowCreateProject] = useState(false)


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
      setProjects(await projectsRes.json() as ProjectMap)
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
    const quick = QUICK_TYPES.find(t => t.key === type)
    if (quick) typeOverride.value = quick.key
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
    sidebarOpen.value = false
    if (!tabs.showList) tabs.goToList()
    setNewTaskOpen(false)
    setView(next)
  }, [tabs.showList, tabs.goToList])

  const handleGoToList = useCallback(() => navigate('list'), [navigate])

  const closeNewTask = useCallback(() => setNewTaskOpen(false), [])

  const selectProject = useCallback((project: string) => {
    filters.setFilterProject(filters.filterProject === project ? null : project)
    navigate('list')
  }, [filters.filterProject, filters.setFilterProject, navigate])

  const openSession = useCallback((session: CWSession) => {
    sidebarOpen.value = false
    setNewTaskOpen(false)
    tabs.openTab(session)
  }, [tabs.openTab])

  const [paletteOpen, setPaletteOpen] = useState(false)
  const closePalette = useCallback(() => setPaletteOpen(false), [])
  const openPalette = useCallback(() => setPaletteOpen(true), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      const key = e.key.toLowerCase()
      if (mod && key === 'j') {
        e.preventDefault()
        toggleTheme()
        return
      }
      if (mod && key === 'k') {
        e.preventDefault()
        if (paletteOpen) setPaletteOpen(false)
        else openPalette()
        return
      }
      const target = e.target as HTMLElement | null
      const typing = target?.closest('input, textarea, select, [contenteditable="true"]')
      if (typing || mod || e.altKey || paletteOpen || newTaskOpen || showCreateProject) return
      if (e.key === '/') { e.preventDefault(); openPalette() }
      else if (key === 'n') { e.preventDefault(); setNewTaskOpen(true) }
      else if (key === 'p') { e.preventDefault(); setShowCreateProject(true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [paletteOpen, newTaskOpen, showCreateProject, openPalette])

  const startGeneral = useCallback(async (description: string, account: string, project: string | undefined, started: string) => {
    try {
      const res = await fetch('/api/cw/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'general', account, project, description }),
      })
      const result = await res.json() as { ok: boolean; error?: string; session?: CWSession }
      if (result.ok && result.session) {
        openSession(result.session)
        refreshAfterAction()
        showToast(started, 'success')
      } else {
        showToast(result.error ?? 'Failed to start session', 'error')
      }
    } catch {
      showToast('Failed to start session', 'error')
    }
  }, [openSession, refreshAfterAction])

  const handleCreateSkillWithAI = useCallback((scope: string, scopeRef: string, description: string) => {
    const targetDir = scope === 'global' ? '~/.claude/skills/'
      : scope === 'account' ? `~/.cw/accounts/${scopeRef}/skills/`
      : '<project>/.claude/skills/'

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

    void startGeneral(initDescription, accounts[0] || 'default', undefined, 'AI skill creation session started')
  }, [accounts, startGeneral])

  const handleRunSkill = useCallback((skill: SkillEntry) => {
    const project = skill.scope === 'project' && projects[skill.scopeRef] ? skill.scopeRef : undefined
    const account = skill.scope === 'account' ? skill.scopeRef
      : project ? projects[project].account
      : accounts[0] || 'default'
    void startGeneral(`Use the ${skill.name} skill.`, account, project, `Session started with ${skill.name}`)
  }, [accounts, projects, startGeneral])

  useEffect(() => {
    if (loading) return
    loadSkills(accounts[0] ?? '', Object.keys(projects)[0] ?? '').catch(() => {})
  }, [loading])

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

  // the project a quick start runs on: the filtered one, else the most recent task's
  const startProject = filters.filterProject
    ?? filters.filteredSpaces.find(s => s.status === 'active' && projects[s.project])?.project
    ?? Object.keys(projects)[0] ?? ''

  const projectKeys = useMemo(() => Object.keys(projects), [projects])

  const showProject = useCallback((project: string) => {
    filters.setFilterProject(project)
    navigate('list')
  }, [filters.setFilterProject, navigate])

  const detailShown = !tabs.showList && tabs.openTabs.length > 0
  const sidebarView: View = detailShown ? 'list' : view
  const prototypeTarget = prototypeProject ?? filters.filterProject ?? projectKeys[0] ?? null

  const paletteCommands = useMemo<PaletteItem[]>(() => [
    { id: 'new-task', label: 'New task', hint: 'N', glyph: '+', token: '--blue', run: () => handleNewTask() },
    { id: 'add-project', label: 'Add project', hint: 'P', glyph: 'P', token: '--green', run: () => setShowCreateProject(true) },
    ...NAV.map(n => ({ id: n.view, label: n.label, hint: n.view === 'list' ? '⌘L' : '', glyph: n.glyph, token: n.token, run: () => navigate(n.view) })),
    { id: 'appearance', label: 'Toggle appearance', hint: '⌘J', glyph: '◐', token: null, run: toggleTheme },
  ], [navigate])

  const sidebar = (
    <Sidebar
      view={sidebarView}
      counts={{ list: activeSessions.length, accounts: filters.accountNames.length, prototypes: prototypeCount }}
      projects={sidebarProjects}
      selectedProject={filters.filterProject}
      live={live}
      onNavigate={navigate}
      onSelectProject={selectProject}
      onAddProject={() => { sidebarOpen.value = false; setShowCreateProject(true) }}
      onOpenLive={openSession}
      onSearch={openPalette}
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
    <TaskList
      spaces={filters.filteredSpaces}
      allSpaces={spaces}
      projects={projects}
      accountNames={filters.accountNames}
      filterAccount={filters.filterAccount}
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
      onSelectTask={openSession}
      onMarkDone={requestClose}
      onNewTask={() => handleNewTask()}
      onCreateProject={() => setShowCreateProject(true)}
      onRefresh={() => fetchData()}
      startProject={startProject}
      onStarted={(session) => { if (session) openSession(session); refreshAfterAction() }}
    />
  ) : view === 'prototypes' ? (
    prototypeTarget ? (
      <PrototypePanel
        project={prototypeTarget}
        projects={Object.keys(projects)}
        onProjectChange={setPrototypeProject}
        onBack={handleGoToList}
      />
    ) : null
  ) : view === 'accounts' ? (
    <Accounts
      projects={projects}
      onOpenSession={openSession}
      onAccountsChanged={() => { fetchData() }}
    />
  ) : (
    <Skills
      accounts={filters.accountNames}
      projects={projects}
      onCreateWithAI={handleCreateSkillWithAI}
      onRunSkill={handleRunSkill}
    />
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
            : { position: 'absolute', top: 0, left: 0, right: 0, height: '100vh', visibility: 'hidden', pointerEvents: 'none', zIndex: -1 }}
        >
          <TabBar
            tabs={tabs.openTabs}
            activeIndex={tabs.activeTabIndex}
            onActivate={tabs.setActiveTabIndex}
            onClose={tabs.closeTab}
            onBack={handleGoToList}
            allSessions={activeSessions}
            openTabKeys={tabs.openTabKeys}
            onOpenSession={openSession}
            onNewTask={(type) => { handleGoToList(); handleNewTask(type) }}
          />
          <div class="flex-1 min-h-0 relative">
            {tabs.openTabs.map((session, i) => {
              const isActive = i === tabs.activeTabIndex
              const shown = isActive && detailShown
              return (
                <div
                  key={sessionKey(session)}
                  style={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0, bottom: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    visibility: shown ? 'visible' : 'hidden',
                    zIndex: isActive ? 1 : 0,
                    pointerEvents: shown ? 'auto' : 'none',
                  }}
                >
                  <TaskDetail
                    session={session}
                    active={shown}
                    onDone={() => requestClose(session, () => { void tabs.closeTabByKey(sessionKey(session)) })}
                  />
                </div>
              )
            })}
          </div>
        </div>
      )}

      {newTaskOpen && (
        <NewTask
          projects={projects}
          accounts={filters.accountNames}
          initialAccount={filters.filterAccount ?? undefined}
          initialProject={startProject || undefined}
          onClose={closeNewTask}
          onCreated={(session) => {
            setNewTaskOpen(false)
            if (session) openSession(session)
            refreshAfterAction()
          }}
          onOpenAccounts={() => navigate('accounts')}
        />
      )}

      {paletteOpen && (
        <CommandPalette
          openTabs={tabs.openTabs}
          sessions={spaces}
          projects={projectKeys}
          commands={paletteCommands}
          onOpenSession={openSession}
          onSelectProject={showProject}
          onClose={closePalette}
        />
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
