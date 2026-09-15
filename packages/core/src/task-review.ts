import type { ChecksSummary, CloseWarning, DiffStat, GitHubLink, PullRequestInfo, TaskReviewState } from './cw-types.js'

export interface GitHubRepo { owner: string; repo: string }

const GITHUB_REMOTE_RE = /^(?:git@github\.com:|ssh:\/\/git@github\.com\/|https:\/\/github\.com\/)([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/

export function parseGitHubRemote(url: string): GitHubRepo | null {
  const match = GITHUB_REMOTE_RE.exec(url.trim())
  return match ? { owner: match[1], repo: match[2] } : null
}

const FAILED_CONCLUSIONS = new Set(['FAILURE', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE'])
const FAILED_STATES = new Set(['FAILURE', 'ERROR'])
const PENDING_STATES = new Set(['PENDING', 'EXPECTED'])

interface RollupEntry { __typename?: string; status?: string; conclusion?: string; state?: string }

export function summarizeChecks(rollup: unknown): ChecksSummary {
  if (!Array.isArray(rollup) || rollup.length === 0) return 'none'
  const entries = rollup as RollupEntry[]
  const isStatusContext = (e: RollupEntry) => e.__typename === 'StatusContext' || (e.state !== undefined && e.status === undefined)
  if (entries.some(e => isStatusContext(e) ? FAILED_STATES.has(e.state ?? '') : FAILED_CONCLUSIONS.has(e.conclusion ?? ''))) return 'failing'
  if (entries.some(e => isStatusContext(e) ? PENDING_STATES.has(e.state ?? '') : e.status !== 'COMPLETED')) return 'pending'
  return 'passing'
}

export function parseShortstat(text: string): DiffStat {
  const num = (re: RegExp) => Number(re.exec(text)?.[1] ?? 0)
  return {
    files: num(/(\d+) files? changed/),
    insertions: num(/(\d+) insertions?\(\+\)/),
    deletions: num(/(\d+) deletions?\(-\)/),
  }
}

export interface LinkInput {
  repo: GitHubRepo | null
  kind: 'task' | 'review'
  prNumber?: string
  pr: PullRequestInfo
  branch: string | null
  base: string | null
  upstream: string | null
  commits: number | null
  uncommitted: number
}

export function githubLink(input: LinkInput): GitHubLink {
  const { repo, kind, pr } = input
  if (!repo) return null
  const repoUrl = `https://github.com/${repo.owner}/${repo.repo}`
  if (pr.status === 'found') {
    return { url: kind === 'review' ? pr.url : `${pr.url}/files`, label: 'View PR on GitHub' }
  }
  if (kind === 'review') {
    return input.prNumber ? { url: `${repoUrl}/pull/${encodeURIComponent(input.prNumber)}`, label: 'View PR on GitHub' } : null
  }
  if (input.upstream && input.branch) {
    const branch = encodeURIComponent(input.branch)
    if (input.base) {
      const baseName = encodeURIComponent(input.base.replace(/^origin\//, ''))
      return { url: `${repoUrl}/compare/${baseName}...${branch}`, label: 'View on GitHub' }
    }
    return { url: `${repoUrl}/tree/${branch}`, label: 'View on GitHub' }
  }
  if ((input.commits ?? 0) > 0 || input.uncommitted > 0) return { url: null, reason: 'Push the branch first' }
  return null
}

export interface WarningInput {
  workspace: TaskReviewState['workspace']
  uncommitted: number
  commits: number | null
  base: string | null
  upstream: string | null
  unpushed: number | null
  pr: PullRequestInfo
  gitFailed: boolean
}

export function closeWarningsFor(input: WarningInput): CloseWarning[] {
  if (input.workspace !== 'ready') return []
  if (input.gitFailed) return ['state-unknown']
  const warnings: CloseWarning[] = []
  if (input.uncommitted > 0) warnings.push('uncommitted')
  const unpushed = input.upstream ? (input.unpushed ?? 0) > 0 : (input.commits ?? 0) > 0
  if (unpushed) warnings.push('unpushed')
  if (input.pr.status === 'found' && input.pr.state === 'OPEN') warnings.push('pr-open')
  if (input.base === null && input.upstream === null) warnings.push('state-unknown')
  return warnings
}
