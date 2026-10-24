import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Kioku, resolveKiokuBin } from './kioku.js'
import { kiokuRoutes } from './kioku-routes.js'
import type { Runner, RunResult } from './task-review.js'

const ME = { key: 'github.com/me/brain', name: 'me', tier: 'personal', folder: '/brains/me', onDisk: true, personal: true }
const ACME = { key: 'github.com/acme/brain', name: 'acme', tier: 'team', folder: '/brains/acme', onDisk: true, personal: false, remote: 'github.com/acme/brain' }
const GONE = { key: 'github.com/old/brain', name: 'old', tier: 'project', folder: '/brains/old', onDisk: false, personal: false }

const write = (brain: string, title: string, date: string) => ({ verb: 'save', title, path: `memory/${title}.md`, date, author: 'Sam', via: 'claude-code', commit: 'abc', brain })

const LOGS: Record<string, unknown[]> = {
  [ME.key]: [write('me', 'tabs over spaces', '2026-10-20T10:00:00Z')],
  [ACME.key]: [write('acme', 'postgres over mysql', '2026-10-22T10:00:00Z'), write('acme', 'deploy on tuesdays', '2026-10-01T10:00:00Z')],
}

const NAMESPACES: Record<string, unknown> = {
  [ME.key]: { brains: [{ brain: 'me', namespaces: [{ pages: { memory: 2, rule: 1 } }, { pages: { memory: 1 } }] }] },
  [ACME.key]: { brains: [{ brain: 'me', namespaces: [{ pages: { memory: 9 } }] }, { brain: 'acme', namespaces: [{ pages: { decision: 4 } }] }] },
}

const ok = (value: unknown): RunResult => ({ code: 0, stdout: JSON.stringify(value), stderr: '' })

// stands in for the kioku CLI's read verbs; a folder in `chains` answers with that chain
function fakeRun(chains: Record<string, string[]> = {}, overrides: Partial<Record<string, RunResult>> = {}) {
  const calls: string[][] = []
  const run: Runner = async (_bin, args, cwd) => {
    calls.push(args)
    const override = overrides[args[0]]
    if (override) return override
    if (args[0] === '--version') return ok({ version: '4.0.0', contract: 1 })
    const brain = args[args.indexOf('--brain') + 1]
    if (args[0] === 'namespace') return ok(NAMESPACES[brain])
    if (args[0] === 'brain' && args[1] === 'log') return ok({ since: 'x', writes: LOGS[brain] })
    const chain = (chains[cwd] ?? []).map(name => ({ name, tier: name === 'me' ? 'personal' : 'team', key: name, folder: '/x', onDisk: true }))
    return ok({ brains: [ME, ACME, GONE], chain, inside: null, untrusted: [] })
  }
  return { run, calls }
}

describe('Kioku', () => {
  let dir: string
  const kiokus: Kioku[] = []

  const script = (body: string) => {
    const bin = join(dir, `kioku-${kiokus.length}`)
    writeFileSync(bin, `#!/bin/sh\n${body}\n`)
    chmodSync(bin, 0o755)
    return bin
  }

  const make = (bin: string, startTimeoutMs?: number) => {
    const kioku = new Kioku({ bin, run: fakeRun().run, startTimeoutMs })
    kiokus.push(kioku)
    return kioku
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'forge-kioku-'))
  })

  afterEach(() => {
    kiokus.splice(0).forEach(k => k.dispose())
    rmSync(dir, { recursive: true, force: true })
  })

  it('counts each brain from its own folder and merges the activity, newest first', async () => {
    const { brains, activity, version } = await make('kioku').status()
    expect(version).toBe('4.0.0')
    expect(brains).toEqual([
      { ...ME, pages: 4, kinds: { memory: 3, rule: 1 }, touched: '2026-10-20T10:00:00Z' },
      { ...ACME, pages: 4, kinds: { decision: 4 }, touched: '2026-10-22T10:00:00Z' },
      { ...GONE, pages: 0, kinds: {}, touched: null },
    ])
    expect(activity.map(w => w.title)).toEqual(['postgres over mysql', 'tabs over spaces', 'deploy on tuesdays'])
    expect(activity[0]).toEqual({ verb: 'save', title: 'postgres over mysql', path: 'memory/postgres over mysql.md', date: '2026-10-22T10:00:00Z', author: 'Sam', brain: 'acme' })
  })

  it('reads the chain of each CW project from its folder, skipping folders that are gone', async () => {
    const { run } = fakeRun({ [dir]: ['me', 'acme'] })
    const kioku = new Kioku({ bin: 'kioku', run, projects: () => ({ forge: { path: dir }, lost: { path: join(dir, 'missing') } }) })
    expect((await kioku.status()).projects).toEqual({ forge: [{ name: 'me', tier: 'personal' }, { name: 'acme', tier: 'team' }] })
  })

  it('keeps a reading for five minutes, then serves it while the next is read', async () => {
    let now = 0
    const { run, calls } = fakeRun()
    const kioku = new Kioku({ bin: 'kioku', run, now: () => now })
    const versions = () => calls.filter(c => c[0] === '--version').length

    await kioku.status()
    await kioku.status()
    expect(versions()).toBe(1)
    await kioku.status(true)
    expect(versions()).toBe(2)
    now = 5 * 60_000 + 1
    await kioku.status()
    expect(versions()).toBe(3)
  })

  it('reports kioku as missing when it does not run', async () => {
    const kioku = new Kioku({ bin: 'kioku', run: fakeRun({}, { '--version': { code: 127, stdout: '', stderr: 'ENOENT' } }).run })
    expect(await kioku.status()).toEqual({ installed: false, version: null, brains: [], projects: {}, activity: [], viewer: null })
  })

  it('starts the viewer once and hands back the address it prints', async () => {
    const counter = join(dir, 'starts')
    const kioku = make(script(`echo x >> "${counter}"\necho '{"event":"listening","url":"http://127.0.0.1:4747/","address":"http://127.0.0.1:4747/#token=abc","port":4747}'\nexec sleep 30`))

    const [first, second] = await Promise.all([kioku.openViewer(), kioku.openViewer()])
    expect(first).toBe('http://127.0.0.1:4747/#token=abc')
    expect(second).toBe(first)
    expect(await kioku.openViewer()).toBe(first)
    expect((await kioku.status()).viewer).toBe(first)
    expect(readFileSync(counter, 'utf8')).toBe('x\n')
  })

  it('forgets the viewer once it is stopped', async () => {
    const kioku = make(script(`echo '{"event":"listening","address":"http://127.0.0.1:4747/#token=a"}'\nexec sleep 30`))
    await kioku.openViewer()
    kioku.stopViewer()
    expect((await kioku.status()).viewer).toBeNull()
  })

  it('fails with the last line kioku wrote when the viewer exits', async () => {
    const kioku = make(script(`echo 'port_in_use: 4747 is busy' >&2\nexit 1`))
    await expect(kioku.openViewer()).rejects.toThrow('port_in_use: 4747 is busy')
  })

  it('refuses an address off the loopback', async () => {
    const kioku = make(script(`echo '{"event":"listening","address":"http://evil.test/"}'\nexec sleep 30`), 300)
    await expect(kioku.openViewer()).rejects.toThrow('did not start in time')
  })

  it('says kioku is not installed when the binary is missing', async () => {
    await expect(make(join(dir, 'missing')).openViewer()).rejects.toThrow('kioku is not installed')
  })
})

describe('resolveKiokuBin', () => {
  let home: string

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'forge-kioku-home-'))
  })

  afterEach(() => {
    rmSync(home, { recursive: true, force: true })
  })

  it('falls back to the launcher install.sh writes when PATH has none', () => {
    mkdirSync(join(home, '.local', 'bin'), { recursive: true })
    writeFileSync(join(home, '.local', 'bin', 'kioku'), '')
    expect(resolveKiokuBin('', home)).toBe(join(home, '.local', 'bin', 'kioku'))
  })

  it('leaves the bare name when kioku is nowhere', () => {
    expect(resolveKiokuBin('', home)).toBe('kioku')
  })
})

describe('kiokuRoutes', () => {
  it('maps a missing binary to 404', async () => {
    const app = kiokuRoutes(new Kioku({ bin: '/nonexistent/kioku', run: fakeRun().run }))
    const res = await app.request('/viewer', { method: 'POST' })
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'kioku is not installed on this machine' })
  })

  it('serves the status, fresh on request', async () => {
    const { run, calls } = fakeRun()
    const app = kiokuRoutes(new Kioku({ bin: 'kioku', run }))
    const res = await app.request('/status')
    expect((await res.json() as { brains: unknown[] }).brains).toHaveLength(3)
    await app.request('/status?fresh=1')
    expect(calls.filter(c => c[0] === '--version')).toHaveLength(2)
  })
})
