import { Command } from 'commander'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export function consoleCommand() {
  return new Command('console')
    .description('Start Forge Console (dashboard)')
    .option('-p, --port <port>', 'Port number', '3000')
    .option('--no-open', 'Do not open browser')
    .option('--detach', 'Run in background')
    .option('--team', 'Start in team mode (requires --db-url)')
    .option('--db-url <url>', 'PostgreSQL connection URL for team mode')
    .option('--auth-token <token>', 'Bearer token for API authentication')
    .action(async (opts) => {
      const forgeDir = join(homedir(), '.forge')
      if (!existsSync(forgeDir)) {
        console.log('Forge not initialized. Run `forge init` first.')
        process.exit(1)
      }

      const port = parseInt(opts.port, 10)
      const isTeam = opts.team || !!opts.dbUrl
      const dbUrl = opts.dbUrl || process.env.FORGE_DB_URL
      const authToken = opts.authToken || process.env.FORGE_AUTH_TOKEN

      if (isTeam && !dbUrl) {
        console.log('Team mode requires --db-url or FORGE_DB_URL environment variable.')
        process.exit(1)
      }

      console.log(`Starting Forge Console (${isTeam ? 'team' : 'local'} mode) on http://localhost:${port}`)

      const { createForgeServer, createDatabase } = await import('@forge-dev/core')

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
      const consoleDist = join(import.meta.dirname, '../../../console/dist')
      if (existsSync(consoleDist)) {
        server.app.use('/*', serveStatic({ root: consoleDist }))
        // SPA fallback: serve index.html for non-API routes
        const indexHtml = readFileSync(join(consoleDist, 'index.html'), 'utf-8')
        server.app.get('*', (c) => c.html(indexHtml))
      }

      const { serve } = await import('@hono/node-server')
      const httpServer = serve({ fetch: server.app.fetch, port })
      server.attachTerminalWs(httpServer as unknown as import('node:http').Server)

      console.log(`Forge Console running at http://localhost:${port}`)
      if (isTeam) {
        console.log(`  Mode: team (PostgreSQL)`)
        if (authToken) console.log(`  Auth: bearer token required`)
      }

      if (opts.open !== false) {
        try {
          const open = (await import('open')).default
          await open(`http://localhost:${port}`)
        } catch { /* ok if open fails */ }
      }
    })
}
