import type { IForgeDB } from './db-interface.js'
import { ForgeDB } from './db.js'

export interface DatabaseOptions {
  mode: 'local' | 'team'
  dataDir: string
  databaseUrl?: string
}

export async function createDatabase(opts: DatabaseOptions): Promise<IForgeDB> {
  if (opts.mode === 'team' && opts.databaseUrl) {
    const { PostgresDB } = await import('./db-postgres.js')
    const db = new PostgresDB(opts.databaseUrl)
    await db.migrate()
    return db
  }

  const { join } = await import('node:path')
  return new ForgeDB(join(opts.dataDir, 'forge.db'))
}
