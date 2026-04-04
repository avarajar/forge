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
  fullHeight?: boolean
  onLogoClick?: () => void
}

export const Shell: FunctionComponent<ShellProps> = ({ children, fullHeight, onLogoClick }) => {
  return (
    <div class={fullHeight ? 'h-screen flex flex-col bg-forge-bg text-forge-text overflow-hidden' : 'min-h-screen bg-forge-bg text-forge-text'}>
      <header class="h-14 flex items-center justify-between px-6 backdrop-blur-sm sticky top-0 z-50 shrink-0" style={{ borderBottom: '1px solid var(--forge-ghost-border)', backgroundColor: 'var(--forge-surface)' }}>
        <div
          class="flex items-center gap-2.5 cursor-pointer"
          onClick={onLogoClick}
          role={onLogoClick ? 'button' : undefined}
        >
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
      {fullHeight ? (
        <main class="flex-1 min-h-0 overflow-hidden">
          {children}
        </main>
      ) : (
        <main class="max-w-4xl mx-auto px-6 py-8">
          {children}
        </main>
      )}
      <ToastContainer />
    </div>
  )
}
