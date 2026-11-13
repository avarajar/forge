import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Server as HttpServer } from 'node:http'
import type { Server as NetServer } from 'node:net'
import { createForgeServer } from './server.js'
import { createDatabase } from './db-factory.js'
import { ensureForgeDir } from './init.js'
import { resolveListenOptions } from './origin-guard.js'
import { remoteAuthProblem } from './auth.js'
import { probePort, waitForListening, type PortHolder } from './port-in-use.js'

export interface StartForgeOptions {
  port: number
  version: string
  // the built console (index.html and assets); none means API only
  consoleDist?: string
  bundledModulesDir?: string
  // team mode (PostgreSQL); a token is required whenever Forge is reachable from other machines
  databaseUrl?: string
  authToken?: string
  // when the port is taken by something that is not Forge, listen on any free port instead of failing
  fallbackToFreePort?: boolean
}

export type StartForgeResult =
  // authRequired: reachable from other machines, so the token guards the API and the terminals
  | { status: 'listening'; url: string; port: number; isTeam: boolean; authRequired: boolean; close: () => void }
  | { status: 'in-use'; port: number; holder: PortHolder }
  // not local only and no usable token: nothing was opened
  | { status: 'refused'; reason: string }

// One way to start Forge for every entry point: the npm package (packages/platform) and the desktop app
export async function startForge(options: StartForgeOptions): Promise<StartForgeResult> {
  const { port, version, consoleDist, bundledModulesDir, databaseUrl, authToken, fallbackToFreePort = false } = options
  const { forgeDir } = ensureForgeDir()
  const isTeam = !!databaseUrl
  const { host, localOnly } = resolveListenOptions(isTeam)
  const authProblem = remoteAuthProblem(localOnly, authToken)
  if (authProblem) return { status: 'refused', reason: authProblem }
  const remoteToken = localOnly ? undefined : authToken

  const db = await createDatabase({ mode: isTeam ? 'team' : 'local', dataDir: forgeDir, databaseUrl })
  const server = createForgeServer({
    dataDir: forgeDir,
    port,
    db,
    authToken: remoteToken,
    localOnly,
    bundledModulesDir,
    version
  })

  if (consoleDist && existsSync(join(consoleDist, 'index.html'))) {
    const { serveStatic } = await import('@hono/node-server/serve-static')
    server.app.use('/*', serveStatic({ root: consoleDist }))
    // SPA fallback: serve index.html for non-API routes
    const indexHtml = readFileSync(join(consoleDist, 'index.html'), 'utf-8')
    server.app.get('*', (c) => c.html(indexHtml))
  }

  const { serve } = await import('@hono/node-server')
  const listen = async (p: number) => {
    const s = serve({ fetch: server.app.fetch, port: p, hostname: host }) as unknown as HttpServer
    await waitForListening(s as NetServer)
    return s
  }

  let httpServer: HttpServer
  try {
    httpServer = await listen(port)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE') { server.close(); throw err }
    const holder = await probePort(port)
    if (holder === 'forge' || !fallbackToFreePort) { server.close(); return { status: 'in-use', port, holder } }
    // the origin guard only checks that the host is loopback, so any port works
    httpServer = await listen(0)
  }
  server.attachTerminalWs(httpServer)

  const address = (httpServer as NetServer).address()
  const actualPort = typeof address === 'object' && address ? address.port : port
  return {
    status: 'listening',
    url: `http://localhost:${actualPort}`,
    port: actualPort,
    isTeam,
    authRequired: !!remoteToken,
    close: () => { server.close(); httpServer.close() }
  }
}
