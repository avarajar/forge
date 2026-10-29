import { signal } from '@preact/signals'
import { useEffect } from 'preact/hooks'
import type { KiokuBrain, KiokuLabs, KiokuReleases, KiokuStatus } from '@forge-dev/core'
import { requestJson } from '../config/api.js'

export const kioku = signal<KiokuStatus | null>(null)
// only the memory page reads these, so they load when it opens rather than with each poll
export const kiokuReleases = signal<KiokuReleases | null>(null)
export const kiokuLabs = signal<KiokuLabs | null>(null)

// the server keeps a reading for a minute, so polling faster gains nothing
const POLL_MS = 60_000

let inFlight: Promise<void> | null = null
let timer: ReturnType<typeof setInterval> | null = null
let watchers = 0

export function loadKioku(fresh = false): Promise<void> {
  if (inFlight && !fresh) return inFlight
  inFlight = fetch(`/api/kioku/status${fresh ? '?fresh=1' : ''}`)
    .then(r => r.json() as Promise<KiokuStatus>)
    // an unchanged reading keeps the same object, so every task row does not re-render each poll
    .then((status) => { if (JSON.stringify(status) !== JSON.stringify(kioku.value)) kioku.value = status })
    .catch(() => { kioku.value ??= { installed: false, version: null, brains: [], projects: {}, activity: [], viewer: null } })
    .finally(() => { inFlight = null })
  return inFlight
}

export async function loadReleases(fresh = false): Promise<void> {
  kiokuReleases.value = await requestJson<KiokuReleases>('GET', `/api/kioku/releases${fresh ? '?fresh=1' : ''}`).catch(() => kiokuReleases.value)
}

export async function loadLabs(): Promise<void> {
  kiokuLabs.value = await requestJson<KiokuLabs>('GET', '/api/kioku/labs').catch(() => null)
}

// the memory page, task rows and task detail share one poll
export function watchKioku(): () => void {
  watchers += 1
  if (!kioku.value) void loadKioku()
  if (!timer) timer = setInterval(() => { if (document.visibilityState === 'visible') void loadKioku() }, POLL_MS)
  return () => {
    watchers -= 1
    if (watchers === 0 && timer) {
      clearInterval(timer)
      timer = null
    }
  }
}

export const brainName = (b: Pick<KiokuBrain, 'name' | 'key'>): string => b.name ?? b.key

export const sumPages = (brains: KiokuBrain[]): number => brains.reduce((sum, b) => sum + b.pages, 0)

// the brains a session in this project loads, personal first
export function chainFor(project: string): KiokuBrain[] {
  const status = kioku.value
  if (!status?.installed) return []
  return (status.projects[project] ?? []).flatMap(link => status.brains.find(b => brainName(b) === link.name) ?? [])
}

// watches the shared store and returns the chain of one project
export function useKiokuChain(project: string): KiokuBrain[] {
  useEffect(() => watchKioku(), [])
  return chainFor(project)
}
