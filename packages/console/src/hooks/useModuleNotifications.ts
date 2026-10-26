import { signal, computed } from '@preact/signals'

export interface ModuleNotification {
  moduleId: string
  key: string
  kind: 'attention' | 'badge'
  title: string
  body?: string
  count?: number
  label?: string
  seen: boolean
  createdAt: string
}

export const moduleNotifications = signal<ModuleNotification[]>([])

// per module: the neutral badge total and the unseen attention count
export const moduleCounts = computed(() => {
  const counts: Record<string, { badge: number; attention: number }> = {}
  for (const n of moduleNotifications.value) {
    const c = counts[n.moduleId] ??= { badge: 0, attention: 0 }
    if (n.kind === 'badge') c.badge += n.count ?? 0
    else if (!n.seen) c.attention++
  }
  return counts
})

const VISIBLE_MS = 5000
const HIDDEN_MS = 15_000

type Listener = (n: ModuleNotification) => void

let timer: ReturnType<typeof setInterval> | null = null
let lastLoad = 0
let loaded = false
const listeners = new Set<Listener>()
const idOf = (n: ModuleNotification) => `${n.moduleId}\u0000${n.key}\u0000${n.createdAt}`

async function load(): Promise<void> {
  lastLoad = Date.now()
  try {
    const res = await fetch('/api/modules/notifications')
    if (!res.ok) return
    const { items } = await res.json() as { items: ModuleNotification[] }
    const before = new Set(moduleNotifications.value.map(idOf))
    moduleNotifications.value = items
    // what was already there when the page opened is not news
    if (loaded) {
      for (const n of items) if (n.kind === 'attention' && !n.seen && !before.has(idOf(n))) for (const l of listeners) l(n)
    }
    loaded = true
  } catch {
    // the server restarting is not worth a toast; the next poll catches up
  }
}

export const refreshModuleNotifications = load

const tick = () => {
  const every = document.visibilityState === 'visible' ? VISIBLE_MS : HIDDEN_MS
  if (Date.now() - lastLoad >= every - 100) void load()
}

// listens for new attention items; polling runs while anyone listens
export function watchModuleNotifications(listener: Listener): () => void {
  listeners.add(listener)
  if (!timer) {
    void load()
    timer = setInterval(tick, VISIBLE_MS)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer) {
      clearInterval(timer)
      timer = null
    }
  }
}

export async function markModuleSeen(moduleId: string): Promise<void> {
  moduleNotifications.value = moduleNotifications.value.map(n => n.moduleId === moduleId ? { ...n, seen: true } : n)
  await fetch(`/api/modules/${encodeURIComponent(moduleId)}/notifications/seen`, { method: 'POST' }).catch(() => {})
}
