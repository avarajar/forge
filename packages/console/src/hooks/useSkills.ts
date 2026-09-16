import { signal } from '@preact/signals'
import type { SkillEntry } from '@forge-dev/core'

export const skills = signal<SkillEntry[] | null>(null)

export async function loadSkills(account: string, project: string): Promise<void> {
  const params = new URLSearchParams()
  if (account) params.set('account', account)
  if (project) params.set('project', project)
  const res = await fetch(`/api/skills?${params.toString()}`)
  if (!res.ok) throw new Error('fetch failed')
  skills.value = await res.json() as SkillEntry[]
}
