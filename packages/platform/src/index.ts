#!/usr/bin/env node

import { existsSync } from 'node:fs'
import { join } from 'node:path'

async function main() {
  const { ensureForgeDir } = await import('@forge-dev/core')
  const { forgeDir, created } = ensureForgeDir()

  if (created) {
    console.log('First run — initialized Forge.')
  }

  const port = parseInt(process.env.FORGE_PORT ?? '3000', 10)

  const { createForgeServer } = await import('@forge-dev/core')
  const server = createForgeServer({ dataDir: forgeDir, port })

  const { serveStatic } = await import('@hono/node-server/serve-static')
  const consoleDist = join(import.meta.dirname, '../../console/dist')
  if (existsSync(consoleDist)) {
    server.app.use('/*', serveStatic({ root: consoleDist }))
  }

  const { serve } = await import('@hono/node-server')
  serve({ fetch: server.app.fetch, port })

  console.log(`
  Forge Console running at http://localhost:${port}

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
