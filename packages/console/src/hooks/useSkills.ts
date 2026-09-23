import { signal } from '@preact/signals'
import type { SkillEntry } from '@forge-dev/core'

export const skills = signal<SkillEntry[] | null>(null)

// every scope: global, each account and each project
export async function loadSkills(): Promise<void> {
  const res = await fetch('/api/skills')
  if (!res.ok) throw new Error('fetch failed')
  skills.value = await res.json() as SkillEntry[]
}
