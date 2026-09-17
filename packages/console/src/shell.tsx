import { type FunctionComponent, type ComponentChildren } from 'preact'
import { signal } from '@preact/signals'
import { ToastContainer } from '@forge-dev/ui'

type Theme = 'dark' | 'light'
const THEME_KEY = 'forge-theme'

const readTheme = (): Theme => {
  try {
    return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export const theme = signal<Theme>(readTheme())
document.documentElement.setAttribute('data-theme', theme.value)

export const setTheme = (next: Theme) => {
  theme.value = next
  document.documentElement.setAttribute('data-theme', next)
  try { localStorage.setItem(THEME_KEY, next) } catch {}
}

// the overlay sidebar on narrow windows
export const sidebarOpen = signal(false)

export const toggleTheme = () => setTheme(theme.value === 'dark' ? 'light' : 'dark')

export const Shell: FunctionComponent<{ sidebar: ComponentChildren; children: ComponentChildren }> = ({ sidebar, children }) => (
  <div class="forge-shell" style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: '236px minmax(0,1fr)', background: 'var(--bg)', color: 'var(--ink)' }}>
    {sidebar}
    <div class={`sb-scrim${sidebarOpen.value ? ' open' : ''}`} onClick={() => { sidebarOpen.value = false }} />
    <div class="min-w-0 flex flex-col relative" style={{ minHeight: '100vh' }}>
      {children}
    </div>
    <ToastContainer />
  </div>
)
