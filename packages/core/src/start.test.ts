import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { startForge, type StartForgeResult } from './start.js'

describe('startForge', () => {
  let home: string
  let previousHome: string | undefined
  const cleanups: Array<() => void> = []

  beforeEach(() => {
    previousHome = process.env.HOME
    home = mkdtempSync(join(tmpdir(), 'forge-start-'))
    process.env.HOME = home
  })

  afterEach(() => {
    while (cleanups.length) cleanups.pop()!()
    process.env.HOME = previousHome
    rmSync(home, { recursive: true, force: true })
  })

  const track = (result: StartForgeResult) => {
    if (result.status === 'listening') cleanups.push(result.close)
    return result
  }

  const freePort = () => new Promise<number>((resolve) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address() as { port: number }
      s.close(() => resolve(port))
    })
  })

  it('serves the API and the console on the port it was given', async () => {
    const consoleDist = join(home, 'console')
    mkdirSync(consoleDist)
    writeFileSync(join(consoleDist, 'index.html'), '<!doctype html><title>console</title>')
    const port = await freePort()

    const started = track(await startForge({ port, version: '9.9.9', consoleDist }))
    expect(started).toMatchObject({ status: 'listening', port, url: `http://localhost:${port}`, isTeam: false, authRequired: false })

    const health = await (await fetch(`http://127.0.0.1:${port}/api/health`)).json() as { status: string; version: string }
    expect(health).toMatchObject({ status: 'ok', version: '9.9.9' })
    expect(await (await fetch(`http://127.0.0.1:${port}/tasks/anything`)).text()).toContain('<title>console</title>')
  })

  it('reports a Forge already on the port instead of starting a second one', async () => {
    const port = await freePort()
    track(await startForge({ port, version: '1.0.0' }))

    const second = track(await startForge({ port, version: '1.0.0', fallbackToFreePort: true }))
    expect(second).toEqual({ status: 'in-use', port, holder: 'forge' })
  })

  it('fails or moves to a free port when something else holds the port', async () => {
    const other: Server = createServer((_req, res) => res.end('not forge'))
    await new Promise<void>((resolve) => other.listen(0, '127.0.0.1', resolve))
    cleanups.push(() => other.close())
    const port = (other.address() as { port: number }).port

    expect(await startForge({ port, version: '1.0.0' })).toEqual({ status: 'in-use', port, holder: 'other' })

    const moved = track(await startForge({ port, version: '1.0.0', fallbackToFreePort: true }))
    expect(moved.status).toBe('listening')
    if (moved.status !== 'listening') return
    expect(moved.port).not.toBe(port)
    expect((await (await fetch(`http://127.0.0.1:${moved.port}/api/health`)).json() as { status: string }).status).toBe('ok')
  })

  it('refuses to open a Forge reachable from other machines without a token', async () => {
    const previous = process.env.FORGE_HOST
    process.env.FORGE_HOST = '0.0.0.0'
    try {
      const port = await freePort()
      const refused = await startForge({ port, version: '1.0.0', authToken: 'short' })
      expect(refused).toMatchObject({ status: 'refused', reason: expect.stringContaining('FORGE_AUTH_TOKEN') })
      expect(await (await import('./port-in-use.js')).probePort(port)).toBe('other')
    } finally {
      if (previous === undefined) delete process.env.FORGE_HOST
      else process.env.FORGE_HOST = previous
    }
  })
})
