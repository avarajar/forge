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

export type SkillScope = 'global' | 'account' | 'project'

export interface SkillEntry {
  name: string
  dirName: string
  scope: SkillScope
  scopeRef: string
  description: string
  domain?: string
  triggers?: string
  hasReferences: boolean
}

export interface SkillDetail {
  name: string
  scope: SkillScope
  scopeRef: string
  frontmatter: Record<string, unknown>
  body: string
  references: { name: string; content: string }[]
}

export interface ExploreResult {
  name: string
  slug: string
  installs: number
  source: 'skills.sh'
  url: string
  repo: string
}
