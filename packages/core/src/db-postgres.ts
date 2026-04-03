import postgres from 'postgres'
import { randomUUID } from 'node:crypto'
import type { Project, InstalledModule, ActionLog } from './types.js'
import type { IForgeDB } from './db-interface.js'

export class PostgresDB implements IForgeDB {
  private sql: postgres.Sql

  constructor(connectionUrl: string) {
    this.sql = postgres(connectionUrl)
  }

  async migrate(): Promise<void> {
    await this.sql`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        path TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `
    await this.sql`
      CREATE TABLE IF NOT EXISTS modules (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        version TEXT NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT true,
        installed_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `
    await this.sql`
      CREATE TABLE IF NOT EXISTS action_logs (
        id TEXT PRIMARY KEY,
        project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
        module_id TEXT NOT NULL,
        action_id TEXT NOT NULL,
        command TEXT NOT NULL,
        exit_code INTEGER,
        started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        finished_at TIMESTAMPTZ
      )
    `
    await this.sql`
      CREATE TABLE IF NOT EXISTS module_settings (
        module_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        PRIMARY KEY (module_id, key)
      )
    `
  }

  listTables(): string[] {
    return ['projects', 'modules', 'action_logs', 'module_settings']
  }

  addProject(input: { name: string; path: string }): string {
    const id = randomUUID()
    this.sql`INSERT INTO projects (id, name, path) VALUES (${id}, ${input.name}, ${input.path})`.execute()
    return id
  }

  listProjects(): Project[] {
    return []
  }

  getProject(_id: string): Project | undefined {
    return undefined
  }

  removeProject(id: string): void {
    this.sql`DELETE FROM projects WHERE id = ${id}`.execute()
  }

  addModule(input: { name: string; version: string }): string {
    const id = randomUUID()
    this.sql`INSERT INTO modules (id, name, version) VALUES (${id}, ${input.name}, ${input.version})`.execute()
    return id
  }

  listModules(): InstalledModule[] {
    return []
  }

  removeModule(name: string): void {
    this.sql`DELETE FROM modules WHERE name = ${name}`.execute()
  }

  logAction(input: { projectId: string | null; moduleId: string; actionId: string; command: string }): string {
    const id = randomUUID()
    this.sql`INSERT INTO action_logs (id, project_id, module_id, action_id, command) VALUES (${id}, ${input.projectId}, ${input.moduleId}, ${input.actionId}, ${input.command})`.execute()
    return id
  }

  getActionLog(_id: string): ActionLog | undefined {
    return undefined
  }

  completeAction(id: string, exitCode: number): void {
    this.sql`UPDATE action_logs SET exit_code = ${exitCode}, finished_at = now() WHERE id = ${id}`.execute()
  }

  getModuleSettings(_moduleId: string): Record<string, string> {
    return {}
  }

  setModuleSetting(moduleId: string, key: string, value: string): void {
    this.sql`INSERT INTO module_settings (module_id, key, value) VALUES (${moduleId}, ${key}, ${value}) ON CONFLICT (module_id, key) DO UPDATE SET value = EXCLUDED.value`.execute()
  }

  listActionLogs(_opts: { moduleId?: string; limit?: number }): ActionLog[] {
    return []
  }

  close(): void {
    this.sql.end()
  }
}
