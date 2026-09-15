import { execFile } from 'node:child_process'
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

export interface RunResult { code: number; stdout: string; stderr: string }
export type Runner = (bin: string, args: string[], cwd: string) => Promise<RunResult>

const COMMAND_TIMEOUT_MS = 10_000

export const runCommand: Runner = (bin, args, cwd) => new Promise((resolve) => {
  execFile(bin, args, { cwd, timeout: COMMAND_TIMEOUT_MS, maxBuffer: 5 * 1024 * 1024 }, (err, stdout, stderr) => {
    if (!err) return resolve({ code: 0, stdout: String(stdout), stderr: String(stderr) })
    const { code } = err as NodeJS.ErrnoException & { code?: number | string }
    if (code === 'ENOENT') return resolve({ code: 127, stdout: '', stderr: 'ENOENT' })
    resolve({ code: typeof code === 'number' ? code : 1, stdout: String(stdout), stderr: String(stderr) || err.message })
  })
})

export class GitReadError extends Error {}

export interface GitSnapshot {
  branch: string | null
  uncommitted: number
  upstream: string | null
  unpushed: number | null
  repo: GitHubRepo | null
}

const lines = (text: string) => text.split('\n').filter(line => line.length > 0)

export async function readGitSnapshot(run: Runner, worktree: string): Promise<GitSnapshot> {
  const head = await run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], worktree)
  if (head.code !== 0) throw new GitReadError(head.stderr.trim() || 'git rev-parse failed')
  const status = await run('git', ['status', '--porcelain'], worktree)
  if (status.code !== 0) throw new GitReadError(status.stderr.trim() || 'git status failed')

  const branchName = head.stdout.trim()
  const upstreamRes = await run('git', ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], worktree)
  const upstream = upstreamRes.code === 0 ? upstreamRes.stdout.trim() : null
  let unpushed: number | null = null
  if (upstream) {
    const count = await run('git', ['rev-list', '--count', '@{u}..HEAD'], worktree)
    unpushed = count.code === 0 ? Number(count.stdout.trim()) : null
  }
  const remote = await run('git', ['remote', 'get-url', 'origin'], worktree)

  return {
    branch: branchName === 'HEAD' ? null : branchName,
    uncommitted: lines(status.stdout).length,
    upstream,
    unpushed,
    repo: remote.code === 0 ? parseGitHubRemote(remote.stdout) : null,
  }
}

export async function resolveBase(run: Runner, cwd: string, candidates: Array<string | null | undefined>): Promise<string | null> {
  for (const candidate of candidates) {
    if (!candidate) continue
    let ref = candidate
    if (candidate === 'origin/HEAD') {
      const head = await run('git', ['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD'], cwd)
      if (head.code !== 0) continue
      ref = head.stdout.trim().replace(/^refs\/remotes\//, '')
    }
    const verify = await run('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], cwd)
    if (verify.code === 0) return ref
  }
  return null
}

export async function readBaseCounts(run: Runner, cwd: string, base: string | null): Promise<{ commits: number | null; diff: DiffStat | null }> {
  if (!base) return { commits: null, diff: null }
  const count = await run('git', ['rev-list', '--count', `${base}..HEAD`], cwd)
  const stat = await run('git', ['diff', '--shortstat', base], cwd)
  return {
    commits: count.code === 0 ? Number(count.stdout.trim()) : null,
    diff: stat.code === 0 ? parseShortstat(stat.stdout) : null,
  }
}
