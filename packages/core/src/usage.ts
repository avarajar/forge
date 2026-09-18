import type { AccountUsage, CWDoctor, CWDoctorCell, UsageWindow } from './cw-types.js'
import { createLimiter } from './task-review.js'
import type { UsageProbe } from './usage-window.js'
import { probeClaudeUsage } from './usage-claude.js'
import { probeCodexUsage } from './usage-codex.js'

export type Probe = (cell: CWDoctorCell, doctor: CWDoctor) => Promise<UsageProbe>

// a harness with no entry here cannot report limits, and its cells are left out of the answer
const PROBES: Record<string, Probe> = {
  claude: cell => probeClaudeUsage(cell.config_dir),
  codex: (cell, doctor) => {
    const bin = doctor.harnesses.find(h => h.name === 'codex')?.path
    return bin
      ? probeCodexUsage(bin, cell.config_dir)
      : Promise.resolve({ state: 'error', windows: [], detail: 'codex is not on PATH' })
  },
}

export interface UsageClientDeps {
  probes?: Record<string, Probe>
}

const TTL_MS = 50_000
const MAX_CONCURRENT = 4

export function createUsageClient(deps: UsageClientDeps = {}) {
  const probes = { ...PROBES, ...deps.probes }
  // each codex probe spawns an app server, so they never all start at once
  const limit = createLimiter(MAX_CONCURRENT)
  const cache = new Map<string, { at: number; value: Promise<AccountUsage> }>()
  const lastGood = new Map<string, UsageWindow[]>()

  const settle = async (key: string, account: string, cell: CWDoctorCell, probe: Probe, doctor: CWDoctor): Promise<AccountUsage> => {
    const result = await limit(() => probe(cell, doctor))
    const base = { account, harness: cell.harness, detail: result.detail }
    if (result.state === 'ok') {
      lastGood.set(key, result.windows)
      return { ...base, state: 'ok', windows: result.windows, stale: false }
    }
    // a failed refresh degrades to the numbers we last saw rather than to nothing
    const previous = lastGood.get(key)
    if (result.state === 'error' && previous && previous.length > 0) {
      return { ...base, state: 'ok', windows: previous, stale: true }
    }
    lastGood.delete(key)
    return { ...base, state: result.state, windows: [], stale: false }
  }

  return {
    get(doctor: CWDoctor, fresh = false): Promise<AccountUsage[]> {
      const now = Date.now()
      const live = new Set<string>()
      const pending: Array<Promise<AccountUsage>> = []

      for (const account of doctor.accounts) {
        for (const cell of account.harnesses) {
          const probe = probes[cell.harness]
          if (!probe || cell.status !== 'connected') continue
          const key = `${account.name}/${cell.harness}`
          live.add(key)
          const cached = cache.get(key)
          if (!fresh && cached && now - cached.at < TTL_MS) {
            pending.push(cached.value)
            continue
          }
          const value = settle(key, account.name, cell, probe, doctor)
          cache.set(key, { at: now, value })
          pending.push(value)
        }
      }

      for (const key of cache.keys()) {
        if (live.has(key)) continue
        cache.delete(key)
        lastGood.delete(key)
      }
      return Promise.all(pending)
    },
  }
}
