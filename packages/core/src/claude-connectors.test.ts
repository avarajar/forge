import { describe, expect, it } from 'vitest'
import { createClaudeConnectorsClient, mapConnectors } from './claude-connectors.js'

const DIR = '/nowhere/forge-claude-connectors'
const token = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({ claudeAiOauth: { accessToken: 'oat-test', expiresAt: Date.now() + 60_000, scopes: ['user:inference', 'user:mcp_servers'], ...extra } })
const row = (display_name: string, reason: string, tools: number | null, eligible = true) =>
  ({ type: 'mcp_server', id: `mcpsrv_${display_name}`, display_name, eligible, eligibility_reason: reason, tools: tools === null ? null : Array.from({ length: tools }, (_, i) => ({ name: `t${i}` })) })
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })

describe('mapConnectors', () => {
  it('keeps the connectors Claude Code loads, with their tool count', () => {
    expect(mapConnectors([
      row('Slack', 'connected', 13),
      row('Figma', 'connected_with_error', 0),
      row('Otto', 'never_connected_no_auto_connect', 0, false),
      row('Claude Docs', 'not_an_org_connector', null),
      row('Slack', 'connected', 2),
      'junk',
    ])).toEqual([
      { name: 'Slack', status: 'connected', tools: 13 },
      { name: 'Figma', status: 'needs_auth', tools: 0 },
      { name: 'Claude Docs', status: 'connected', tools: 0 },
    ])
  })
})

describe('createClaudeConnectorsClient', () => {
  it('asks claude.ai with the account token and the beta Claude Code sends', async () => {
    let seen: { url: string; headers: Headers } | null = null
    const client = createClaudeConnectorsClient({
      readKeychain: () => token(),
      fetchImpl: async (url, init) => {
        seen = { url: String(url), headers: new Headers(init?.headers) }
        return ok({ data: [row('Linear', 'connected', 3)], next_page: null })
      },
    })
    const result = await client.get(DIR)
    expect(result).toEqual({ state: 'ok', detail: null, connectors: [{ name: 'Linear', status: 'connected', tools: 3 }] })
    expect(seen!.url).toBe('https://api.anthropic.com/v1/mcp_servers?limit=1000')
    expect(seen!.headers.get('authorization')).toBe('Bearer oat-test')
    expect(seen!.headers.get('anthropic-beta')).toBe('mcp-servers-2025-12-04')
  })

  it('follows next_page', async () => {
    const urls: string[] = []
    const client = createClaudeConnectorsClient({
      readKeychain: () => token(),
      fetchImpl: async (url) => {
        urls.push(String(url))
        return urls.length === 1 ? ok({ data: [row('A', 'connected', 1)], next_page: 'p 2' }) : ok({ data: [row('B', 'connected', 1)], next_page: null })
      },
    })
    expect((await client.get(DIR)).connectors.map(c => c.name)).toEqual(['A', 'B'])
    expect(urls[1]).toContain('&page=p%202')
  })

  it('says why there is no list, without calling claude.ai', async () => {
    let calls = 0
    const fetchImpl = async () => { calls++; return ok({ data: [] }) }
    expect((await createClaudeConnectorsClient({ readKeychain: () => null, fetchImpl }).get(DIR)).state).toBe('not_connected')
    expect((await createClaudeConnectorsClient({ readKeychain: () => token({ expiresAt: 1 }), fetchImpl }).get(DIR)).state).toBe('expired')
    expect((await createClaudeConnectorsClient({ readKeychain: () => token({ scopes: ['user:inference'] }), fetchImpl }).get(DIR)).state).toBe('missing_scope')
    expect((await createClaudeConnectorsClient({ readKeychain: () => token(), fetchImpl }).get(DIR, { disabled: true })).state).toBe('disabled')
    expect(calls).toBe(0)
  })

  it('reports a rejected token and an unknown answer', async () => {
    const rejected = createClaudeConnectorsClient({ readKeychain: () => token(), fetchImpl: async () => new Response('', { status: 401 }) })
    expect((await rejected.get(DIR)).state).toBe('expired')
    const odd = createClaudeConnectorsClient({ readKeychain: () => token(), fetchImpl: async () => ok({ servers: [] }) })
    expect((await odd.get(DIR)).state).toBe('error')
  })

  it('caches per config dir and keeps the last good list when a read fails', async () => {
    let clock = 0
    let fail = false
    let calls = 0
    const client = createClaudeConnectorsClient({
      now: () => clock,
      readKeychain: () => token({ expiresAt: null }),
      fetchImpl: async () => { calls++; return fail ? new Response('', { status: 500 }) : ok({ data: [row('Slack', 'connected', 1)] }) },
    })
    await client.get(DIR)
    await client.get(DIR)
    expect(calls).toBe(1)
    clock = 10 * 60_000
    fail = true
    const after = await client.get(DIR)
    expect(calls).toBe(2)
    expect(after.state).toBe('ok')
    expect(after.connectors[0].name).toBe('Slack')
  })
})
