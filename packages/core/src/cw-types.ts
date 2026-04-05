export interface CWProject {
  path: string
  account: string
  type: string
  registered: string
}

export interface CWSession {
  project: string
  task?: string
  pr?: string
  type: 'task' | 'review'
  account: string
  workflow?: string
  worktree: string
  notes: string
  source?: string
  source_url?: string
  status: 'active' | 'done'
  created: string
  last_opened: string
  opens: number
  closed?: string
  sessionDir?: string
}

export interface CWConfig {
  default_account: string
  skip_permissions: boolean
  tools?: {
    tracker?: string
    docs?: string
    chat?: string
    repo?: string
  }
}

export interface StackDetection {
  hasPackageJson: boolean
  hasTests: boolean
  hasTailwind: boolean
  hasShadcn: boolean
  hasTokens: boolean
  hasFigmaConfig: boolean
  hasPlaywright: boolean
  hasDockerfile: boolean
  framework: string | null
  testRunner: string | null
}
