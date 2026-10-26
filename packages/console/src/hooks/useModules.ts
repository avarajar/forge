import { signal } from '@preact/signals'
import type { ModuleStatus } from '@forge-dev/sdk'

export const modules = signal<ModuleStatus[]>([])

const EVERY_MS = 10_000
let timer: ReturnType<typeof setInterval> | null = null
let watchers = 0

export async function refreshModules(): Promise<void> {
  try {
    const res = await fetch('/api/modules')
    if (res.ok) modules.value = await res.json() as ModuleStatus[]
  } catch {
    // the next poll catches up
  }
}

const onFocus = () => { void refreshModules() }

// polls while anyone watches, and again whenever the window comes back
export function watchModules(): () => void {
  watchers++
  if (!timer) {
    void refreshModules()
    timer = setInterval(() => { void refreshModules() }, EVERY_MS)
    window.addEventListener('focus', onFocus)
  }
  return () => {
    watchers--
    if (watchers === 0 && timer) {
      clearInterval(timer)
      timer = null
      window.removeEventListener('focus', onFocus)
    }
  }
}

// modules with a view get a sidebar entry; disabled ones stay listed so their reason is visible
export const sidebarModules = (list: ModuleStatus[]) => list.filter(m => m.state !== 'legacy' && (m.view || m.state === 'disabled'))

export const moduleWarning = (m: ModuleStatus): string | null =>
  m.lastDenial ? `Denied ${m.lastDenial.permission}: ${m.lastDenial.value}` : m.lastJobError ?? m.lastEventError ?? null
