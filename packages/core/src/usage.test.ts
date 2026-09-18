import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CWDoctor } from './cw-types.js'
import { createUsageClient } from './usage.js'
import { severityOf, windowLabel } from './usage-window.js'
import { claudeKeychainService, mapClaudeUsage, probeClaudeUsage } from './usage-claude.js'
import { mapCodexUsage, probeCodexUsage } from './usage-codex.js'

const FIXTURES = join(import.meta.dirname, '__fixtures__/usage')
const read = (name: string) => JSON.parse(readFileSync(join(FIXTURES, name), 'utf-8')) as Record<string, unknown>

const DIR = join(import.meta.dirname, '../.test-usage')

const credentials = (expiresAt: number) => JSON.stringify({ claudeAiOauth: { accessToken: 'oat-test', expiresAt } })

const okResponse = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })

describe('severityOf', () => {
  it('rises with the percentage', () => {
    expect(severityOf(0)).toBe('normal')
    expect(severityOf(69.9)).toBe('normal')
    expect(severityOf(70)).toBe('warning')
    expect(severityOf(89)).toBe('warning')
    expect(severityOf(90)).toBe('critical')
    expect(severityOf(140)).toBe('critical')
  })
})

describe('windowLabel', () => {
  it('names the windows the plans actually use', () => {
    expect(windowLabel(300)).toBe('5 h')
    expect(windowLabel(10080)).toBe('7 d')
    expect(windowLabel(43200)).toBe('30 d')
  })

  it('falls back to the coarsest unit that fits', () => {
    expect(windowLabel(45)).toBe('45 min')
    expect(windowLabel(120)).toBe('2 h')
    expect(windowLabel(2880)).toBe('2 d')
  })

  it('has no label for a missing duration', () => {
    expect(windowLabel(null)).toBe('')
    expect(windowLabel(0)).toBe('')
  })
})

describe('mapClaudeUsage', () => {
  it('reads the captured OAuth payload', () => {
    expect(mapClaudeUsage(read('claude-oauth-usage.json'))).toEqual([
      { label: '5 h', percent: 86, resetsAt: '2026-09-18T00:30:00.507225+00:00', severity: 'warning', scope: null },
      { label: '7 d', percent: 20, resetsAt: '2026-09-23T03:00:00.507256+00:00', severity: 'normal', scope: null },
      { label: '7 d', percent: 7, resetsAt: '2026-09-23T03:00:00.507532+00:00', severity: 'normal', scope: 'Fable' },
    ])
  })

  it('falls back to the named windows when limits is missing', () => {
    const windows = mapClaudeUsage({
      five_hour: { utilization: 91, resets_at: '2026-09-18T00:30:00Z' },
      seven_day: { utilization: 12, resets_at: null },
    })
    expect(windows).toEqual([
      { label: '5 h', percent: 91, resetsAt: '2026-09-18T00:30:00Z', severity: 'critical', scope: null },
      { label: '7 d', percent: 12, resetsAt: null, severity: 'normal', scope: null },
    ])
  })

  it('derives a severity the payload does not carry', () => {
    const [window] = mapClaudeUsage({ limits: [{ kind: 'session', percent: 95, resets_at: null }] })
    expect(window.severity).toBe('critical')
  })

  it('has no windows for an empty payload', () => {
    expect(mapClaudeUsage({})).toEqual([])
  })
})

describe('mapCodexUsage', () => {
  it('labels the free plan window by its duration', () => {
    expect(mapCodexUsage(read('codex-rate-limits.json'))).toEqual([
      { label: '30 d', percent: 20, resetsAt: '2026-10-11T20:41:04.000Z', severity: 'normal', scope: null },
    ])
  })

  it('reads both windows of a paid plan', () => {
    expect(mapCodexUsage(read('codex-rate-limits-paid.json'))).toEqual([
      { label: '5 h', percent: 41.5, resetsAt: '2026-10-11T17:33:20.000Z', severity: 'normal', scope: null },
      { label: '7 d', percent: 93, resetsAt: '2026-10-15T21:33:20.000Z', severity: 'critical', scope: null },
    ])
  })

  it('has no windows for an empty payload', () => {
    expect(mapCodexUsage({})).toEqual([])
  })
})

describe('claudeKeychainService', () => {
  it('hashes the config directory the way Claude Code does', () => {
    expect(claudeKeychainService('/Users/joselito/.cw/accounts/monoku')).toBe('Claude Code-credentials-1629fc86')
    expect(claudeKeychainService('/Users/joselito/.cw/accounts/meridian')).toBe('Claude Code-credentials-36d4963b')
  })

  it('uses the plain name for the default directory', () => {
    expect(claudeKeychainService(join(process.env.HOME ?? '', '.claude'))).toBe('Claude Code-credentials')
  })

  it('ignores a trailing slash', () => {
    expect(claudeKeychainService('/Users/joselito/.cw/accounts/monoku/')).toBe('Claude Code-credentials-1629fc86')
  })
})

describe('probeClaudeUsage', () => {
  beforeEach(() => {
    rmSync(DIR, { recursive: true, force: true })
    mkdirSync(DIR, { recursive: true })
  })

  afterAll(() => rmSync(DIR, { recursive: true, force: true }))

  it('reports the windows behind a live token', async () => {
    const probe = await probeClaudeUsage(DIR, {
      readKeychain: () => credentials(Date.now() + 60_000),
      fetchImpl: async () => okResponse(read('claude-oauth-usage.json')),
    })
    expect(probe.state).toBe('ok')
    expect(probe.windows.map(w => w.percent)).toEqual([86, 20, 7])
  })

  it('sends the token Claude Code stored, and nothing else', async () => {
    let seen: { url: string; headers: Headers } | null = null
    await probeClaudeUsage(DIR, {
      readKeychain: () => credentials(Date.now() + 60_000),
      fetchImpl: async (url, init) => {
        seen = { url: String(url), headers: new Headers(init?.headers) }
        return okResponse(read('claude-oauth-usage.json'))
      },
    })
    expect(seen!.url).toBe('https://api.anthropic.com/api/oauth/usage')
    expect(seen!.headers.get('authorization')).toBe('Bearer oat-test')
    expect(seen!.headers.get('anthropic-beta')).toBe('oauth-2025-04-20')
  })

  it('falls back to the credentials file when the keychain has nothing', async () => {
    writeFileSync(join(DIR, '.credentials.json'), credentials(Date.now() + 60_000))
    const probe = await probeClaudeUsage(DIR, {
      readKeychain: () => null,
      fetchImpl: async () => okResponse(read('claude-oauth-usage.json')),
    })
    expect(probe.state).toBe('ok')
  })

  it('is not connected when no credentials exist anywhere', async () => {
    let called = false
    const probe = await probeClaudeUsage(DIR, {
      readKeychain: () => null,
      fetchImpl: async () => { called = true; return okResponse({}) },
    })
    expect(probe.state).toBe('not_connected')
    expect(called).toBe(false)
  })

  it('never spends a request on an expired token', async () => {
    let called = false
    const probe = await probeClaudeUsage(DIR, {
      readKeychain: () => credentials(Date.now() - 1),
      fetchImpl: async () => { called = true; return okResponse({}) },
    })
    expect(probe).toMatchObject({ state: 'expired', windows: [] })
    expect(called).toBe(false)
  })

  it('reports an expired token the server rejects', async () => {
    const probe = await probeClaudeUsage(DIR, {
      readKeychain: () => credentials(Date.now() + 60_000),
      fetchImpl: async () => new Response('{"error":{"message":"expired"}}', { status: 401 }),
    })
    expect(probe.state).toBe('expired')
  })

  it('reports a failing request without throwing', async () => {
    const probe = await probeClaudeUsage(DIR, {
      readKeychain: () => credentials(Date.now() + 60_000),
      fetchImpl: async () => { throw new Error('offline') },
    })
    expect(probe.state).toBe('error')
    expect(probe.detail).toContain('offline')
  })

  it('reports a non-JSON body as an error', async () => {
    const probe = await probeClaudeUsage(DIR, {
      readKeychain: () => credentials(Date.now() + 60_000),
      fetchImpl: async () => new Response('<html>nope</html>', { status: 200 }),
    })
    expect(probe.state).toBe('error')
  })

  it('treats unreadable credentials as no credentials', async () => {
    const probe = await probeClaudeUsage(DIR, { readKeychain: () => 'not json', fetchImpl: async () => okResponse({}) })
    expect(probe.state).toBe('not_connected')
  })
})

describe('probeCodexUsage', () => {
  it('reads the rate limits the app server answers with', async () => {
    const probe = await probeCodexUsage('codex', '/codex/home', { callAppServer: async () => read('codex-rate-limits.json') })
    expect(probe.state).toBe('ok')
    expect(probe.windows).toEqual([
      { label: '30 d', percent: 20, resetsAt: '2026-10-11T20:41:04.000Z', severity: 'normal', scope: null },
    ])
  })

  it('asks the app server for the account it was pointed at', async () => {
    let seen: { bin: string; home: string } | null = null
    await probeCodexUsage('/opt/codex', '/codex/home', {
      callAppServer: async (bin, home) => { seen = { bin, home }; return read('codex-rate-limits.json') },
    })
    expect(seen).toEqual({ bin: '/opt/codex', home: '/codex/home' })
  })

  it('is not connected when the account has no rate limits', async () => {
    const probe = await probeCodexUsage('codex', '/codex/home', { callAppServer: async () => ({ rateLimits: null }) })
    expect(probe).toMatchObject({ state: 'not_connected', windows: [] })
  })

  it('reports a failing app server without throwing', async () => {
    const probe = await probeCodexUsage('codex', '/codex/home', {
      callAppServer: async () => { throw new Error('codex app-server exited') },
    })
    expect(probe.state).toBe('error')
    expect(probe.detail).toContain('codex app-server exited')
  })
})

describe('usage client', () => {
  const doctor = (cells: Array<{ harness: string; status: string; config_dir: string }>): CWDoctor => ({
    schema: 1,
    cw_version: '0.3.0',
    cw_home: '/cw',
    generated: '2026-09-17T00:00:00Z',
    harnesses: [
      { name: 'claude', installed: true, path: '/bin/claude', version: null, source: 'builtin' },
      { name: 'codex', installed: true, path: '/bin/codex', version: null, source: 'builtin' },
    ],
    accounts: [{ name: 'monoku', root: '/cw/accounts/monoku', layout: 'legacy', default_harness: 'claude', harnesses: cells as CWDoctor['accounts'][number]['harnesses'] }],
    issues: [],
    warnings: [],
  })

  const connected = doctor([
    { harness: 'claude', status: 'connected', config_dir: '/cw/accounts/monoku' },
    { harness: 'codex', status: 'connected', config_dir: '/cw/accounts/monoku/codex' },
  ])

  const stubs = () => {
    const calls = { claude: 0, codex: 0 }
    const client = createUsageClient({
      probes: {
        claude: async () => { calls.claude += 1; return { state: 'ok' as const, windows: mapClaudeUsage(read('claude-oauth-usage.json')), detail: null } },
        codex: async () => { calls.codex += 1; return { state: 'ok' as const, windows: mapCodexUsage(read('codex-rate-limits.json')), detail: null } },
      },
    })
    return { client, calls }
  }

  it('reports one entry per connected harness', async () => {
    const { client } = stubs()
    const usage = await client.get(connected)
    expect(usage.map(u => [u.account, u.harness, u.state])).toEqual([
      ['monoku', 'claude', 'ok'],
      ['monoku', 'codex', 'ok'],
    ])
    expect(usage[0].windows[0]).toMatchObject({ label: '5 h', percent: 86 })
  })

  it('leaves out a harness that cannot report limits', async () => {
    const { client, calls } = stubs()
    const usage = await client.get(doctor([{ harness: 'pi', status: 'connected', config_dir: '/cw/accounts/monoku/pi' }]))
    expect(usage).toEqual([])
    expect(calls).toEqual({ claude: 0, codex: 0 })
  })

  it('leaves out a harness nobody is logged into', async () => {
    const { client, calls } = stubs()
    const usage = await client.get(doctor([{ harness: 'claude', status: 'not_logged_in', config_dir: '/cw/accounts/monoku' }]))
    expect(usage).toEqual([])
    expect(calls.claude).toBe(0)
  })

  it('reuses a result until it goes stale', async () => {
    const { client, calls } = stubs()
    await client.get(connected)
    await client.get(connected)
    expect(calls).toEqual({ claude: 1, codex: 1 })
    await client.get(connected, true)
    expect(calls).toEqual({ claude: 2, codex: 2 })
  })

  it('probes once for concurrent callers', async () => {
    const { client, calls } = stubs()
    await Promise.all([client.get(connected), client.get(connected), client.get(connected)])
    expect(calls).toEqual({ claude: 1, codex: 1 })
  })

  it('keeps the last good windows when a refresh fails, and marks them stale', async () => {
    let fail = false
    const client = createUsageClient({
      probes: {
        claude: async () => {
          if (fail) return { state: 'error' as const, windows: [], detail: 'offline' }
          return { state: 'ok' as const, windows: mapClaudeUsage(read('claude-oauth-usage.json')), detail: null }
        },
        codex: async () => ({ state: 'ok' as const, windows: [], detail: null }),
      },
    })
    await client.get(connected)
    fail = true
    const [claude] = await client.get(connected, true)
    expect(claude).toMatchObject({ state: 'ok', stale: true, detail: 'offline' })
    expect(claude.windows.map(w => w.percent)).toEqual([86, 20, 7])
  })

  it('reports an error with no previous windows to fall back on', async () => {
    const client = createUsageClient({
      probes: {
        claude: async () => ({ state: 'error' as const, windows: [], detail: 'offline' }),
        codex: async () => ({ state: 'ok' as const, windows: [], detail: null }),
      },
    })
    const [claude] = await client.get(connected)
    expect(claude).toMatchObject({ state: 'error', stale: false, windows: [] })
  })

  it('hands each probe the config directory of its own cell', async () => {
    const seen: string[] = []
    const client = createUsageClient({
      probes: {
        claude: async (cell) => { seen.push(`claude:${cell.config_dir}`); return { state: 'ok' as const, windows: [], detail: null } },
        codex: async (cell) => { seen.push(`codex:${cell.config_dir}`); return { state: 'ok' as const, windows: [], detail: null } },
      },
    })
    await client.get(connected)
    expect(seen).toEqual(['claude:/cw/accounts/monoku', 'codex:/cw/accounts/monoku/codex'])
  })

  it('forgets an account that is no longer in the doctor snapshot', async () => {
    const { client, calls } = stubs()
    await client.get(connected)
    await client.get(doctor([]))
    await client.get(connected)
    expect(calls).toEqual({ claude: 2, codex: 2 })
  })
})
