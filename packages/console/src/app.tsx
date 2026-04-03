import { render } from 'preact'
import { signal, effect } from '@preact/signals'
import { Shell, currentModule } from './shell.js'
import { Home } from './pages/Home.js'
import { ModuleShell } from './pages/ModuleShell.js'
import { useApi } from './hooks/useApi.js'
import type { ModuleManifest } from '@forge-dev/sdk'
import './styles/theme.css'
import 'virtual:uno.css'

import './panels/registry.js'

export const currentProject = signal<string | null>(null)

interface ProjectEntry {
  id: string
  name: string
  path: string
}

function App() {
  const modules = useApi<ModuleManifest[]>('/api/modules/available')
  const projects = useApi<ProjectEntry[]>('/api/projects')

  const projectList = projects.data.value ?? []

  // Auto-select first project if none selected
  if (currentProject.value === null && projectList.length > 0) {
    currentProject.value = projectList[0].id
  }

  // If selected project was removed, reset
  if (currentProject.value && projectList.length > 0 && !projectList.find(p => p.id === currentProject.value)) {
    currentProject.value = projectList[0].id
  }

  const selectedProject = projectList.find(p => p.id === currentProject.value) ?? null

  const sidebarModules = [
    { id: 'home', name: 'Home', icon: 'home', color: '#6366f1' },
    ...(modules.data.value ?? []).map(m => {
      const dirName = m.name.replace('@forge-dev/', '')
      return { id: dirName, name: m.displayName, icon: m.icon, color: m.color }
    })
  ]

  const activeModuleId = currentModule.value
  const activeManifest = (modules.data.value ?? []).find(
    m => m.name.replace('@forge-dev/', '') === activeModuleId
  )

  return (
    <Shell
      modules={sidebarModules}
      projects={projectList}
      selectedProject={selectedProject}
      onSelectProject={(id) => { currentProject.value = id }}
    >
      {activeModuleId === null || activeModuleId === 'home' ? (
        <Home
          onProjectAdded={() => projects.refetch()}
          onProjectRemoved={() => projects.refetch()}
        />
      ) : activeManifest ? (
        <ModuleShell
          moduleId={activeModuleId}
          manifest={activeManifest}
          projectId={currentProject.value}
        />
      ) : (
        <div class="text-forge-muted py-8 text-center">Loading module...</div>
      )}
    </Shell>
  )
}

render(<App />, document.getElementById('app')!)
