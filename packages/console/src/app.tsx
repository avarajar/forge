import { render } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { Shell } from './shell.js'
import { TaskList } from './pages/TaskList.js'
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
          spaces={spaces}
          loading={loading}
          onNewTask={handleNewTask}
          onSelectTask={handleSelectTask}
          onRefresh={fetchData}
        />
      ) : view === 'detail' && selectedSession ? (
        <div>
          <button
            class="text-sm text-forge-muted hover:text-forge-text mb-4"
            onClick={() => setView('list')}
          >
            ← Back to tasks
          </button>
          <div class="text-forge-muted py-8 text-center">
            Task detail view (Task 5)
          </div>
        </div>
      ) : view === 'new-task' ? (
        <div>
          <button
            class="text-sm text-forge-muted hover:text-forge-text mb-4"
            onClick={() => setView('list')}
          >
            ← Back to tasks
          </button>
          <div class="text-forge-muted py-8 text-center">
            New task form (Task 6)
          </div>
        </div>
      ) : null}
    </Shell>
  )
}

render(<App />, document.getElementById('app')!)
