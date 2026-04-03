export interface Project {
  id: string
  name: string
  path: string
  createdAt: string
  updatedAt: string
}

export interface InstalledModule {
  id: string
  name: string
  version: string
  enabled: boolean
  installedAt: string
}

export interface ActionLog {
  id: string
  projectId: string | null
  moduleId: string
  actionId: string
  command: string
  exitCode: number | null
  startedAt: string
  finishedAt: string | null
}

export interface ForgeConfig {
  port: number
  theme: 'dark' | 'light'
  openBrowser: boolean
  dataDir: string
}

export interface ModuleSetting {
  moduleId: string
  key: string
  value: string
}

export interface TeamConfig {
  databaseUrl: string
  authToken: string
}
