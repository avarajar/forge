import { signal } from '@preact/signals'
import { showToast } from '@forge-dev/ui'
import type { MarketplaceEntry, PluginEntry } from '@forge-dev/core'
import { errorText, postJson } from '../config/api.js'

export const pluginPath = (id: string) => `/api/skills/plugins/${encodeURIComponent(id)}`

// runs a plugin command; toasts the server's error and resolves to null on failure
export async function runPluginCommand<T>(url: string, body: object): Promise<T | null> {
  try {
    return await postJson<T>(url, body)
  } catch (err) {
    showToast(errorText(err), 'error')
    return null
  }
}

export const plugins = signal<PluginEntry[] | null>(null)
export const marketplaces = signal<MarketplaceEntry[] | null>(null)

export async function loadPlugins(): Promise<void> {
  const res = await fetch('/api/skills/plugins')
  if (!res.ok) throw new Error('fetch failed')
  plugins.value = await res.json() as PluginEntry[]
}

export async function loadMarketplaces(): Promise<void> {
  const res = await fetch('/api/skills/marketplaces')
  if (!res.ok) throw new Error('fetch failed')
  marketplaces.value = await res.json() as MarketplaceEntry[]
}
