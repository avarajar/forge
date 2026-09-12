/** Valid account/project name: starts with alphanumeric, then alphanumeric/hyphen/underscore, max 64 chars */
export const ACCOUNT_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/

/** Valid harness name: lowercase alphanumeric, then alphanumeric/hyphen/underscore, max 32 chars */
export const HARNESS_NAME_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/

export interface CWProject {
  path: string
  account: string
  type: string
  harness?: string
  registered: string
}

export interface CWSession {
  project: string
  task?: string
  pr?: string
  type: 'task' | 'review' | 'general' | 'create' | 'loop' | 'login'
  account: string
  harness?: string
  harness_session_id?: string
  provider?: string
  workflow?: string
  model?: string
  worktree: string
  notes: string
  source?: string
  source_url?: string
  loop_prompt?: string
  loop_interval?: string
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

export type HarnessStatus = 'connected' | 'not_logged_in' | 'not_installed' | 'local' | 'error'
export type ProviderKind = 'native' | 'api' | 'local'

export interface CWDoctorHarness {
  name: string
  installed: boolean
  path: string | null
  version: string | null
  source: 'builtin' | 'user'
}

export interface CWLocalDetail {
  endpoint: string
  reachable: boolean
  model_pulled: boolean
}

export interface CWDoctorCell {
  harness: string
  status: HarnessStatus
  detail: null | string | CWLocalDetail
  config_env: string
  config_dir: string
  provider: string
  provider_kind: ProviderKind
  model: string | null
  unofficial: boolean
  has_api_key: boolean
}

export interface CWDoctorAccount {
  name: string
  root: string
  layout: 'split' | 'legacy' | 'none'
  default_harness: string
  harnesses: CWDoctorCell[]
}

export interface CWDoctorFinding {
  code: string
  message: string
  count?: number
}

export interface CWDoctor {
  schema: 1
  cw_version: string
  cw_home: string
  generated: string
  harnesses: CWDoctorHarness[]
  accounts: CWDoctorAccount[]
  issues: CWDoctorFinding[]
  warnings: CWDoctorFinding[]
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
