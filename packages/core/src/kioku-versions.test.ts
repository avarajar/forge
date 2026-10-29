import { describe, it, expect } from 'vitest'
import { Kioku } from './kioku.js'
import { kiokuRoutes } from './kioku-routes.js'
import { commandLine, compareVersions, pickReleases, readLabs, readUpdate } from './kioku-versions.js'
import type { Runner, RunResult } from './task-review.js'

const ok = (value: unknown): RunResult => ({ code: 0, stdout: JSON.stringify(value), stderr: '' })
const fail = (value: unknown): RunResult => ({ code: 1, stdout: JSON.stringify(value), stderr: '' })

const release = (tag: string, prerelease: boolean, extra: Record<string, unknown> = {}) => ({ tag_name: tag, prerelease, draft: false, published_at: '2026-10-29T19:54:34Z', body: `Kioku ${tag}.`, html_url: `https://github.com/monoku/kioku/releases/tag/${tag}`, ...extra })
const RELEASES = [release('v5.0.0-rc.1', true), release('v4.0.0', false), release('v4.0.0-rc.4', true), release('v3.3.0', false), release('v6.0.0', false, { draft: true }), release('nightly', true)]

const LAB = { name: 'recall-graph', title: 'Recall graph', about: 'Follows links when it recalls', enabled: false, settings: { depth: 2 } }

// stands in for kioku and gh; `labs` undefined answers like kioku 4.x
function fake(opts: { version?: string; labs?: unknown[]; gh?: RunResult } = {}) {
  const calls: { bin: string; args: string[] }[] = []
  const terminal: { bin: string; args: string[] }[] = []
  let labs = opts.labs
  const run: Runner = async (bin, args) => {
    calls.push({ bin, args })
    if (bin === 'gh') return opts.gh ?? ok(RELEASES)
    if (args[0] === '--version') return ok({ version: opts.version ?? '4.0.0', contract: 1 })
    if (args[0] === 'labs') return labs ? ok({ labs }) : fail({ error: { code: 'unknown_verb', message: 'unknown verb "labs"' } })
    if (args[0] === 'update') return ok({ status: 'available', version: args[1], was: '4.0.0', installed: false, agents: [], refreshed: null })
    return fail({ error: { message: 'unexpected' } })
  }
  const term: Runner = async (bin, args) => {
    terminal.push({ bin, args })
    if (args[0] === 'update') return ok({ status: 'updated', version: args[1], was: '4.0.0', latest: '4.0.0', agents: [{ host: 'claude-code', name: 'kioku@kioku', from: '4.0.0', to: args[1], changed: true }], refreshed: ['me'], finishError: null })
    if (args[0] === 'config') {
      labs = labs?.map(l => ({ ...(l as object), enabled: args[3] === 'true' }))
      return ok({ key: args[2], value: args[3] })
    }
    return fail({ error: { message: 'unexpected' } })
  }
  return { kioku: new Kioku({ bin: '/home/me/.local/bin/kioku', run, terminal: term }), calls, terminal }
}

describe('compareVersions', () => {
  it('orders releases and pre-releases the semver way', () => {
    const sorted = ['4.0.0', '5.0.0-rc.10', '4.0.0-rc.4', '5.0.0-rc.2', '5.0.0', '3.3.0', 'v4.1.0'].sort(compareVersions)
    expect(sorted).toEqual(['3.3.0', '4.0.0-rc.4', '4.0.0', 'v4.1.0', '5.0.0-rc.2', '5.0.0-rc.10', '5.0.0'])
  })
})

describe('pickReleases', () => {
  it('finds the stable release and the pre-releases newer than the installed one', () => {
    const picked = pickReleases(RELEASES, '4.0.0', 'kioku')
    expect(picked.stable?.version).toBe('4.0.0')
    expect(picked.prereleases.map(r => r.version)).toEqual(['5.0.0-rc.1'])
    expect(picked.prereleases[0]).toEqual({ version: '5.0.0-rc.1', prerelease: true, date: '2026-10-29T19:54:34Z', notes: 'Kioku v5.0.0-rc.1.', notesUrl: 'https://github.com/monoku/kioku/releases/tag/v5.0.0-rc.1', install: 'kioku update 5.0.0-rc.1' })
    expect(picked.all.map(r => r.version)).toEqual(['5.0.0-rc.1', '4.0.0', '4.0.0-rc.4', '3.3.0'])
  })

  it('lists every pre-release when no version is known', () => {
    expect(pickReleases(RELEASES, null, 'kioku').prereleases.map(r => r.version)).toEqual(['5.0.0-rc.1', '4.0.0-rc.4'])
  })
})

describe('readUpdate and readLabs', () => {
  it('keeps only the fields Forge shows', () => {
    const update = readUpdate({ status: 'updated', version: '5.0.0-rc.1', was: '4.0.0', agents: [{ host: 'claude-code', name: 'kioku@kioku', from: '4.0.0', to: '5.0.0-rc.1', changed: true, error: { message: 'boom' } }], finishError: { message: 'refresh failed' }, extra: 1 }, 'kioku update 5.0.0-rc.1')
    expect(update).toEqual({ status: 'updated', version: '5.0.0-rc.1', was: '4.0.0', latest: null, agents: [{ host: 'claude-code', name: 'kioku@kioku', from: '4.0.0', to: '5.0.0-rc.1', changed: true, error: 'boom' }], refreshed: null, finishError: 'refresh failed', command: 'kioku update 5.0.0-rc.1' })
  })

  it('passes each lab on as kioku lists it, with a command only when it has one', () => {
    const labs = readLabs({ labs: [LAB, { name: 'tidy', title: 'Tidy', about: 'x', enabled: true, command: '/kioku:tidy' }, { name: '--bad' }] }, 'kioku')
    expect(labs).toEqual([
      { ...LAB, toggle: { on: 'kioku config set labs.recall-graph.enabled true', off: 'kioku config set labs.recall-graph.enabled false' } },
      { name: 'tidy', title: 'Tidy', about: 'x', enabled: true, command: '/kioku:tidy', toggle: { on: 'kioku config set labs.tidy.enabled true', off: 'kioku config set labs.tidy.enabled false' } },
    ])
  })

  it('quotes what a shell would split', () => {
    expect(commandLine('kioku', ['page', 'save', '--title', "it's here"])).toBe(`kioku page save --title 'it'\\''s here'`)
  })
})

describe('Kioku releases, updates and labs', () => {
  it('reads releases with gh, keeps them 10 minutes and the last list when gh fails', async () => {
    let now = 0
    let gh: RunResult = ok(RELEASES)
    const calls: string[] = []
    const run: Runner = async (bin, args) => {
      calls.push(bin)
      return bin === 'gh' ? gh : ok({ version: '4.0.0' })
    }
    const kioku = new Kioku({ bin: 'kioku', run, now: () => now })
    const first = await kioku.releases()
    expect(first).toMatchObject({ installed: '4.0.0', command: 'gh api repos/monoku/kioku/releases', error: null })
    await kioku.releases()
    expect(calls.filter(c => c === 'gh')).toHaveLength(1)
    now = 11 * 60_000
    gh = { code: 1, stdout: '', stderr: 'HTTP 404: Not Found' }
    const stale = await kioku.releases()
    expect(stale.error).toBe('HTTP 404: Not Found')
    expect(stale.stable?.version).toBe('4.0.0')
  })

  it('says gh is missing when it is not installed', async () => {
    const { kioku } = fake({ gh: { code: 127, stdout: '', stderr: 'ENOENT' } })
    expect((await kioku.releases()).error).toMatch(/gh is not installed/)
  })

  it('checks without a terminal and installs in one, showing the command without the resolved path', async () => {
    const { kioku, calls, terminal } = fake()
    const check = await kioku.checkUpdate('5.0.0-rc.1')
    expect(check).toMatchObject({ status: 'available', was: '4.0.0', command: 'kioku update 5.0.0-rc.1 --check' })
    expect(calls.at(-1)).toEqual({ bin: '/home/me/.local/bin/kioku', args: ['update', '5.0.0-rc.1', '--check', '--json'] })
    const done = await kioku.update('5.0.0-rc.1')
    expect(done).toMatchObject({ status: 'updated', version: '5.0.0-rc.1', was: '4.0.0', command: 'kioku update 5.0.0-rc.1' })
    expect(done.agents[0]).toMatchObject({ host: 'claude-code', from: '4.0.0', to: '5.0.0-rc.1', changed: true })
    expect(terminal).toEqual([{ bin: '/home/me/.local/bin/kioku', args: ['update', '5.0.0-rc.1', '--json'] }])
  })

  it('refuses a version that is not one', async () => {
    const { kioku, terminal } = fake()
    await expect(kioku.update('--from=/tmp/x')).rejects.toThrow(/5.0.0-rc.1/)
    await expect(kioku.checkUpdate('latest')).rejects.toThrow()
    expect(terminal).toHaveLength(0)
  })

  it('has no labs on a kioku without the verb', async () => {
    expect(await fake().kioku.labs()).toEqual({ labs: null, command: 'kioku labs list' })
  })

  it('toggles a lab in a terminal and answers the list read again', async () => {
    const { kioku, terminal } = fake({ version: '5.0.0-rc.1', labs: [LAB] })
    const after = await kioku.setLab('recall-graph', true)
    expect(terminal).toEqual([{ bin: '/home/me/.local/bin/kioku', args: ['config', 'set', 'labs.recall-graph.enabled', 'true', '--json'] }])
    expect(after.labs?.[0].enabled).toBe(true)
    await expect(kioku.setLab('unknown', true)).rejects.toThrow(/no lab unknown/)
    await expect(kioku.setLab('a.b', true)).rejects.toThrow()
  })

  it('serves the routes and checks their bodies', async () => {
    const app = kiokuRoutes(fake({ version: '5.0.0-rc.1', labs: [LAB] }).kioku)
    expect((await (await app.request('/releases')).json() as { stable: { version: string } }).stable.version).toBe('4.0.0')
    const post = (path: string, body: unknown) => app.request(path, { method: 'POST', body: JSON.stringify(body) })
    expect((await post('/update/check', { version: '5.0.0-rc.1' })).status).toBe(200)
    expect((await post('/update', {})).status).toBe(400)
    expect((await post('/labs/recall-graph', { enabled: 'yes' })).status).toBe(400)
    const res = await post('/labs/recall-graph', { enabled: true })
    expect((await res.json() as { labs: { enabled: boolean }[] }).labs[0].enabled).toBe(true)
    expect((await post('/labs/nope', { enabled: true })).status).toBe(404)
  })
})
