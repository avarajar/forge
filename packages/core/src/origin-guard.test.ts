import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Hono } from 'hono'
import { createServer, type Server } from 'node:http'
import { connect as netConnect, type AddressInfo } from 'node:net'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { WebSocket } from 'ws'
import { isLocalRequest, isLoopbackHost, localOriginGuard, resolveListenOptions } from './origin-guard.js'
import { createForgeServer } from './server.js'
import { createTerminalWss } from './pty-routes.js'
import { PTYManager } from './pty-manager.js'
import { CWReader } from './cw-reader.js'

describe('isLocalRequest', () => {
  it('accepts a loopback host without an Origin, as the CLI and curl send', () => {
    expect(isLocalRequest('localhost:3000', undefined)).toBe(true)
  })

  it("accepts Forge's own origin and the console's Vite dev server", () => {
    expect(isLocalRequest('localhost:3000', 'http://localhost:3000')).toBe(true)
    expect(isLocalRequest('localhost:3000', 'http://localhost:5173')).toBe(true)
    expect(isLocalRequest('127.0.0.1:3000', 'http://127.0.0.1:3000')).toBe(true)
    expect(isLocalRequest('[::1]:3000', 'http://[::1]:3000')).toBe(true)
  })

  it('rejects a page served from another loopback port', () => {
    expect(isLocalRequest('localhost:3000', 'http://localhost:8080')).toBe(false)
    expect(isLocalRequest('127.0.0.1:3000', 'http://127.0.0.1:4000')).toBe(false)
    expect(isLocalRequest('localhost:3000', 'http://127.0.0.1:3000')).toBe(false)
  })

  it('rejects a foreign Origin', () => {
    expect(isLocalRequest('localhost:3000', 'https://evil.example')).toBe(false)
  })

  it('rejects an opaque or malformed Origin', () => {
    expect(isLocalRequest('localhost:3000', 'null')).toBe(false)
  })

  it('rejects a foreign Host even without an Origin, which blocks DNS rebinding', () => {
    expect(isLocalRequest('evil.example:3000', undefined)).toBe(false)
  })

  it('rejects a missing Host', () => {
    expect(isLocalRequest(undefined, undefined)).toBe(false)
  })
})

describe('isLoopbackHost', () => {
  it('recognises loopback names with or without a port', () => {
    expect(isLoopbackHost('127.0.0.1')).toBe(true)
    expect(isLoopbackHost('localhost:3000')).toBe(true)
    expect(isLoopbackHost('::1')).toBe(true)
    expect(isLoopbackHost('0.0.0.0')).toBe(false)
  })
})

describe('resolveListenOptions', () => {
  it('binds local mode to 127.0.0.1 and keeps the same-machine check on', () => {
    expect(resolveListenOptions(false, undefined)).toEqual({ host: '127.0.0.1', localOnly: true })
  })

  it('lets FORGE_HOST open local mode to the network without the check', () => {
    expect(resolveListenOptions(false, '0.0.0.0')).toEqual({ host: '0.0.0.0', localOnly: false })
  })

  it('keeps team mode on every interface without the check', () => {
    expect(resolveListenOptions(true, undefined)).toEqual({ host: undefined, localOnly: false })
  })
})

describe('localOriginGuard', () => {
  const app = new Hono()
  app.use('*', localOriginGuard())
  app.post('/api/thing', (c) => c.json({ ok: true }))

  it('lets a same-machine request through', async () => {
    const res = await app.request('http://localhost:3000/api/thing', { method: 'POST' })
    expect(res.status).toBe(200)
  })

  it('refuses a simple request sent by a foreign page', async () => {
    const res = await app.request('http://localhost:3000/api/thing', {
      method: 'POST',
      headers: { Origin: 'https://evil.example', 'Content-Type': 'text/plain' },
      body: '{}',
    })
    expect(res.status).toBe(403)
  })

  it('refuses a request addressed to a foreign host', async () => {
    const res = await app.request('http://evil.example:3000/api/thing', { method: 'POST' })
    expect(res.status).toBe(403)
  })
})

describe('createForgeServer origin handling', () => {
  const DIR = join(import.meta.dirname, '../.test-origin-guard')
  let local: ReturnType<typeof createForgeServer>
  let team: ReturnType<typeof createForgeServer>

  beforeAll(() => {
    mkdirSync(join(DIR, 'local/modules'), { recursive: true })
    mkdirSync(join(DIR, 'team/modules'), { recursive: true })
    local = createForgeServer({ dataDir: join(DIR, 'local'), port: 0 })
    team = createForgeServer({ dataDir: join(DIR, 'team'), port: 0, localOnly: false, authToken: 'team-token-0123456789abcdef' })
  })

  afterAll(() => {
    local.close()
    team.close()
    rmSync(DIR, { recursive: true, force: true })
  })

  it('answers the local console without CORS headers', async () => {
    const res = await local.fetch('/api/health')
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('refuses a foreign page by default', async () => {
    const res = await local.fetch('/api/health', { headers: { Origin: 'https://evil.example' } })
    expect(res.status).toBe(403)
  })

  it('refuses to be framed by another site', async () => {
    for (const server of [local, team]) {
      const res = await server.fetch('/api/health')
      expect(res.headers.get('x-frame-options')).toBe('DENY')
      expect(res.headers.get('content-security-policy')).toBe("frame-ancestors 'none'")
    }
  })

  it('keeps CORS open when local-only is turned off', async () => {
    const res = await team.fetch('/api/health', { headers: { Origin: 'https://console.example' } })
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
  })
})

describe('terminal WebSocket origin check', () => {
  let server: Server
  let manager: PTYManager
  let port: number

  beforeAll(async () => {
    manager = new PTYManager()
    const reader = new CWReader(join(import.meta.dirname, '../.test-origin-guard-ws'))
    createTerminalWss(manager, reader).attachToServer(server = createServer())
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
    port = (server.address() as AddressInfo).port
  })

  afterAll(async () => {
    manager.dispose()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  const connect = (origin?: string) => new Promise<'open' | 'rejected'>((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/terminal/proj/task-x`, origin ? { origin } : {})
    ws.on('open', () => { ws.close(); resolve('open') })
    ws.on('error', () => resolve('rejected'))
  })

  it('refuses an upgrade from a foreign page', async () => {
    expect(await connect('https://evil.example')).toBe('rejected')
  })

  it('accepts an upgrade from the Forge console', async () => {
    expect(await connect(`http://127.0.0.1:${port}`)).toBe('open')
  })

  it('refuses an upgrade from a page on another loopback port', async () => {
    expect(await connect('http://127.0.0.1:8080')).toBe('rejected')
  })

  // Each raw request answers, closes or is dropped; the next connect proves the process is still serving
  const raw = (data: Buffer | string) => new Promise<void>((resolve) => {
    const socket = netConnect(port, '127.0.0.1', () => socket.write(data))
    socket.on('data', (chunk) => {
      if (chunk.toString().startsWith('HTTP/1.1 101')) socket.write(Buffer.from([0x81, 0x00]))
    })
    socket.on('close', () => resolve())
    socket.on('error', () => resolve())
    setTimeout(() => { socket.destroy(); resolve() }, 1000)
  })

  it('survives an upgrade request whose target is not a URL', async () => {
    await raw('GET // HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n')
    expect(await connect(`http://127.0.0.1:${port}`)).toBe('open')
  })

  it('survives a malformed frame from the client', async () => {
    await raw([
      'GET /ws/terminal/proj/task-x HTTP/1.1', `Host: 127.0.0.1:${port}`, 'Connection: Upgrade', 'Upgrade: websocket',
      'Sec-WebSocket-Version: 13', 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==', '', '',
    ].join('\r\n'))
    expect(await connect(`http://127.0.0.1:${port}`)).toBe('open')
  })
})
