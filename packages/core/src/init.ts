import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const FORGE_SUBDIRS = ['modules', 'templates', 'cache', 'logs']

export function getForgeDir(): string {
  return join(homedir(), '.forge')
}

export function ensureForgeDir(): { forgeDir: string; created: boolean } {
  const forgeDir = getForgeDir()

  if (existsSync(forgeDir)) {
    return { forgeDir, created: false }
  }

  mkdirSync(forgeDir, { recursive: true })
  for (const d of FORGE_SUBDIRS) {
    mkdirSync(join(forgeDir, d), { recursive: true })
  }

  writeFileSync(
    join(forgeDir, 'config.json'),
    JSON.stringify({
      port: 3000,
      theme: 'dark',
      openBrowser: true,
      dataDir: forgeDir
    }, null, 2)
  )

  return { forgeDir, created: true }
}
