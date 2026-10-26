import { computed, signal } from '@preact/signals'
import { ModuleRequestError } from '@forge-dev/sdk'
import type { Confirmation, ModuleSettings, PanelClient } from '@forge-dev/sdk'
import { modules } from '../hooks/useModules.js'
import { confirmAction } from '../components/ConfirmAction.js'

type ErrorBody = { code?: string; message?: string; error?: string }

const base = (id: string) => `/api/modules/${encodeURIComponent(id)}`

async function fail(res: Response): Promise<never> {
  const body = await res.json().catch(() => ({})) as ErrorBody
  throw new ModuleRequestError(body.code ?? `http_${res.status}`, body.message ?? body.error ?? `Request failed (${res.status})`)
}

const post = (url: string, body: unknown) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

// reads an action's SSE stream until done or error
async function readStream(res: Response, onOutput: (chunk: string) => void): Promise<unknown> {
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let end: number
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, end)
      buffer = buffer.slice(end + 2)
      const event = /^event: (.*)$/m.exec(block)?.[1]
      const data = JSON.parse(/^data: (.*)$/m.exec(block)?.[1] ?? 'null') as { chunk?: string; result?: unknown } & ErrorBody
      if (event === 'output' && data.chunk) onOutput(data.chunk)
      if (event === 'done') return data.result
      if (event === 'error') throw new ModuleRequestError(data.code ?? 'module_error', data.message ?? 'action failed')
    }
  }
  throw new ModuleRequestError('module_error', 'the action stream ended early')
}

export function createPanelClient(moduleId: string, displayName: () => string, openSettings: () => void): PanelClient & { reloadSettings(): Promise<void> } {
  const settings = signal<ModuleSettings>({})
  const reloadSettings = async () => {
    const res = await fetch(`${base(moduleId)}/settings`)
    if (res.ok) settings.value = await res.json() as ModuleSettings
  }
  void reloadSettings()

  const run = async (action: string, input: unknown, token: string | undefined, onOutput?: (chunk: string) => void) => {
    const url = `${base(moduleId)}/actions/${encodeURIComponent(action)}${onOutput ? '/stream' : ''}`
    const res = await post(url, { input, token })
    if (res.status === 409) return { needsConfirmation: true as const }
    if (!res.ok) return fail(res)
    if (onOutput) return { result: await readStream(res, onOutput) }
    return { result: (await res.json() as { result: unknown }).result }
  }

  return {
    settings,
    status: computed(() => modules.value.find(m => m.id === moduleId)),
    openSettings,
    reloadSettings,
    async route<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
      const res = await fetch(`${base(moduleId)}${path.startsWith('/') ? path : `/${path}`}`, {
        method: init?.method ?? (init?.body === undefined ? 'GET' : 'POST'),
        headers: init?.body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      })
      if (!res.ok) return fail(res)
      return await res.json() as T
    },
    // an external action goes through Forge's confirmation, never the module's; a 409 means the list was stale
    async action<O>(id: string, input?: unknown, opts?: { onOutput?: (chunk: string) => void }): Promise<O | undefined> {
      const effect = modules.value.find(m => m.id === moduleId)?.actions?.find(a => a.id === id)?.effect
      if (effect !== 'external') {
        const first = await run(id, input, undefined, opts?.onOutput)
        if (!('needsConfirmation' in first)) return first.result as O
      }
      const prep = await post(`${base(moduleId)}/actions/${encodeURIComponent(id)}/prepare`, { input })
      if (!prep.ok) return fail(prep)
      const { confirmation, token } = await prep.json() as { confirmation: Confirmation; token: string }
      if (!(await confirmAction(confirmation, displayName()))) return undefined
      const second = await run(id, input, token, opts?.onOutput)
      if ('needsConfirmation' in second) throw new ModuleRequestError('confirmation_required', 'The confirmation expired; try again')
      return second.result as O
    },
  }
}
