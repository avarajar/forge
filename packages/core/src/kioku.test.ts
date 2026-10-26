import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Kioku, createTerminalRunner, rememberPrompt, resolveKiokuBin } from './kioku.js'
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
  [ME.key]: { brains: [{ brain: 'me', namespaces: [{ namespace: 'me', pages: { memory: 2, rule: 1 } }, { namespace: 'me/tools', pages: { memory: 1 } }] }] },
  [ACME.key]: { brains: [{ brain: 'me', namespaces: [{ namespace: 'me', pages: { memory: 9 } }] }, { brain: 'acme', namespaces: [{ namespace: 'payments', pages: { decision: 4 } }] }] },
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
      { ...ME, pages: 4, kinds: { memory: 3, rule: 1 }, namespaces: ['me', 'me/tools'], touched: '2026-10-20T10:00:00Z' },
      { ...ACME, pages: 4, kinds: { decision: 4 }, namespaces: ['payments'], touched: '2026-10-22T10:00:00Z' },
      { ...GONE, pages: 0, kinds: {}, namespaces: [], touched: null },
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

  it('reads the last JSON line a command prints in a terminal, past progress with braces', async () => {
    const bin = script(`echo 'pushing {main}' >&2; echo '{"brain":"me","status":"pushed"}'; echo 'done {ok' >&2`)
    const result = await createTerminalRunner({ PATH: process.env.PATH ?? '' }, 5_000)(bin, [], dir)
    expect(result).toMatchObject({ code: 0, stdout: '{"brain":"me","status":"pushed"}' })
  })

  it('says kioku is not installed when the binary is missing', async () => {
    await expect(make(join(dir, 'missing')).openViewer()).rejects.toThrow('kioku is not installed')
  })
})

describe('Kioku.save', () => {
  const answer = (value: unknown, code = 0) => {
    const calls: { args: string[]; cwd: string; input: string }[] = []
    const write: Runner = async (_bin, args, cwd, input = '') => {
      calls.push({ args, cwd, input })
      return { code, stdout: JSON.stringify(value), stderr: '' }
    }
    return { kioku: new Kioku({ bin: 'kioku', run: fakeRun().run, write }), calls }
  }
  const page = { brain: ACME.key, type: 'decision', title: 'Postgres', summary: 'We use Postgres', body: '## Decision\n\nPostgres.\n' }

  it('saves through kioku page save in the brain folder, with the body on stdin', async () => {
    const { kioku, calls } = answer({ status: 'done', brain: 'acme', path: 'knowledge/payments/decisions/postgres.md', commit: 'abc', publication: 'pushed' })
    expect(await kioku.save({ ...page, namespace: 'payments' })).toEqual({ status: 'done', brain: 'acme', path: 'knowledge/payments/decisions/postgres.md', publication: 'pushed' })
    expect(calls[0]).toEqual({
      args: ['page', 'save', '--brain', ACME.key, '--kind', 'knowledge', '--sub', 'decision', '--title', 'Postgres', '--summary', 'We use Postgres', '--source', 'Forge', '--namespace', 'payments', '--json'],
      cwd: ACME.folder,
      input: page.body,
    })
  })

  it('reads the brains again after a save', async () => {
    const { run, calls } = fakeRun()
    const kioku = new Kioku({ bin: 'kioku', run, write: async () => ({ code: 0, stdout: JSON.stringify({ status: 'done', path: 'memory/x.md' }), stderr: '' }) })
    await kioku.status()
    await kioku.save({ ...page, type: 'memory' })
    await kioku.status()
    expect(calls.filter(c => c[0] === '--version')).toHaveLength(2)
  })

  it('hands back similar pages and the namespaces to choose from', async () => {
    const similar = { brain: 'acme', path: 'a.md', title: 'Postgres', kind: 'knowledge', subkind: 'decision', summary: 'x', touched: '2026-10-01' }
    expect(await answer({ status: 'similar', similar: [similar] }).kioku.save(page)).toEqual({ status: 'similar', similar: [{ brain: 'acme', path: 'a.md', title: 'Postgres', summary: 'x' }] })
    expect(await answer({ status: 'namespace', namespaces: [{ namespace: 'payments', summary: 'Money', pages: 3, below: 0 }] }).kioku.save(page))
      .toEqual({ status: 'namespace', namespaces: [{ namespace: 'payments', summary: 'Money' }] })
  })

  it('passes --create to save next to similar pages', async () => {
    const { kioku, calls } = answer({ status: 'done', path: 'b.md' })
    await kioku.save({ ...page, create: true })
    expect(calls[0].args).toContain('--create')
  })

  it("turns kioku's refusal into a 400 with its message", async () => {
    const { kioku } = answer({ status: 'error', error: { code: 'invalid_page', message: 'the section `## Why` is missing' } }, 1)
    await expect(kioku.save(page)).rejects.toMatchObject({ status: 400, message: 'the section `## Why` is missing' })
  })

  it('refuses an unknown type and a brain that is not on disk', async () => {
    await expect(answer({}).kioku.save({ ...page, type: 'skill' })).rejects.toMatchObject({ status: 400 })
    await expect(answer({}).kioku.save({ ...page, brain: GONE.key })).rejects.toMatchObject({ status: 404 })
  })
})

describe('Kioku brains', () => {
  const PROJECT_DIR = mkdtempSync(join(tmpdir(), 'forge-kioku-project-'))
  afterAll(() => rmSync(PROJECT_DIR, { recursive: true, force: true }))

  const answer = (answers: Record<string, unknown> = {}, code = 0) => {
    const calls: { args: string[]; cwd: string }[] = []
    const write: Runner = async (_bin, args, cwd) => {
      calls.push({ args, cwd })
      return { code, stdout: JSON.stringify(answers[args.slice(0, 2).join(' ')] ?? answers[args[0]] ?? {}), stderr: '' }
    }
    const kioku = new Kioku({ bin: 'kioku', run: fakeRun().run, write, projects: () => ({ shop: { path: PROJECT_DIR }, gone: { path: '/nowhere' } }) })
    return { kioku, calls }
  }

  it('makes a brain on this machine with kioku brain create', async () => {
    const { kioku, calls } = answer({ 'brain create': { action: 'created', brain: 'github.com/acme/brain-shop', name: 'shop', tier: 'project', path: '/b/shop', commit: 'abc', publication: 'local' } })
    expect(await kioku.createBrain({ repo: 'acme/brain-shop', tier: 'project', team: 'acme/brain', language: 'es' })).toEqual({ brain: 'github.com/acme/brain-shop', name: 'shop', path: '/b/shop' })
    expect(calls[0].args).toEqual(['brain', 'create', 'acme/brain-shop', '--tier', 'project', '--team', 'acme/brain', '--language', 'es', '--json'])
  })

  it('refuses names kioku would read as flags, and passes on its own refusals', async () => {
    const { kioku, calls } = answer({ 'brain create': { error: { code: 'brain_exists', message: '/b/shop already holds a brain' } } }, 1)
    await expect(kioku.createBrain({ repo: '--dir=/x', tier: 'project' })).rejects.toMatchObject({ status: 400 })
    await expect(kioku.createBrain({ repo: 'acme/shop', tier: 'client' })).rejects.toMatchObject({ status: 400 })
    await expect(kioku.addArea(ACME.key, '-x', 'y')).rejects.toMatchObject({ status: 400 })
    expect(calls).toHaveLength(0)
    await expect(kioku.createBrain({ repo: 'acme/shop', tier: 'project' })).rejects.toMatchObject({ status: 400, message: '/b/shop already holds a brain' })
  })

  it('adds an area in the brain folder', async () => {
    const { kioku, calls } = answer({ 'namespace add': { status: 'done', brain: 'acme', namespace: 'payments', commit: 'abc', publication: 'pushed' } })
    expect(await kioku.addArea(ACME.key, 'payments', '-money in and out')).toEqual({ brain: 'acme', namespace: 'payments' })
    expect(calls[0]).toEqual({ args: ['namespace', 'add', 'payments', '--summary=-money in and out', '--brain', ACME.key, '--json'], cwd: ACME.folder })
  })

  it('links a project, making the brains this machine does not know first', async () => {
    const { kioku, calls } = answer({ init: { file: `${PROJECT_DIR}/kioku.yaml`, wrote: true }, 'brain create': { brain: 'github.com/acme/brain-shop', name: 'shop', path: '/b' } })
    expect(await kioku.linkProject({ project: 'shop', brain: 'acme/brain-shop', team: 'acme/brain' })).toEqual({ file: `${PROJECT_DIR}/kioku.yaml`, created: ['github.com/acme/brain-shop'] })
    expect(calls.map(c => c.args.slice(0, 3))).toEqual([['brain', 'create', 'acme/brain-shop'], ['init', 'acme/brain-shop', '--team']])
    expect(calls[1].cwd).toBe(PROJECT_DIR)
  })

  it('publishes through the terminal runner, never the piped one', async () => {
    const calls: { args: string[]; cwd: string }[] = []
    const terminal: Runner = async (_bin, args, cwd) => {
      calls.push({ args, cwd })
      return { code: 0, stdout: JSON.stringify({ brain: ME.key, status: 'made', remote: 'github.com/me/brain' }), stderr: '' }
    }
    const kioku = new Kioku({ bin: 'kioku', run: fakeRun().run, write: async () => { throw new Error('piped') }, terminal })
    expect(await kioku.publish(ME.key)).toEqual({ brain: ME.key, status: 'made', remote: 'github.com/me/brain' })
    expect(calls[0]).toEqual({ args: ['brain', 'publish', ME.key, '--json'], cwd: ME.folder })
    await expect(kioku.publish(ACME.key)).rejects.toMatchObject({ status: 400 })
    await expect(kioku.publish(ME.key, '--upload-pack=x')).rejects.toMatchObject({ status: 400 })
  })

  it('refuses a project that is not on this machine', async () => {
    await expect(answer().kioku.linkProject({ project: 'gone', brain: 'acme/x' })).rejects.toMatchObject({ status: 404 })
  })
})

describe('rememberPrompt', () => {
  it('keeps the note on one line', () => {
    expect(rememberPrompt('  payments retry\n three   times ')).toBe('Remember this with kioku: payments retry three times')
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

  it('checks a page before saving it', async () => {
    const app = kiokuRoutes(new Kioku({ bin: 'kioku', run: fakeRun().run }))
    const res = await app.request('/pages', { method: 'POST', body: JSON.stringify({ brain: ACME.key, type: 'memory', title: ' ' }) })
    expect(res.status).toBe(400)
  })

  it('types the note into the live session, and says when there is none', async () => {
    const typed: string[][] = []
    const app = kiokuRoutes(new Kioku({ bin: 'kioku', run: fakeRun().run }), {
      type: (project, sessionDir, text) => { typed.push([project, sessionDir, text]); return sessionDir === 'task-a' },
      canRemember: (_project, sessionDir) => sessionDir !== 'task-codex',
    })
    const send = (sessionDir: string, text = 'cap retries') => app.request('/remember', { method: 'POST', body: JSON.stringify({ project: 'forge', sessionDir, text }) })

    expect((await send('task-a')).status).toBe(200)
    expect(typed[0]).toEqual(['forge', 'task-a', 'Remember this with kioku: cap retries'])
    expect((await send('task-b')).status).toBe(409)
    expect((await send('task-codex')).status).toBe(400)
    expect((await send('task-a', ' ')).status).toBe(400)
    expect((await send('task-a', 'x'.repeat(501))).status).toBe(400)
  })

  it('checks a new brain and an area before asking kioku', async () => {
    const app = kiokuRoutes(new Kioku({ bin: 'kioku', run: fakeRun().run }))
    expect((await app.request('/brains', { method: 'POST', body: JSON.stringify({ repo: 'acme/x' }) })).status).toBe(400)
    expect((await app.request('/areas', { method: 'POST', body: JSON.stringify({ brain: ACME.key, area: 'x' }) })).status).toBe(400)
    expect((await app.request('/link', { method: 'POST', body: JSON.stringify({}) })).status).toBe(400)
    expect((await app.request('/publish', { method: 'POST', body: JSON.stringify({ brain: ME.key }) })).status).toBe(400)
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
