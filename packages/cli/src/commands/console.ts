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
    .action(async (opts) => {
      const forgeDir = join(homedir(), '.forge')
      if (!existsSync(forgeDir)) {
        console.log('Forge not initialized. Run `forge init` first.')
        process.exit(1)
      }

      const port = parseInt(opts.port, 10)
      console.log(`Starting Forge Console on http://localhost:${port}`)

      const { createForgeServer } = await import('@forge-dev/core')
      const server = createForgeServer({ dataDir: forgeDir, port })

      const { serve } = await import('@hono/node-server')
      serve({ fetch: server.app.fetch, port })

      console.log(`Forge Console running at http://localhost:${port}`)

      if (opts.open !== false) {
        try {
          const open = (await import('open')).default
          await open(`http://localhost:${port}`)
        } catch { /* ok if open fails */ }
      }
    })
}
