import { signal } from '@preact/signals'
import type { MarketplaceEntry, PluginEntry } from '@forge-dev/core'

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
