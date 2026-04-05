#!/usr/bin/env node

import { existsSync } from 'node:fs'
import { join } from 'node:path'

async function main() {
  const { ensureForgeDir, createForgeServer, createDatabase } = await import('@forge-dev/core')
  const { forgeDir, created } = ensureForgeDir()

  if (created) {
    console.log('First run — initialized Forge.')
  }

  const port = parseInt(process.env.FORGE_PORT ?? '3000', 10)
  const dbUrl = process.env.FORGE_DB_URL
  const authToken = process.env.FORGE_AUTH_TOKEN
  const isTeam = !!dbUrl

  const db = await createDatabase({
    mode: isTeam ? 'team' : 'local',
    dataDir: forgeDir,
    databaseUrl: dbUrl
  })

  const server = createForgeServer({
    dataDir: forgeDir,
    port,
    db,
    authToken: isTeam ? authToken : undefined
  })

  const { serveStatic } = await import('@hono/node-server/serve-static')
  const { readFileSync } = await import('node:fs')
  const consoleDist = join(import.meta.dirname, '../../console/dist')
  if (existsSync(consoleDist)) {
    server.app.use('/*', serveStatic({ root: consoleDist }))
    // SPA fallback: serve index.html for non-API routes
    const indexHtml = readFileSync(join(consoleDist, 'index.html'), 'utf-8')
    server.app.get('*', (c) => c.html(indexHtml))
  }

  const { serve } = await import('@hono/node-server')
  const httpServer = serve({ fetch: server.app.fetch, port })
  server.attachTerminalWs(httpServer as unknown as import('node:http').Server)

  console.log(`
  Forge Console running at http://localhost:${port}
  Mode: ${isTeam ? 'team (PostgreSQL)' : 'local (SQLite)'}
${authToken ? '  Auth: bearer token required\n' : ''}
     Dashboard:  http://localhost:${port}
     API:        http://localhost:${port}/api/health

     Press Ctrl+C to stop
  `)

  if (process.env.FORGE_NO_OPEN !== '1') {
    try {
      const open = (await import('open')).default
      await open(`http://localhost:${port}`)
    } catch { /* ok if open fails */ }
  }
}

main().catch(console.error)
