import { render } from 'preact'
import { useState, useEffect, useMemo } from 'preact/hooks'
import { Shell } from './shell.js'
import { TaskList } from './pages/TaskList.js'
import { TaskDetail } from './pages/TaskDetail.js'
import { NewTask } from './pages/NewTask.js'
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

  // Filter state
  const [filterProject, setFilterProject] = useState<string | null>(null)
  const [filterType, setFilterType] = useState<string | null>(null)
  const [showDone, setShowDone] = useState(false)

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

  // Derive unique project names from spaces
  const projectNames = useMemo(() => {
    const names = new Set<string>()
    for (const s of spaces) names.add(s.project)
    return Array.from(names).sort()
  }, [spaces])

  // Filter spaces
  const filteredSpaces = useMemo(() => {
    return spaces.filter(s => {
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
  }, [spaces, filterProject, filterType, showDone])

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
          spaces={filteredSpaces}
          allSpaces={spaces}
          loading={loading}
          onNewTask={handleNewTask}
          onSelectTask={handleSelectTask}
          onRefresh={fetchData}
          projectNames={projectNames}
          filterProject={filterProject}
          onFilterProject={setFilterProject}
          filterType={filterType}
          onFilterType={setFilterType}
          showDone={showDone}
          onShowDone={setShowDone}
        />
      ) : view === 'detail' && selectedSession ? (
        <TaskDetail
          session={selectedSession}
          onBack={() => { setView('list'); fetchData() }}
          onDone={() => { setView('list'); fetchData() }}
        />
      ) : view === 'new-task' ? (
        <NewTask
          projects={projects}
          initialType={newTaskType}
          onBack={() => setView('list')}
          onCreated={() => { setView('list'); fetchData() }}
        />
      ) : null}
    </Shell>
  )
}

render(<App />, document.getElementById('app')!)
