#!/usr/bin/env node

import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

// `cw forge` passes --port; the environment variables still work
function parseArgs(argv: string[]): { port?: string; open: boolean } {
  const out: { port?: string; open: boolean } = { open: true }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--port' || arg === '-p') out.port = argv[++i]
    else if (arg.startsWith('--port=')) out.port = arg.slice('--port='.length)
    else if (arg === '--no-open') out.open = false
  }
  return out
}

// the published package keeps the console next to dist/; a checkout builds it in packages/console
function findConsoleDist(): string | null {
  for (const dir of [join(import.meta.dirname, '../console'), join(import.meta.dirname, '../../console/dist')]) {
    if (existsSync(join(dir, 'index.html'))) return dir
  }
  return null
}

async function main() {
  const { ensureForgeDir, createForgeServer, createDatabase, resolveListenOptions, ensureCw, pathWithCw } = await import('@forge-dev/core')
  const args = parseArgs(process.argv.slice(2))
  const { forgeDir, created } = ensureForgeDir()

  if (created) {
    console.log('First run — initialized Forge.')
  }

  // install or update the CW this package carries (packages/platform/cw), then put it on PATH
  const cwHome = join(process.env.HOME ?? homedir(), '.cw')
  const cw = await ensureCw({ cwHome, bundleDir: join(import.meta.dirname, '../cw') })
  if (cw.action === 'installed') console.log(`  Installed CW ${cw.version} in ${cwHome}`)
  else if (cw.action === 'updated') console.log(`  Updated ${cw.message}`)
  else if (cw.action === 'failed') console.log(`  Could not install CW: ${cw.message}`)
  process.env.PATH = pathWithCw(cwHome, process.env.PATH)

  const port = parseInt(args.port ?? process.env.FORGE_PORT ?? '3000', 10)
  const dbUrl = process.env.FORGE_DB_URL
  const authToken = process.env.FORGE_AUTH_TOKEN
  const isTeam = !!dbUrl
  const { host, localOnly } = resolveListenOptions(isTeam)

  const db = await createDatabase({
    mode: isTeam ? 'team' : 'local',
    dataDir: forgeDir,
    databaseUrl: dbUrl
  })

  const server = createForgeServer({
    dataDir: forgeDir,
    port,
    db,
    authToken: isTeam ? authToken : undefined,
    localOnly
  })

  const { serveStatic } = await import('@hono/node-server/serve-static')
  const { readFileSync } = await import('node:fs')
  const consoleDist = findConsoleDist()
  if (consoleDist) {
    server.app.use('/*', serveStatic({ root: consoleDist }))
    // SPA fallback: serve index.html for non-API routes
    const indexHtml = readFileSync(join(consoleDist, 'index.html'), 'utf-8')
    server.app.get('*', (c) => c.html(indexHtml))
  }

  const { serve } = await import('@hono/node-server')
  const httpServer = serve({ fetch: server.app.fetch, port, hostname: host })
  server.attachTerminalWs(httpServer as unknown as import('node:http').Server)

  console.log(`
  Forge Console running at http://localhost:${port}
  Mode: ${isTeam ? 'team (PostgreSQL)' : 'local (SQLite)'}
${authToken ? '  Auth: bearer token required\n' : ''}
     Dashboard:  http://localhost:${port}
     API:        http://localhost:${port}/api/health

     Press Ctrl+C to stop
  `)

  if (args.open && process.env.FORGE_NO_OPEN !== '1') {
    try {
      const open = (await import('open')).default
      await open(`http://localhost:${port}`)
    } catch { /* ok if open fails */ }
  }
}

main().catch(console.error)
