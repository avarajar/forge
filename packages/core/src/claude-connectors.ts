import { readCredentials, type ClaudeUsageDeps } from './usage-claude.js'

// The claude.ai connectors (Slack, Linear, Gmail…) live in the account, not in a file: Claude Code asks this
// endpoint with the account's OAuth token when it starts, and so does Forge. Not a documented API; it is the
// one Claude Code itself calls (beta header and scope included), so a change there shows as state 'error'.
const CONNECTORS_URL = 'https://api.anthropic.com/v1/mcp_servers?limit=1000'
const MCP_SERVERS_BETA = 'mcp-servers-2025-12-04'
const SCOPE = 'user:mcp_servers'
const TIMEOUT_MS = 6_000
const CACHE_MS = 5 * 60_000
const MAX_PAGES = 5

export interface ClaudeConnector {
  name: string
  /** connected: Claude Code loads its tools; needs_auth: it loads, but asks to sign in again before it has tools */
  status: 'connected' | 'needs_auth'
  tools: number
}

export interface ClaudeConnectors {
  state: 'ok' | 'not_connected' | 'expired' | 'missing_scope' | 'disabled' | 'error'
  detail: string | null
  connectors: ClaudeConnector[]
}

type Json = Record<string, unknown>
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)

// only the rows Claude Code will load: eligible ones; the rest were never connected or the org turned them off
export function mapConnectors(rows: unknown[]): ClaudeConnector[] {
  const seen = new Set<string>()
  return rows.flatMap((row): ClaudeConnector[] => {
    if (!isObject(row) || row.eligible !== true || typeof row.display_name !== 'string') return []
    const name = row.display_name
    if (seen.has(name)) return []
    seen.add(name)
    return [{
      name,
      status: row.eligibility_reason === 'connected_with_error' ? 'needs_auth' : 'connected',
      tools: Array.isArray(row.tools) ? row.tools.length : 0,
    }]
  })
}

export interface ClaudeConnectorsDeps extends ClaudeUsageDeps {
  cacheMs?: number
}

export function createClaudeConnectorsClient(deps: ClaudeConnectorsDeps = {}) {
  const now = deps.now ?? Date.now
  const cacheMs = deps.cacheMs ?? CACHE_MS
  const cache = new Map<string, { at: number; value: ClaudeConnectors }>()
  const inflight = new Map<string, Promise<ClaudeConnectors>>()

  async function fetchFor(configDir: string): Promise<ClaudeConnectors> {
    const credentials = await readCredentials(configDir, deps)
    if (!credentials) return { state: 'not_connected', detail: null, connectors: [] }
    if (credentials.expiresAt !== null && credentials.expiresAt <= now()) {
      return { state: 'expired', detail: 'The stored token has expired; open a session of this account to refresh it', connectors: [] }
    }
    if (credentials.scopes && !credentials.scopes.includes(SCOPE)) {
      return { state: 'missing_scope', detail: `The account's sign-in lacks ${SCOPE}; sign in again to load connectors`, connectors: [] }
    }
    const call = deps.fetchImpl ?? fetch
    const rows: unknown[] = []
    let page: string | null = null
    try {
      for (let i = 0; i < MAX_PAGES; i++) {
        const url: string = page ? `${CONNECTORS_URL}&page=${encodeURIComponent(page)}` : CONNECTORS_URL
        const response = await call(url, {
          headers: { authorization: `Bearer ${credentials.accessToken}`, 'anthropic-beta': MCP_SERVERS_BETA, 'anthropic-version': '2023-06-01' },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
        if (response.status === 401 || response.status === 403) return { state: 'expired', detail: 'Claude rejected the stored token', connectors: [] }
        if (!response.ok) return { state: 'error', detail: `claude.ai answered ${response.status}`, connectors: [] }
        const body = await response.json() as unknown
        if (!isObject(body) || !Array.isArray(body.data)) return { state: 'error', detail: 'claude.ai answered an unknown shape', connectors: [] }
        rows.push(...body.data)
        page = typeof body.next_page === 'string' && body.next_page ? body.next_page : null
        if (!page) break
      }
    } catch (err) {
      return { state: 'error', detail: err instanceof Error ? err.message : String(err), connectors: [] }
    }
    return { state: 'ok', detail: null, connectors: mapConnectors(rows) }
  }

  return {
    /** The account's claude.ai connectors; kept 5 min, and the last good list stays when a later read fails */
    async get(configDir: string, options: { disabled?: boolean; fresh?: boolean } = {}): Promise<ClaudeConnectors> {
      if (options.disabled) return { state: 'disabled', detail: 'disableClaudeAiConnectors is on in this account\'s settings', connectors: [] }
      const hit = cache.get(configDir)
      if (hit && !options.fresh && now() - hit.at < cacheMs) return hit.value
      const running = inflight.get(configDir)
      if (running) return running
      const next = fetchFor(configDir).then((value) => {
        if (value.state === 'ok' || !hit || hit.value.state !== 'ok') {
          cache.set(configDir, { at: now(), value })
          return value
        }
        // a transient failure keeps the list Claude Code most likely still has, and asks again next time
        return hit.value
      }).finally(() => inflight.delete(configDir))
      inflight.set(configDir, next)
      return next
    },
  }
}
