import { type FunctionComponent, type ComponentChildren } from 'preact'
import { signal } from '@preact/signals'
import { ToastContainer } from '@forge-dev/ui'

export const currentModule = signal<string | null>(null)
export const theme = signal<'dark' | 'light'>('dark')

const toggleTheme = () => {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
  document.documentElement.setAttribute('data-theme', theme.value)
}

interface ShellProps {
  modules: { id: string; name: string; icon: string; color: string }[]
  children: ComponentChildren
}

export const Shell: FunctionComponent<ShellProps> = ({ modules, children }) => {
  return (
    <div class="flex h-screen bg-forge-bg text-forge-text">
      {/* Sidebar */}
      <nav class="w-56 bg-forge-surface border-r border-forge-border flex flex-col">
        <div class="p-4 border-b border-forge-border">
          <h1 class="text-lg font-bold flex items-center gap-2">
            Forge
          </h1>
        </div>

        <div class="flex-1 py-2">
          {modules.map(m => (
            <button
              key={m.id}
              class={`w-full text-left px-4 py-2.5 flex items-center gap-3 text-sm transition-colors
                ${currentModule.value === m.id
                  ? 'bg-forge-accent/10 text-forge-accent border-r-2 border-forge-accent'
                  : 'text-forge-muted hover:text-forge-text hover:bg-forge-surface'}`}
              onClick={() => { currentModule.value = m.id }}
            >
              <span>{m.icon}</span>
              <span>{m.name}</span>
            </button>
          ))}
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
      <main class="flex-1 overflow-auto">
        {/* Top bar */}
        <header class="h-14 border-b border-forge-border flex items-center justify-between px-6">
          <div class="flex items-center gap-4">
            <span class="text-sm text-forge-muted">Forge Console</span>
          </div>
          <div class="flex items-center gap-3">
            <kbd class="text-xs text-forge-muted bg-forge-surface px-2 py-1 rounded border border-forge-border">
              Cmd+K
            </kbd>
          </div>
        </header>

        {/* Content */}
        <div class="p-6">
          {children}
        </div>
      </main>

      <ToastContainer />
    </div>
  )
}
