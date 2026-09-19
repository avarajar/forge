import { signal } from '@preact/signals'
import type { PluginEntry } from '@forge-dev/core'

export const plugins = signal<PluginEntry[] | null>(null)

export async function loadPlugins(): Promise<void> {
  const res = await fetch('/api/skills/plugins')
  if (!res.ok) throw new Error('fetch failed')
  plugins.value = await res.json() as PluginEntry[]
}
