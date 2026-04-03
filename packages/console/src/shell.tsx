import { type FunctionComponent, type ComponentChildren } from 'preact'
import { signal } from '@preact/signals'
import { ToastContainer } from '@forge-dev/ui'

export const currentModule = signal<string | null>(null)
export const theme = signal<'dark' | 'light'>('dark')

const toggleTheme = () => {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
  document.documentElement.setAttribute('data-theme', theme.value)
}

interface ProjectInfo {
  id: string
  name: string
  path: string
}

interface ShellProps {
  modules: { id: string; name: string; icon: string; color: string }[]
  projects: ProjectInfo[]
  selectedProject: ProjectInfo | null
  onSelectProject: (id: string) => void
  children: ComponentChildren
}

export const Shell: FunctionComponent<ShellProps> = ({
  modules, projects, selectedProject, onSelectProject, children
}) => {
  return (
    <div class="flex h-screen bg-forge-bg text-forge-text">
      {/* Sidebar */}
      <nav class="w-56 bg-forge-surface border-r border-forge-border flex flex-col">
        <div class="p-4 border-b border-forge-border">
          <h1 class="text-lg font-bold">Forge</h1>
        </div>

        <div class="flex-1 py-2 overflow-auto">
          {/* Home always visible */}
          <button
            class={`w-full text-left px-4 py-2.5 flex items-center gap-3 text-sm transition-colors
              ${currentModule.value === null || currentModule.value === 'home'
                ? 'bg-forge-accent/10 text-forge-accent border-r-2 border-forge-accent'
                : 'text-forge-muted hover:text-forge-text hover:bg-forge-surface'}`}
            onClick={() => { currentModule.value = 'home' }}
          >
            <span class="w-2 h-2 rounded-full bg-forge-accent" />
            <span>Home</span>
          </button>

          {/* Modules only show when a project is selected */}
          {selectedProject && (
            <>
              <div class="px-4 pt-4 pb-2">
                <span class="text-xs font-medium text-forge-muted uppercase tracking-wider">Modules</span>
              </div>
              {modules.filter(m => m.id !== 'home').map(m => (
                <button
                  key={m.id}
                  class={`w-full text-left px-4 py-2.5 flex items-center gap-3 text-sm transition-colors
                    ${currentModule.value === m.id
                      ? 'bg-forge-accent/10 text-forge-accent border-r-2 border-forge-accent'
                      : 'text-forge-muted hover:text-forge-text hover:bg-forge-surface'}`}
                  onClick={() => { currentModule.value = m.id }}
                >
                  <span class="w-2 h-2 rounded-full" style={{ backgroundColor: m.color }} />
                  <span>{m.name}</span>
                </button>
              ))}
            </>
          )}
        </div>

        <div class="p-4 border-t border-forge-border">
          <button
            class="text-xs text-forge-muted hover:text-forge-text"
            onClick={toggleTheme}
          >
            {theme.value === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
        </div>
      </nav>

      {/* Main */}
      <main class="flex-1 overflow-auto flex flex-col">
        {/* Top bar with project selector */}
        <header class="h-14 border-b border-forge-border flex items-center justify-between px-6 shrink-0">
          <div class="flex items-center gap-3">
            {projects.length > 0 ? (
              <select
                class="bg-forge-surface border border-forge-border rounded-lg px-3 py-1.5 text-sm text-forge-text focus:border-forge-accent focus:outline-none cursor-pointer"
                value={selectedProject?.id ?? ''}
                onChange={(e) => onSelectProject((e.target as HTMLSelectElement).value)}
              >
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            ) : (
              <span class="text-sm text-forge-muted">No project selected</span>
            )}
            {selectedProject && (
              <span class="text-xs text-forge-muted truncate max-w-md">{selectedProject.path}</span>
            )}
          </div>
          <div class="flex items-center gap-3">
            <kbd class="text-xs text-forge-muted bg-forge-surface px-2 py-1 rounded border border-forge-border">
              Cmd+K
            </kbd>
          </div>
        </header>

        {/* Content */}
        <div class="flex-1 overflow-auto p-6">
          {children}
        </div>
      </main>

      <ToastContainer />
    </div>
  )
}
