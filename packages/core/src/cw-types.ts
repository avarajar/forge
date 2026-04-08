/** Valid account/project name: starts with alphanumeric, then alphanumeric/hyphen/underscore, max 64 chars */
export const ACCOUNT_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/

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
  type: 'task' | 'review' | 'general' | 'create'
  account: string
  workflow?: string
  model?: string
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
  skipPermissions?: boolean
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
