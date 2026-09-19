import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface FixturePlugin {
  name: string
  marketplace: string
  version: string
  lastUpdated?: string
  enabled?: boolean              // omitted → no enabledPlugins key
  description?: string
  repository?: string            // plugin.json repository
  marketplaceSource?: Record<string, string>  // known_marketplaces source
  listed?: string[] | string      // plugin.json "skills" array or string root; omitted → no array
  skills: Array<{ dir: string; name?: string; description?: string }>  // dir relative to installPath
}

// writes installed_plugins.json, known_marketplaces.json, settings.json and each plugin's cache the way Claude Code lays them out
export function writePluginFixture(configDir: string, plugins: FixturePlugin[]): void {
  const installed: Record<string, unknown[]> = {}
  const marketplaces: Record<string, unknown> = {}
  const enabled: Record<string, boolean> = {}
  for (const p of plugins) {
    const id = `${p.name}@${p.marketplace}`
    const installPath = join(configDir, 'plugins', 'cache', p.marketplace, p.name, p.version)
    mkdirSync(join(installPath, '.claude-plugin'), { recursive: true })
    const manifest: Record<string, unknown> = { name: p.name, version: p.version, description: p.description ?? '' }
    if (p.repository) manifest['repository'] = p.repository
    if (p.listed) manifest['skills'] = p.listed
    writeFileSync(join(installPath, '.claude-plugin', 'plugin.json'), JSON.stringify(manifest))
    for (const s of p.skills) {
      const dir = join(installPath, s.dir)
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${s.name ?? s.dir.split('/').pop()}\ndescription: ${s.description ?? ''}\n---\n\n# body\n`)
    }
    installed[id] = [{ scope: 'user', installPath, version: p.version, lastUpdated: p.lastUpdated ?? '2026-09-01T00:00:00.000Z' }]
    if (p.marketplaceSource) marketplaces[p.marketplace] = { source: p.marketplaceSource }
    if (p.enabled !== undefined) enabled[id] = p.enabled
  }
  mkdirSync(join(configDir, 'plugins'), { recursive: true })
  writeFileSync(join(configDir, 'plugins', 'installed_plugins.json'), JSON.stringify({ version: 2, plugins: installed }))
  writeFileSync(join(configDir, 'plugins', 'known_marketplaces.json'), JSON.stringify(marketplaces))
  writeFileSync(join(configDir, 'settings.json'), JSON.stringify({ enabledPlugins: enabled }))
}
