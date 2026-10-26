import { showToast } from '@forge-dev/ui'

// routes answer errors as { error } or, under /api/modules, { code, message }
export async function requestJson<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, body === undefined ? { method } : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({})) as T & { error?: string; message?: string }
  const failure = !res.ok ? (data.error ?? data.message ?? `Request failed (${res.status})`) : data.error
  if (failure) throw new Error(failure)
  return data
}

export const postJson = <T>(url: string, body: unknown) => requestJson<T>('POST', url, body)

export const errorText = (err: unknown) => err instanceof Error ? err.message : String(err)

export function copyText(text: string, what: string): void {
  navigator.clipboard.writeText(text).then(() => showToast(`${what} copied`, 'info'), () => showToast(`Could not copy the ${what.toLowerCase()}`, 'error'))
}
