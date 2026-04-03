import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import type { Project, InstalledModule, ActionLog } from './types.js'

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

export class ForgeDB {
  private db: Database.Database

  constructor(dbPath: string) {
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
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
    ).all() as RawProject[]
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
    ).all() as RawInstalledModule[]
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

  listActionLogs(opts: { moduleId?: string; limit?: number }): ActionLog[] {
    const { moduleId, limit = 50 } = opts
    let sql = 'SELECT * FROM action_logs'
    const params: unknown[] = []

    if (moduleId) {
      sql += ' WHERE module_id = ?'
      params.push(moduleId)
    }

    sql += ' ORDER BY started_at DESC, rowid DESC LIMIT ?'
    params.push(limit)

    const rows = this.db.prepare(sql).all(...params) as RawActionLog[]
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
