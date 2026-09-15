import { execFile } from 'node:child_process'
import { lstatSync } from 'node:fs'
import { join } from 'node:path'
import type { ChecksSummary, CloseWarning, CWSession, DiffStat, GitHubLink, PullRequestInfo, TaskReviewState } from './cw-types.js'

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
  unpushed: number | null
  pr: PullRequestInfo
  gitFailed: boolean
}

export function closeWarningsFor(input: WarningInput): CloseWarning[] {
  if (input.workspace !== 'ready') return []
  if (input.gitFailed) return ['state-unknown']
  const warnings: CloseWarning[] = []
  if (input.uncommitted > 0) warnings.push('uncommitted')
  const unpushed = input.unpushed !== null ? input.unpushed > 0 : (input.commits ?? 0) > 0
  if (unpushed) warnings.push('unpushed')
  if (input.pr.status === 'found' && input.pr.state === 'OPEN') warnings.push('pr-open')
  if (input.base === null && input.unpushed === null) warnings.push('state-unknown')
  return warnings
}

export interface RunResult { code: number; stdout: string; stderr: string }
export type Runner = (bin: string, args: string[], cwd: string) => Promise<RunResult>

const COMMAND_TIMEOUT_MS = 10_000

// env is for tests that must not see the developer's git config; production uses the inherited environment
export function createRunner(env?: NodeJS.ProcessEnv): Runner {
  return (bin, args, cwd) => new Promise((resolve) => {
    execFile(bin, args, { cwd, env, timeout: COMMAND_TIMEOUT_MS, maxBuffer: 5 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (!err) return resolve({ code: 0, stdout: String(stdout), stderr: String(stderr) })
      const { code } = err as NodeJS.ErrnoException & { code?: number | string }
      if (code === 'ENOENT') return resolve({ code: 127, stdout: '', stderr: 'ENOENT' })
      resolve({ code: typeof code === 'number' ? code : 1, stdout: String(stdout), stderr: String(stderr) || err.message })
    })
  })
}

export const runCommand: Runner = createRunner()

export class GitReadError extends Error {}

export interface GitSnapshot {
  branch: string | null
  uncommitted: number
  upstream: string | null
  unpushed: number | null
  repo: GitHubRepo | null
}

const lines = (text: string) => text.split('\n').filter(line => line.length > 0)

// CW links these from the project into every worktree; a `.claude/` ignore pattern does not match a symlink
const CW_LINKED_FILES = new Set(['.claude', '.env', 'TASK_NOTES.md', 'SHARED_CONTEXT.md'])

function isCwLink(worktree: string, porcelainLine: string): boolean {
  if (!porcelainLine.startsWith('?? ')) return false
  const path = porcelainLine.slice(3)
  if (!CW_LINKED_FILES.has(path)) return false
  try {
    return lstatSync(join(worktree, path)).isSymbolicLink()
  } catch {
    return false
  }
}

export async function readGitSnapshot(run: Runner, worktree: string): Promise<GitSnapshot> {
  const head = await run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], worktree)
  if (head.code !== 0) throw new GitReadError(head.stderr.trim() || 'git rev-parse failed')
  const status = await run('git', ['status', '--porcelain', '--untracked-files=all'], worktree)
  if (status.code !== 0) throw new GitReadError(status.stderr.trim() || 'git status failed')

  const branchName = head.stdout.trim()
  const branch = branchName === 'HEAD' ? null : branchName
  // only origin/<branch> counts: CW branches from origin/main, which makes @{u} point there
  let upstream: string | null = null
  let unpushed: number | null = null
  if (branch) {
    const remoteRef = `refs/remotes/origin/${branch}`
    const verify = await run('git', ['rev-parse', '--verify', '--quiet', remoteRef], worktree)
    if (verify.code === 0) {
      upstream = `origin/${branch}`
      const count = await run('git', ['rev-list', '--count', `${remoteRef}..HEAD`], worktree)
      unpushed = count.code === 0 ? Number(count.stdout.trim()) : null
    }
  }
  const remote = await run('git', ['remote', 'get-url', 'origin'], worktree)

  return {
    branch,
    uncommitted: lines(status.stdout).filter(line => !isCwLink(worktree, line)).length,
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

const PR_FIELDS = 'number,state,url,isDraft,baseRefName,headRefOid,reviewDecision,statusCheckRollup'
const PR_STATES = new Set(['OPEN', 'MERGED', 'CLOSED'])
const REVIEW_DECISIONS = new Set(['APPROVED', 'CHANGES_REQUESTED', 'REVIEW_REQUIRED'])

interface RawPullRequest {
  number: number
  state: string
  url: string
  isDraft: boolean
  baseRefName: string
  headRefOid: string
  reviewDecision: string
  statusCheckRollup: unknown
}

function toPullRequestInfo(raw: RawPullRequest): PullRequestInfo {
  return {
    status: 'found',
    number: raw.number,
    url: raw.url,
    state: (PR_STATES.has(raw.state) ? raw.state : 'CLOSED') as 'OPEN' | 'MERGED' | 'CLOSED',
    isDraft: Boolean(raw.isDraft),
    baseRefName: raw.baseRefName,
    headRefOid: typeof raw.headRefOid === 'string' ? raw.headRefOid : '',
    checks: summarizeChecks(raw.statusCheckRollup),
    review: REVIEW_DECISIONS.has(raw.reviewDecision)
      ? raw.reviewDecision as 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED'
      : null,
  }
}

function ghUnavailable(result: RunResult): PullRequestInfo {
  if (result.code === 127 && result.stderr === 'ENOENT') return { status: 'unavailable', reason: 'gh is not installed' }
  const firstLine = result.stderr.split('\n').map(line => line.trim()).find(line => line.length > 0)
  return { status: 'unavailable', reason: firstLine ?? 'gh failed' }
}

const UNEXPECTED: PullRequestInfo = { status: 'unavailable', reason: 'gh returned unexpected output' }

export async function readPullRequestForBranch(run: Runner, cwd: string, branch: string): Promise<PullRequestInfo> {
  const result = await run('gh', ['pr', 'list', '--head', branch, '--state', 'all', '--limit', '1', '--json', PR_FIELDS], cwd)
  if (result.code !== 0) return ghUnavailable(result)
  try {
    const list = JSON.parse(result.stdout) as RawPullRequest[]
    if (!Array.isArray(list)) return UNEXPECTED
    return list.length === 0 ? { status: 'none' } : toPullRequestInfo(list[0])
  } catch {
    return UNEXPECTED
  }
}

export async function readPullRequestByNumber(run: Runner, cwd: string, number: string): Promise<PullRequestInfo> {
  const result = await run('gh', ['pr', 'view', number, '--json', PR_FIELDS], cwd)
  if (result.code !== 0) return ghUnavailable(result)
  try {
    const raw = JSON.parse(result.stdout) as RawPullRequest
    return typeof raw?.number === 'number' ? toPullRequestInfo(raw) : UNEXPECTED
  } catch {
    return UNEXPECTED
  }
}

export interface ReviewDeps {
  run: Runner
  limitGh: <T>(fn: () => Promise<T>) => Promise<T>
  exists: (path: string) => boolean
}

const NOT_GITHUB: PullRequestInfo = { status: 'unavailable', reason: 'origin is not a GitHub repository' }

function idleState(workspace: TaskReviewState['workspace']): TaskReviewState {
  return {
    workspace, branch: null, base: null, uncommitted: 0, commits: null, upstream: null, unpushed: null,
    diff: null, pr: { status: 'none' }, github: null, closeWarnings: [],
  }
}

async function buildReviewSessionState(session: CWSession, projectPath: string | null, deps: ReviewDeps): Promise<TaskReviewState> {
  if (!projectPath || !deps.exists(projectPath)) return idleState('none')
  const remote = await deps.run('git', ['remote', 'get-url', 'origin'], projectPath)
  const repo = remote.code === 0 ? parseGitHubRemote(remote.stdout) : null
  // CW also stores Linear IDs here; only a number names a pull request
  const prNumber = session.pr && /^\d+$/.test(session.pr) ? session.pr : undefined
  const pr: PullRequestInfo = !prNumber ? { status: 'none' }
    : !repo ? NOT_GITHUB
    : await deps.limitGh(() => readPullRequestByNumber(deps.run, projectPath, prNumber))
  const github = githubLink({ repo, kind: 'review', prNumber, pr, branch: null, base: null, upstream: null, commits: null, uncommitted: 0 })
  return { ...idleState('none'), pr, github }
}

const OBJECT_ID_RE = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/

async function isAncestor(run: Runner, cwd: string, ancestor: string, descendant: string): Promise<boolean> {
  return (await run('git', ['merge-base', '--is-ancestor', ancestor, descendant], cwd)).code === 0
}

export async function buildTaskReviewState(session: CWSession, projectPath: string | null, deps: ReviewDeps): Promise<TaskReviewState> {
  if (session.type === 'review') return buildReviewSessionState(session, projectPath, deps)
  if (session.type !== 'task') return idleState('none')
  const worktree = session.worktree
  if (!worktree || !deps.exists(worktree)) return idleState('missing')

  let snapshot: GitSnapshot
  try {
    snapshot = await readGitSnapshot(deps.run, worktree)
  } catch {
    return { ...idleState('ready'), pr: { status: 'unavailable', reason: 'Could not read git state' }, closeWarnings: ['state-unknown'] }
  }

  const { branch, repo, uncommitted, upstream } = snapshot
  let { unpushed } = snapshot
  let pr: PullRequestInfo = !repo ? NOT_GITHUB
    : branch ? await deps.limitGh(() => readPullRequestForBranch(deps.run, worktree, branch))
    : { status: 'none' }
  if (pr.status === 'found') {
    // a branch name can be reused, so a pull request only belongs to this task when its head shares HEAD's history
    const valid = OBJECT_ID_RE.test(pr.headRefOid)
    const headContained = valid && await isAncestor(deps.run, worktree, 'HEAD', pr.headRefOid)
    const headBehind = valid && !headContained && await isAncestor(deps.run, worktree, pr.headRefOid, 'HEAD')
    if (!headContained && !headBehind) pr = { status: 'none' }
    // everything up to HEAD is on GitHub, even when the branch was deleted after a merge
    else if (headContained) unpushed = 0
  }
  const base = await resolveBase(deps.run, worktree, [
    pr.status === 'found' ? `origin/${pr.baseRefName}` : null,
    session.base_branch,
    'origin/HEAD',
    'origin/main',
  ])
  const { commits, diff } = await readBaseCounts(deps.run, worktree, base)

  return {
    workspace: 'ready', branch, base, uncommitted, commits, upstream, unpushed, diff, pr,
    github: githubLink({ repo, kind: 'task', pr, branch, base, upstream, commits, uncommitted }),
    closeWarnings: closeWarningsFor({ workspace: 'ready', uncommitted, commits, base, unpushed, pr, gitFailed: false }),
  }
}

export function createLimiter(max: number): <T>(fn: () => Promise<T>) => Promise<T> {
  let active = 0
  const waiting: Array<() => void> = []
  // a finishing task hands its slot straight to the next waiter, so a new caller can never slip in between
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (active >= max) await new Promise<void>(resolve => waiting.push(resolve))
    else active++
    try {
      return await fn()
    } finally {
      const next = waiting.shift()
      if (next) next()
      else active--
    }
  }
}
