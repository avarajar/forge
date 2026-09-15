import { signal } from '@preact/signals'
import type { CWSession } from '@forge-dev/core'
import { sessionDirOf } from '../config/types.js'

export interface EditorsResponse { enabled: boolean; editors: Array<{ id: string; label: string }> }

export const editorsInfo = signal<EditorsResponse | null>(null)

let loading: Promise<void> | null = null

export function loadEditors(): Promise<void> {
  if (!loading) {
    loading = fetch('/api/cw/editors')
      .then(res => res.json() as Promise<EditorsResponse>)
      .then((info) => { editorsInfo.value = info })
      .catch(() => { editorsInfo.value = { enabled: false, editors: [] } })
  }
  return loading
}

export async function openTaskInEditor(session: CWSession, editorId: string): Promise<void> {
  const res = await fetch('/api/cw/open-in-editor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project: session.project, sessionDir: sessionDirOf(session), editor: editorId }),
  })
  const body = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` })) as { ok: boolean; error?: string }
  if (!res.ok || !body.ok) throw new Error(body.error ?? 'Could not open the editor')
}
