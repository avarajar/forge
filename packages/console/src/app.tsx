import { render } from 'preact'
import { signal } from '@preact/signals'
import { Shell, currentModule } from './shell.js'
import { Home } from './pages/Home.js'
import { ModuleShell } from './pages/ModuleShell.js'
import { useApi } from './hooks/useApi.js'
import type { ModuleManifest } from '@forge-dev/sdk'
import './styles/theme.css'
import 'virtual:uno.css'

// Import panel registrations (modules register their panels here)
import './panels/registry.js'

export const currentProject = signal<string | null>(null)

function App() {
  const modules = useApi<ModuleManifest[]>('/api/modules/available')

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
    <Shell modules={sidebarModules}>
      {activeModuleId === null || activeModuleId === 'home' ? (
        <Home />
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
