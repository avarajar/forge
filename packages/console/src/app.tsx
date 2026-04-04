import { render } from 'preact'
import { useState, useEffect, useMemo } from 'preact/hooks'
import { Shell } from './shell.js'
import { TaskList } from './pages/TaskList.js'
import { TaskDetail } from './pages/TaskDetail.js'
import { NewTask } from './pages/NewTask.js'
import { CreateProjectModal } from './pages/CreateProjectModal.js'
import { EmptyState } from '@forge-dev/ui'
import type { CWSession } from '@forge-dev/core'
import './styles/theme.css'
import 'virtual:uno.css'

type View = 'list' | 'detail' | 'new-task'

function App() {
  const [spaces, setSpaces] = useState<CWSession[]>([])
  const [projects, setProjects] = useState<Record<string, { path: string; account: string }>>({})
  const [accounts, setAccounts] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>('list')
  const [selectedSession, setSelectedSession] = useState<CWSession | null>(null)
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

  // Refetch after a CW action — delay to let CW write files, then retry
  const refreshAfterAction = () => {
    fetchData(500)
    // Retry after 2s in case CW was slow
    setTimeout(() => fetchData(), 2000)
  }

  useEffect(() => { fetchData() }, [])

  const hasProjects = Object.keys(projects).length > 0

  // Derive unique account names from spaces (fallback if accounts endpoint empty)
  const accountNames = useMemo(() => {
    if (accounts.length > 0) return accounts
    const names = new Set<string>()
    for (const s of spaces) if (s.account) names.add(s.account)
    return Array.from(names).sort()
  }, [accounts, spaces])

  // Derive project names, filtered by selected account
  const projectNames = useMemo(() => {
    const names = new Set<string>()
    for (const s of spaces) {
      if (filterAccount && s.account !== filterAccount) continue
      names.add(s.project)
    }
    return Array.from(names).sort()
  }, [spaces, filterAccount])

  // When account filter changes, clear project filter if it no longer belongs to new account
  const handleFilterAccount = (account: string | null) => {
    setFilterAccount(account)
    if (account && filterProject) {
      const proj = projects[filterProject]
      if (proj && proj.account !== account) {
        setFilterProject(null)
      }
    }
  }

  // Filter spaces
  const filteredSpaces = useMemo(() => {
    return spaces.filter(s => {
      if (filterAccount && s.account !== filterAccount) return false
      if (filterProject && s.project !== filterProject) return false
      if (filterType) {
        if (filterType === 'dev' && s.type !== 'task') return false
        if (filterType === 'review' && s.type !== 'review') return false
        // design/plan: future types, skip for now if no match
        if (filterType === 'design' || filterType === 'plan') return false
      }
      if (!showDone && s.status === 'done') return false
      return true
    })
  }, [spaces, filterAccount, filterProject, filterType, showDone])

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
        <div class="max-w-4xl mx-auto px-6 py-8">
          <div class="py-20 text-center text-forge-muted">Loading...</div>
        </div>
      ) : !hasProjects ? (
        <div class="max-w-4xl mx-auto px-6 py-8">
          <EmptyState
            icon="&#128296;"
            title="Welcome to Forge"
            description="No projects found in CW. Register a project with 'cw open <project>' or create one with 'cw create' first."
          />
        </div>
      ) : view === 'list' ? (
        <div class="max-w-4xl mx-auto px-6 py-8">
          <TaskList
            spaces={filteredSpaces}
            allSpaces={spaces}
            loading={loading}
            onNewTask={handleNewTask}
            onCreateProject={() => setShowCreateProject(true)}
            onSelectTask={handleSelectTask}
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
        </div>
      ) : view === 'detail' && selectedSession ? (
        <TaskDetail
          session={selectedSession}
          onBack={() => { setView('list'); fetchData() }}
          onDone={() => { setView('list'); refreshAfterAction() }}
        />
      ) : view === 'new-task' ? (
        <div class="max-w-4xl mx-auto px-6 py-8">
          <NewTask
            projects={projects}
            accounts={accountNames}
            initialType={newTaskType}
            onBack={() => setView('list')}
            onCreated={() => { setView('list'); refreshAfterAction() }}
          />
        </div>
      ) : null}
    </Shell>
  )
}

render(<App />, document.getElementById('app')!)
