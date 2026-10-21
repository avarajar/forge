import { signal } from '@preact/signals'

export const forgeVersion = signal<string | null>(null)

export async function loadForgeVersion(): Promise<void> {
  const res = await fetch('/api/health')
  forgeVersion.value = ((await res.json()) as { version?: string | null }).version ?? null
}
