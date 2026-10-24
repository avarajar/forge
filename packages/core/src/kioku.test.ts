import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Kioku, resolveKiokuBin } from './kioku.js'
import { kiokuRoutes } from './kioku-routes.js'
import type { Runner, RunResult } from './task-review.js'

const BRAIN = { key: 'github.com/me/brain', name: 'me', tier: 'personal', folder: '/brains/me', onDisk: true, personal: true }

// stands in for the kioku CLI's read verbs
function fakeRun(overrides: Partial<Record<string, RunResult>> = {}): Runner {
  return async (_bin, args) => {
    const override = overrides[args[0]]
    if (override) return override
    if (args[0] === '--version') return { code: 0, stdout: '{"version":"4.0.0","contract":1}', stderr: '' }
    return { code: 0, stdout: JSON.stringify({ brains: [BRAIN], chain: [], inside: null, untrusted: [] }), stderr: '' }
  }
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
    const kioku = new Kioku({ bin, run: fakeRun(), startTimeoutMs })
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

  it('reports the version and the brains this machine knows', async () => {
    expect(await make('kioku').status()).toEqual({ installed: true, version: '4.0.0', brains: [BRAIN], viewer: null })
  })

  it('reports kioku as missing when it does not run', async () => {
    const kioku = new Kioku({ bin: 'kioku', run: fakeRun({ '--version': { code: 127, stdout: '', stderr: 'ENOENT' } }) })
    expect(await kioku.status()).toEqual({ installed: false, version: null, brains: [], viewer: null })
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
    const app = kiokuRoutes(new Kioku({ bin: '/nonexistent/kioku', run: fakeRun() }))
    const res = await app.request('/viewer', { method: 'POST' })
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'kioku is not installed on this machine' })
  })

  it('serves the status', async () => {
    const res = await kiokuRoutes(new Kioku({ bin: 'kioku', run: fakeRun() })).request('/status')
    expect((await res.json() as { brains: unknown[] }).brains).toEqual([BRAIN])
  })
})
