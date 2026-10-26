import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import type { DatabaseSync, SQLInputValue } from 'node:sqlite'
import type { Project, InstalledModule, ActionLog, ModuleNotificationRow } from './types.js'
import type { IForgeDB } from './db-interface.js'

interface RawInstalledModule {
  id: string
  name: string
  version: string
  enabled: number
  installed_at: string
}

interface RawProject {
  id: string
  name: string
  path: string
  created_at: string
  updated_at: string
}

interface RawActionLog {
  id: string
  project_id: string | null
  module_id: string
  action_id: string
  command: string
  exit_code: number | null
  started_at: string
  finished_at: string | null
}

// Node 22 still flags node:sqlite as experimental; Forge only uses its stable core (prepare, run, get, all)
export function quietSqliteWarning(): void {
  const emitWarning = process.emitWarning
  process.emitWarning = function (this: NodeJS.Process, warning: string | Error, ...rest: unknown[]) {
    const text = typeof warning === 'string' ? warning : warning.message
    if (text.startsWith('SQLite is an experimental feature')) return
    return (emitWarning as (...args: unknown[]) => void).call(process, warning, ...rest)
  } as typeof process.emitWarning
}

// loaded on first use rather than imported, so an entry point can call quietSqliteWarning first
const loadSqlite = () => createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')

export class ForgeDB implements IForgeDB {
  private db: DatabaseSync

  // node:sqlite is built into Node, so the published package has no native module to compile for it
  constructor(dbPath: string) {
    this.db = new (loadSqlite().DatabaseSync)(dbPath)
    this.db.exec('PRAGMA journal_mode = WAL')
    this.db.exec('PRAGMA foreign_keys = ON')
    this.migrate()
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        path TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS modules (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        version TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        installed_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS action_logs (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        module_id TEXT NOT NULL,
        action_id TEXT NOT NULL,
        command TEXT NOT NULL,
        exit_code INTEGER,
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        finished_at TEXT,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS module_settings (
        module_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        PRIMARY KEY (module_id, key)
      );

      CREATE TABLE IF NOT EXISTS module_kv (
        module_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (module_id, key)
      );

      CREATE TABLE IF NOT EXISTS module_notifications (
        module_id TEXT NOT NULL,
        key TEXT NOT NULL,
        kind TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        body TEXT,
        version TEXT,
        count INTEGER,
        label TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        seen_at TEXT,
        PRIMARY KEY (module_id, key)
      );
    `)
  }

  listTables(): string[] {
    const rows = this.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).all() as { name: string }[]
    return rows.map(r => r.name)
  }

  addProject(input: { name: string; path: string }): string {
    const id = randomUUID()
    this.db.prepare(
      'INSERT INTO projects (id, name, path) VALUES (?, ?, ?)'
    ).run(id, input.name, input.path)
    return id
  }

  listProjects(): Project[] {
    const rows = this.db.prepare(
      'SELECT * FROM projects ORDER BY created_at DESC'
    ).all() as unknown as RawProject[]
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      path: r.path,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }))
  }

  getProject(id: string): Project | undefined {
    const row = this.db.prepare(
      'SELECT * FROM projects WHERE id = ?'
    ).get(id) as RawProject | undefined
    if (!row) return undefined
    return {
      id: row.id,
      name: row.name,
      path: row.path,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  removeProject(id: string): void {
    this.db.prepare('DELETE FROM projects WHERE id = ?').run(id)
  }

  addModule(input: { name: string; version: string }): string {
    const id = randomUUID()
    this.db.prepare(
      'INSERT INTO modules (id, name, version) VALUES (?, ?, ?)'
    ).run(id, input.name, input.version)
    return id
  }

  listModules(): InstalledModule[] {
    const rows = this.db.prepare(
      'SELECT * FROM modules ORDER BY installed_at DESC'
    ).all() as unknown as RawInstalledModule[]
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      version: r.version,
      enabled: r.enabled === 1,
      installedAt: r.installed_at,
    }))
  }

  removeModule(name: string): void {
    this.db.prepare('DELETE FROM modules WHERE name = ?').run(name)
  }

  logAction(input: {
    projectId: string | null
    moduleId: string
    actionId: string
    command: string
  }): string {
    const id = randomUUID()
    this.db.prepare(
      'INSERT INTO action_logs (id, project_id, module_id, action_id, command) VALUES (?, ?, ?, ?, ?)'
    ).run(id, input.projectId, input.moduleId, input.actionId, input.command)
    return id
  }

  getActionLog(id: string): ActionLog | undefined {
    const row = this.db.prepare(
      'SELECT * FROM action_logs WHERE id = ?'
    ).get(id) as RawActionLog | undefined
    if (!row) return undefined
    return {
      id: row.id,
      projectId: row.project_id,
      moduleId: row.module_id,
      actionId: row.action_id,
      command: row.command,
      exitCode: row.exit_code,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
    }
  }

  completeAction(id: string, exitCode: number): void {
    this.db.prepare(
      "UPDATE action_logs SET exit_code = ?, finished_at = datetime('now') WHERE id = ?"
    ).run(exitCode, id)
  }

  getModuleSettings(moduleId: string): Record<string, string> {
    const rows = this.db.prepare(
      'SELECT key, value FROM module_settings WHERE module_id = ?'
    ).all(moduleId) as { key: string; value: string }[]
    const result: Record<string, string> = {}
    for (const row of rows) {
      result[row.key] = row.value
    }
    return result
  }

  setModuleSetting(moduleId: string, key: string, value: string): void {
    this.db.prepare(
      'INSERT INTO module_settings (module_id, key, value) VALUES (?, ?, ?) ON CONFLICT(module_id, key) DO UPDATE SET value = excluded.value'
    ).run(moduleId, key, value)
  }

  kvGet(moduleId: string, key: string): string | undefined {
    const row = this.db.prepare('SELECT value FROM module_kv WHERE module_id = ? AND key = ?').get(moduleId, key) as { value: string } | undefined
    return row?.value
  }

  kvSet(moduleId: string, key: string, json: string): void {
    this.db.prepare(
      "INSERT INTO module_kv (module_id, key, value) VALUES (?, ?, ?) ON CONFLICT(module_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
    ).run(moduleId, key, json)
  }

  kvDelete(moduleId: string, key: string): void {
    this.db.prepare('DELETE FROM module_kv WHERE module_id = ? AND key = ?').run(moduleId, key)
  }

  kvList(moduleId: string, prefix = ''): string[] {
    const rows = this.db.prepare('SELECT key FROM module_kv WHERE module_id = ? AND substr(key, 1, ?) = ? ORDER BY key').all(moduleId, prefix.length, prefix) as { key: string }[]
    return rows.map(r => r.key)
  }

  // true when the row is new or its version changed; a changed version is unseen again
  upsertNotification(row: ModuleNotificationRow): boolean {
    const current = this.db.prepare('SELECT version, title, body, count, label FROM module_notifications WHERE module_id = ? AND key = ?')
      .get(row.moduleId, row.key) as { version: string | null; title: string; body: string | null; count: number | null; label: string | null } | undefined
    const version = row.version ?? null
    if (current && current.version === version) {
      this.db.prepare('UPDATE module_notifications SET title = ?, body = ?, count = ?, label = ? WHERE module_id = ? AND key = ?')
        .run(row.title, row.body ?? null, row.count ?? null, row.label ?? null, row.moduleId, row.key)
      return false
    }
    this.db.prepare(
      `INSERT INTO module_notifications (module_id, key, kind, title, body, version, count, label) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(module_id, key) DO UPDATE SET kind = excluded.kind, title = excluded.title, body = excluded.body, version = excluded.version,
       count = excluded.count, label = excluded.label, created_at = datetime('now'), seen_at = NULL`
    ).run(row.moduleId, row.key, row.kind, row.title, row.body ?? null, version, row.count ?? null, row.label ?? null)
    return true
  }

  deleteNotification(moduleId: string, key: string): void {
    this.db.prepare('DELETE FROM module_notifications WHERE module_id = ? AND key = ?').run(moduleId, key)
  }

  listNotifications(): ModuleNotificationRow[] {
    const rows = this.db.prepare('SELECT * FROM module_notifications ORDER BY created_at, rowid').all() as Array<Record<string, string | number | null>>
    return rows.map(r => ({
      moduleId: r.module_id as string,
      key: r.key as string,
      kind: r.kind as 'attention' | 'badge',
      title: r.title as string,
      body: (r.body as string | null) ?? undefined,
      version: (r.version as string | null) ?? undefined,
      count: (r.count as number | null) ?? undefined,
      label: (r.label as string | null) ?? undefined,
      createdAt: r.created_at as string,
      seenAt: (r.seen_at as string | null) ?? null,
    }))
  }

  markNotificationsSeen(moduleId: string): void {
    this.db.prepare("UPDATE module_notifications SET seen_at = datetime('now') WHERE module_id = ? AND seen_at IS NULL").run(moduleId)
  }

  deleteModuleSetting(moduleId: string, key: string): void {
    this.db.prepare('DELETE FROM module_settings WHERE module_id = ? AND key = ?').run(moduleId, key)
  }

  listActionLogs(opts: { moduleId?: string; limit?: number }): ActionLog[] {
    const { moduleId, limit = 50 } = opts
    let sql = 'SELECT * FROM action_logs'
    const params: SQLInputValue[] = []

    if (moduleId) {
      sql += ' WHERE module_id = ?'
      params.push(moduleId)
    }

    sql += ' ORDER BY started_at DESC, rowid DESC LIMIT ?'
    params.push(limit)

    const rows = this.db.prepare(sql).all(...params) as unknown as RawActionLog[]
    return rows.map(r => ({
      id: r.id,
      projectId: r.project_id,
      moduleId: r.module_id,
      actionId: r.action_id,
      command: r.command,
      exitCode: r.exit_code,
      startedAt: r.started_at,
      finishedAt: r.finished_at,
    }))
  }

  close(): void {
    this.db.close()
  }
}
