import { showToast } from '@forge-dev/ui'

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({})) as T & { error?: string }
  if (!res.ok || data.error) throw new Error(data.error ?? `Request failed (${res.status})`)
  return data
}

export const errorText = (err: unknown) => err instanceof Error ? err.message : String(err)

export function copyText(text: string, what: string): void {
  navigator.clipboard.writeText(text).then(() => showToast(`${what} copied`, 'info'), () => showToast(`Could not copy the ${what.toLowerCase()}`, 'error'))
}
