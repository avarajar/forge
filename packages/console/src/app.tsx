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
  const [showList, setShowList] = useState(true)

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
      setActiveTabIndex(openTabs.length)
    }
    setShowList(false)
  }, [openTabs])

  const closeTab = useCallback(async (index: number) => {
    const session = openTabs[index]
    if (!session) return

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
