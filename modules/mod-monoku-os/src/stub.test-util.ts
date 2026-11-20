import { vi } from 'vitest'
import type { AgentRunInput, ForgeContext, ModuleSettings } from '@forge-dev/sdk'

export const yo = { persona: { nombre: 'José Andrade', usuario: 'jose', correo: 'jose@monoku.com' } }

export function answer(meToca: { tickets?: unknown[]; solicitudes?: unknown[] }, clientes?: unknown, seguidos?: unknown[]) {
  return { text: JSON.stringify({ yo, me_toca: { tickets: meToca.tickets ?? [], solicitudes: meToca.solicitudes ?? [] }, clientes: clientes ?? null, ...(seguidos ? { seguidos } : {}) }) }
}

export function stub(settings: ModuleSettings = {}) {
  const store = new Map<string, unknown>()
  const run = vi.fn(async (_input: AgentRunInput): Promise<{ text: string }> => answer({}))
  const start = vi.fn(async (i: { project?: string }) => ({ project: i.project ?? 'p', sessionDir: 'work-1' }))
  const badge = vi.fn(async () => {})
  const clear = vi.fn(async () => {})
  const attention = vi.fn(async () => {})
  // origin of each CW project folder, for git remote get-url
  const remotes: Record<string, string> = {}
  const exec = vi.fn(async (_cmd: string, _args: string[], o?: { cwd?: string }) => {
    const url = o?.cwd ? remotes[o.cwd] : undefined
    return url ? { exitCode: 0, output: `${url}\n`, timedOut: false } : { exitCode: 2, output: 'error: No such remote', timedOut: false }
  })
  const sessions: Array<{ project: string; sessionDir: string; live?: boolean }> = []
  const ctx = {
    module: { id: 'monoku-os', version: '0.1.0' },
    settings: { account: 'monoku', when: 'on-open', every: 30, time: '08:00', model: 'haiku', projects: [], ...settings },
    storage: {
      get: async (k: string) => store.get(k),
      set: async (k: string, v: unknown) => void store.set(k, v),
      delete: async (k: string) => void store.delete(k),
      list: async (p = '') => [...store.keys()].filter(k => k.startsWith(p)),
    },
    notify: { badge, clear, attention },
    agent: { run },
    cw: { start },
    shell: { exec },
    sessions: { list: async () => sessions, send: vi.fn() },
    projects: { list: async () => [{ name: 'acme-web', path: '/p/acme-web' }, { name: 'acme-api', path: '/p/acme-api' }], dir: async () => null },
    log: { info: () => {}, warn: () => {}, error: () => {} },
  } as unknown as ForgeContext
  return { ctx, store, run, start, badge, clear, attention, sessions, remotes, exec }
}
