import { useSignal } from '@preact/signals'
import { useEffect } from 'preact/hooks'

const API_BASE = ''

export function useApi<T>(path: string) {
  const data = useSignal<T | null>(null)
  const loading = useSignal(true)
  const error = useSignal<string | null>(null)

  const fetchData = async () => {
    loading.value = true
    try {
      const res = await fetch(`${API_BASE}${path}`)
      data.value = await res.json()
      error.value = null
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Unknown error'
    } finally {
      loading.value = false
    }
  }

  useEffect(() => {
    fetchData()
  }, [path])

  return { data, loading, error, refetch: fetchData }
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  return res.json()
}

export async function apiDelete(path: string): Promise<void> {
  await fetch(`${API_BASE}${path}`, { method: 'DELETE' })
}
