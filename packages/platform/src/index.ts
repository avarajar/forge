#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
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

// The published package has no src/. A checkout serves the console from packages/console and never
// installs CW, even when `pnpm pack` has left its copies of both in packages/platform.
const packageRoot = join(import.meta.dirname, '..')
const isCheckout = existsSync(join(packageRoot, 'src'))
const consoleDist = isCheckout ? join(packageRoot, '../console/dist') : join(packageRoot, 'console')
const forgeVersion = (JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf-8')) as { version: string }).version
const bundledModulesDir = isCheckout ? join(packageRoot, '../../modules') : join(packageRoot, 'modules')

async function main() {
  const { ensureForgeDir, startForge, ensureCw, pathWithCw, quietSqliteWarning, portInUseMessage } = await import('@forge-dev/core')
  quietSqliteWarning()
  const args = parseArgs(process.argv.slice(2))
  const { created } = ensureForgeDir()

  if (created) {
    console.log('First run — initialized Forge.')
  }

  // install or update the CW this package carries (packages/platform/cw), then put it on PATH
  const cwHome = join(process.env.HOME ?? homedir(), '.cw')
  const cw = isCheckout
    ? { action: 'skipped' as const, message: 'a checkout does not install CW' }
    : await ensureCw({ cwHome, bundleDir: join(packageRoot, 'cw') })
  if (cw.action === 'installed') console.log(`  Installed CW ${cw.version} in ${cwHome}`)
  else if (cw.action === 'updated') console.log(`  Updated ${cw.message}`)
  else if (cw.action === 'failed') console.log(`  Could not install CW: ${cw.message}`)
  process.env.PATH = pathWithCw(cwHome, process.env.PATH)

  const port = parseInt(args.port ?? process.env.FORGE_PORT ?? '3000', 10)
  const authToken = process.env.FORGE_AUTH_TOKEN
  const started = await startForge({
    port,
    version: forgeVersion,
    consoleDist,
    bundledModulesDir,
    databaseUrl: process.env.FORGE_DB_URL,
    authToken
  })

  if (started.status === 'refused') {
    console.log(`\n  ${started.reason}\n`)
    process.exit(1)
  }

  if (started.status === 'in-use') {
    console.log(`\n  ${portInUseMessage(port, started.holder)}\n`)
    // a second `npx forge-cw` opens the Forge already running instead of failing
    if (started.holder === 'forge' && args.open && process.env.FORGE_NO_OPEN !== '1') {
      try {
        const open = (await import('open')).default
        await open(`http://localhost:${port}`)
      } catch { /* ok if open fails */ }
    }
    process.exit(started.holder === 'forge' ? 0 : 1)
  }

  const { isTeam, authRequired } = started
  console.log(`
  Forge Console running at http://localhost:${port}
  Mode: ${isTeam ? 'team (PostgreSQL)' : 'local (SQLite)'}
${authRequired ? `  Auth: token required. Browsers sign in once at http://<this host>:${port}/auth?token=<FORGE_AUTH_TOKEN>;\n  the CLI and scripts send Authorization: Bearer <FORGE_AUTH_TOKEN>\n` : ''}
     Dashboard:  http://localhost:${port}
     API:        http://localhost:${port}/api/health

     Press Ctrl+C to stop
  `)

  if (args.open && process.env.FORGE_NO_OPEN !== '1') {
    try {
      const open = (await import('open')).default
      // signs this machine's browser in, so the console works without pasting the token
      await open(authRequired && authToken ? `http://localhost:${port}/auth?token=${encodeURIComponent(authToken)}` : `http://localhost:${port}`)
    } catch { /* ok if open fails */ }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
