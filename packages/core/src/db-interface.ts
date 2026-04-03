import type { Project, InstalledModule, ActionLog } from './types.js'

export interface IForgeDB {
  listTables(): string[]
  addProject(input: { name: string; path: string }): string
  listProjects(): Project[]
  getProject(id: string): Project | undefined
  removeProject(id: string): void
  addModule(input: { name: string; version: string }): string
  listModules(): InstalledModule[]
  removeModule(name: string): void
  logAction(input: { projectId: string | null; moduleId: string; actionId: string; command: string }): string
  getActionLog(id: string): ActionLog | undefined
  completeAction(id: string, exitCode: number): void
  getModuleSettings(moduleId: string): Record<string, string>
  setModuleSetting(moduleId: string, key: string, value: string): void
  listActionLogs(opts: { moduleId?: string; limit?: number }): ActionLog[]
  close(): void
}
