import { type FunctionComponent, type ComponentChildren } from 'preact'
import { signal } from '@preact/signals'
import { ToastContainer } from '@forge-dev/ui'

export const theme = signal<'dark' | 'light'>('dark')

const toggleTheme = () => {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
  document.documentElement.setAttribute('data-theme', theme.value)
}

interface ShellProps {
  children: ComponentChildren
}

export const Shell: FunctionComponent<ShellProps> = ({ children }) => {
  return (
    <div class="min-h-screen bg-forge-bg text-forge-text">
      <header class="h-14 flex items-center justify-between px-6 backdrop-blur-sm sticky top-0 z-50" style={{ borderBottom: '1px solid rgba(42,42,62,0.6)', backgroundColor: 'rgba(10,10,20,0.8)' }}>
        <div class="flex items-center gap-2.5">
          <span class="text-xl select-none" aria-hidden="true">&#128293;</span>
          <h1 class="text-lg font-bold tracking-tight bg-gradient-to-r from-forge-accent to-forge-warning bg-clip-text text-transparent">
            Forge
          </h1>
        </div>
        <div class="flex items-center gap-3">
          <button
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-forge-muted hover:text-forge-text hover:bg-forge-surface border border-transparent hover:border-forge-border transition-all"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme.value === 'dark' ? 'light' : 'dark'} mode`}
          >
            <span class="text-sm">{theme.value === 'dark' ? '\u2600\uFE0F' : '\uD83C\uDF19'}</span>
            <span>{theme.value === 'dark' ? 'Light' : 'Dark'}</span>
          </button>
        </div>
      </header>
      <main class="max-w-4xl mx-auto px-6 py-8">
        {children}
      </main>
      <ToastContainer />
    </div>
  )
}
