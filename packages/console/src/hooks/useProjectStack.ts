import { signal } from '@preact/signals'
import { useEffect } from 'preact/hooks'
import type { StackDetection } from '@forge-dev/core'

const stacks = signal<Record<string, StackDetection | null>>({})
const requested = new Set<string>()

export function loadProjectStack(project: string): void {
  if (!project || requested.has(project)) return
  requested.add(project)
  fetch(`/api/cw/detect/${encodeURIComponent(project)}`)
    .then(r => r.ok ? r.json() as Promise<StackDetection> : null)
    .catch(() => null)
    .then((stack) => { stacks.value = { ...stacks.value, [project]: stack } })
}

export const stackParts = (stack: StackDetection | null | undefined): string[] => {
  if (!stack) return []
  const parts: string[] = []
  if (stack.framework) parts.push(stack.framework)
  if (stack.testRunner) parts.push(stack.testRunner)
  if (stack.hasTailwind) parts.push('Tailwind')
  if (stack.hasShadcn) parts.push('shadcn')
  if (stack.hasPlaywright) parts.push('Playwright')
  if (stack.hasDockerfile) parts.push('Docker')
  return parts
}

export function useProjectStack(project: string): StackDetection | null | undefined {
  useEffect(() => { loadProjectStack(project) }, [project])
  return stacks.value[project]
}
