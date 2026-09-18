import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Liveframe, parseFrameUrl, slugify } from './liveframe.js'
import { liveframeRoutes } from './liveframe-routes.js'
import type { Runner, RunResult } from './task-review.js'

const PUSH_OUTPUT = [
  'Building v3...',
  '\x1b[32m✓\x1b[0m v3 live in 8.2s (24 files, 412 KB; source 38 KB)',
  '  \x1b[1mhttps://lf.test/f/checkout-a7f3/\x1b[0m \x1b[2mlatest\x1b[0m',
  '  https://lf.test/f/checkout-a7f3/v3/ \x1b[2mv3, permanent\x1b[0m',
].join('\n')

const ok = (stdout = ''): RunResult => ({ code: 0, stdout, stderr: '' })

function writeFrame(dir: string, key: string): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'liveframe.json'), JSON.stringify({ frameId: 'f1', key, project: 'p', slug: 's', kind: 'view', branch: 'main' }))
}

// stands in for lf: new and pull write a frame folder, push prints URLs
function fakeLf(overrides: Partial<Record<string, RunResult>> = {}) {
  const calls: { args: string[]; cwd: string }[] = []
  const run: Runner = async (_bin, args, cwd) => {
    calls.push({ args, cwd })
    const override = overrides[args[0]]
    if (override) return override
    if (args[0] === 'new') writeFrame(args[args.indexOf('--dir') + 1], 'new-key')
    if (args[0] === 'pull') writeFrame(args[2], 'pulled-key')
    return args[0] === 'push' ? ok(PUSH_OUTPUT) : ok()
  }
  return { run, calls }
}

describe('parseFrameUrl', () => {
  it('reads the latest URL out of colored output', () => {
    expect(parseFrameUrl(PUSH_OUTPUT)).toBe('https://lf.test/f/checkout-a7f3/')
  })

  it('returns null without a frame URL', () => {
    expect(parseFrameUrl('Building v1...')).toBeNull()
  })
})

describe('slugify', () => {
  it('matches Liveframe slugs', () => {
    expect(slugify('Checkout Ideas — Café!')).toBe('checkout-ideas-cafe')
    expect(slugify('***')).toBe('untitled')
  })
})

describe('Liveframe', () => {
  let root: string
  let home: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'forge-lf-root-'))
    home = mkdtempSync(join(tmpdir(), 'forge-lf-home-'))
    writeFileSync(join(home, 'config.json'), JSON.stringify({ api: 'https://lf.test/', oauth: { accessToken: 'secret' } }))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
    rmSync(home, { recursive: true, force: true })
  })

  it('lists frame folders under project folders, skipping anything without liveframe.json', () => {
    writeFrame(join(root, 'reservas', 'checkout'), 'abc')
    mkdirSync(join(root, 'reservas', 'notes'))
    const lf = new Liveframe({ root, home, run: fakeLf().run })

    expect(lf.listFrames()).toEqual([
      { project: 'reservas', frame: 'checkout', dir: join(root, 'reservas', 'checkout'), key: 'abc', kind: 'view', branch: 'main', url: 'https://lf.test/f/abc/' },
    ])
  })

  it('links a frame on another branch to that branch head', () => {
    const dir = join(root, 'reservas', 'checkout')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'liveframe.json'), JSON.stringify({ key: 'abc', kind: 'view', branch: 'dark-mode' }))

    expect(new Liveframe({ root, home, run: fakeLf().run }).listFrames()[0].url).toBe('https://lf.test/f/abc/dark-mode/')
  })

  it('reports whether lf is installed and signed in without exposing the token', async () => {
    const status = await new Liveframe({ root, home, run: fakeLf({ '--version': { code: 127, stdout: '', stderr: 'ENOENT' } }).run }).status()

    expect(status).toEqual({ account: 'monoku', installed: false, signedIn: true, api: 'https://lf.test', root })
    expect(JSON.stringify(status)).not.toContain('secret')
  })

  it('creates a frame with lf new in root/<project>/<frame>', async () => {
    const { run, calls } = fakeLf()

    const frame = await new Liveframe({ root, home, run }).createFrame('Reservas', 'Checkout Ideas')

    expect(calls[0].args).toEqual(['new', 'Checkout Ideas', '--project', 'Reservas', '--kind', 'view', '--dir', join(root, 'reservas', 'checkout-ideas'), '--yes'])
    expect(frame.key).toBe('new-key')
    expect(frame.dir).toBe(join(root, 'reservas', 'checkout-ideas'))
  })

  it('refuses to create over an existing folder', async () => {
    mkdirSync(join(root, 'reservas', 'checkout'), { recursive: true })

    await expect(new Liveframe({ root, home, run: fakeLf().run }).createFrame('reservas', 'checkout')).rejects.toMatchObject({ status: 409 })
  })

  it('pulls a frame into root/<project>/<frame>', async () => {
    const { run, calls } = fakeLf()

    const frame = await new Liveframe({ root, home, run }).pullFrame('reservas', 'checkout')

    expect(calls[0].args).toEqual(['pull', 'reservas/checkout', join(root, 'reservas', 'checkout')])
    expect(frame.key).toBe('pulled-key')
  })

  it('pushes from the frame folder and returns the latest URL', async () => {
    writeFrame(join(root, 'reservas', 'checkout'), 'abc')
    const { run, calls } = fakeLf()

    const url = await new Liveframe({ root, home, run }).pushFrame('reservas', 'checkout', 'wallet first')

    expect(url).toBe('https://lf.test/f/checkout-a7f3/')
    expect(calls[0]).toEqual({ args: ['push', '-m', 'wallet first'], cwd: join(root, 'reservas', 'checkout') })
  })

  it('surfaces what lf printed when it fails', async () => {
    writeFrame(join(root, 'reservas', 'checkout'), 'abc')
    const { run } = fakeLf({ push: { code: 1, stdout: 'Building v2...', stderr: '\x1b[31m✗\x1b[0m not signed in. Run lf login\n' } })

    await expect(new Liveframe({ root, home, run }).pushFrame('reservas', 'checkout')).rejects.toThrow('not signed in. Run lf login')
  })

  it('leaves no folder behind when lf fails', async () => {
    const { run } = fakeLf({ pull: { code: 1, stdout: '', stderr: 'frame not found' } })

    await expect(new Liveframe({ root, home, run }).pullFrame('reservas', 'gone')).rejects.toThrow('frame not found')
    expect(existsSync(join(root, 'reservas'))).toBe(false)
  })

  it('says how to install lf when it is missing', async () => {
    const { run } = fakeLf({ new: { code: 127, stdout: '', stderr: 'ENOENT' } })

    await expect(new Liveframe({ root, home, run }).createFrame('reservas', 'checkout')).rejects.toThrow(/npm i -g/)
  })
})

describe('liveframeRoutes', () => {
  let root: string
  let app: Hono

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'forge-lf-routes-'))
    app = new Hono()
    app.route('/api/liveframe', liveframeRoutes(new Liveframe({ root, home: root, run: fakeLf().run })))
  })

  afterEach(() => { rmSync(root, { recursive: true, force: true }) })

  const post = (path: string, body: unknown) => app.request(`/api/liveframe${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  it('creates, lists and pushes a frame', async () => {
    const created = await post('/frames', { project: 'Reservas', name: 'Checkout' })
    expect(created.status).toBe(201)

    const frames = await (await app.request('/api/liveframe/frames')).json() as { project: string; frame: string }[]
    expect(frames.map(f => `${f.project}/${f.frame}`)).toEqual(['reservas/checkout'])

    const pushed = await post('/frames/reservas/checkout/push', { note: 'first' })
    expect(await pushed.json()).toEqual({ url: 'https://lf.test/f/checkout-a7f3/' })
  })

  it('maps lf errors to their status', async () => {
    expect((await post('/frames', { project: 'Reservas' })).status).toBe(400)
    expect((await post('/pull', { target: 'no-slash' })).status).toBe(400)
    expect((await post('/frames/reservas/missing/push', {})).status).toBe(404)
    expect((await post('/frames/..%2F..%2Fetc/x/push', {})).status).toBe(404)
  })

  it('pulls project/frame', async () => {
    const res = await post('/pull', { target: 'reservas/checkout' })
    expect(res.status).toBe(201)
    expect(existsSync(join(root, 'reservas', 'checkout', 'liveframe.json'))).toBe(true)
  })
})
