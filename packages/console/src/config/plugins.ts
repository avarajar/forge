import type { PluginEntry } from '@forge-dev/core'

// area folders the plugin already uses: the segment after skills/ in each skill path
export function pluginAreas(plugin: PluginEntry): string[] {
  const areas = new Set<string>()
  for (const s of plugin.skills) {
    const parts = s.path.split(/[\\/]/)
    const i = parts.lastIndexOf('skills')
    if (i >= 0 && parts.length - i === 3) areas.add(parts[i + 1]!)
  }
  return [...areas].sort()
}

// task slug for the cw work session, e.g. "add-skill-summarize-release-notes"
export function proposeTaskName(text: string): string {
  const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30).replace(/-+$/, '')
  return `add-skill-${slug || Date.now()}`
}

export function buildProposeDescription(plugin: PluginEntry, text: string, area?: string): string {
  return [
    'Add a new skill to this repository and open a pull request.',
    `The skill: ${text}`,
    area ? `Area: ${area}` : '',
    plugin.contributing ? 'Follow CONTRIBUTING.md.' : '',
    plugin.projectSkills.length > 0 ? `Use this repository's own skills: ${plugin.projectSkills.map(s => `/${s}`).join(', ')}` : '',
  ].filter(Boolean).join('\n')
}
