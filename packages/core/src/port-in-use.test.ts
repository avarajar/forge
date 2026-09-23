import { describe, it, expect, afterEach } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo, Socket } from 'node:net'
import { waitForListening, probePort, portInUseMessage } from './port-in-use.js'

const servers: Server[] = []
const sockets: Socket[] = []

async function listen(handler: Parameters<typeof createServer>[1]): Promise<number> {
  const server = createServer(handler)
  server.on('connection', (s) => sockets.push(s))
  servers.push(server)
  server.listen(0, '127.0.0.1')
  await waitForListening(server)
  return (server.address() as AddressInfo).port
}

afterEach(async () => {
  sockets.splice(0).forEach((s) => s.destroy())
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r))))
})

describe('waitForListening', () => {
  it('rejects with EADDRINUSE when the port is taken', async () => {
    const port = await listen((_req, res) => res.end())
    const second = createServer()
    second.listen(port, '127.0.0.1')
    await expect(waitForListening(second)).rejects.toMatchObject({ code: 'EADDRINUSE' })
  })
})

describe('probePort', () => {
  it('recognises a Forge by its health answer', async () => {
    const port = await listen((_req, res) => {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ status: 'ok', version: '0.1.0', modules: 0 }))
    })
    expect(await probePort(port)).toBe('forge')
  })

  it('reports another program', async () => {
    const port = await listen((_req, res) => { res.statusCode = 404; res.end('not found') })
    expect(await probePort(port)).toBe('other')
  })

  it('reports a holder that accepts but never answers, like a suspended Forge', async () => {
    const port = await listen(() => { /* never answers */ })
    expect(await probePort(port, 100)).toBe('unresponsive')
  })
})

describe('portInUseMessage', () => {
  it('suggests the next port and how to find the holder', () => {
    const text = portInUseMessage(3000, 'unresponsive')
    expect(text).toContain('Ctrl+Z')
    expect(text).toContain('lsof -nP -iTCP:3000 -sTCP:LISTEN')
    expect(text).toContain('--port 3001')
  })
})
