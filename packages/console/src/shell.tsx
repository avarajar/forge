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
      <header class="h-14 border-b border-forge-border flex items-center justify-between px-6">
        <div class="flex items-center gap-3">
          <h1 class="text-lg font-bold">Forge</h1>
        </div>
        <div class="flex items-center gap-3">
          <button class="text-xs text-forge-muted hover:text-forge-text" onClick={toggleTheme}>
            {theme.value === 'dark' ? 'Light' : 'Dark'}
          </button>
        </div>
      </header>
      <main class="max-w-4xl mx-auto p-6">
        {children}
      </main>
      <ToastContainer />
    </div>
  )
}
