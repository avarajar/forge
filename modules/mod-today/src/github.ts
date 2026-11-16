import type { ForgeContext } from '@forge-dev/sdk'
import { errorMessage, oneLine } from './ops'

export interface GithubEvent {
  type: 'comment' | 'review' | 'review-request' | 'mention' | 'assigned' | 'ci-failure'
  repo: string
  number: number
  title: string
  url: string
  // the pull request or issue address without any comment anchor
  pr: string
  who?: string
  when: string
  text?: string
  headRef?: string
  checks?: string[]
}

const TIMEOUT_MS = 30_000
const MAX_PRS = 20
const CONCURRENCY = 4
const DEADLINE_MS = 90_000
const TEXT_MAX = 600
const FAILED = new Set(['FAILURE', 'TIMED_OUT', 'STARTUP_FAILURE', 'ERROR'])
const SEARCH_FIELDS = 'number,title,url,repository,updatedAt,author'

interface Login { login?: string }
interface Found { number: number; title: string; url: string; repository?: { nameWithOwner?: string }; updatedAt: string; author?: Login }
interface PrView {
  headRefName?: string
  comments?: { author?: Login; body?: string; createdAt: string; url: string }[]
  reviews?: { author?: Login; body?: string; state?: string; submittedAt?: string }[]
  statusCheckRollup?: { name?: string; context?: string; conclusion?: string; state?: string; completedAt?: string; startedAt?: string }[]
}
interface Notification { reason: string; updated_at: string; subject: { title: string; url: string | null }; repository: { full_name: string } }

class GhError extends Error {}

const newer = (when: string | undefined, since: string): when is string => !!when && Date.parse(when) > Date.parse(since)
const clip = (t: string | undefined) => oneLine(t ?? '', TEXT_MAX) || undefined

// runs one read-only gh command and parses its JSON
async function gh<T>(ctx: ForgeContext, args: string[]): Promise<T> {
  let r
  try {
    r = await ctx.shell.exec('gh', args, { timeoutMs: TIMEOUT_MS })
  } catch (e) {
    throw new GhError(`gh could not run: ${errorMessage(e)}`)
  }
  if (r.timedOut) throw new GhError('gh took too long to answer')
  if (r.exitCode !== 0) throw new GhError(clip(r.output)?.slice(0, 200) || `gh exited with ${r.exitCode}`)
  try {
    return JSON.parse(r.output) as T
  } catch {
    throw new GhError('gh answered with something that is not JSON')
  }
}

// a notification's API address as the page address, or null for anything but a PR or issue
function pageUrl(api: string | null): { url: string; number: number } | null {
  const m = /^https:\/\/api\.github\.com\/repos\/([^/]+\/[^/]+)\/(pulls|issues)\/(\d+)$/.exec(api ?? '')
  return m ? { url: `https://github.com/${m[1]}/${m[2] === 'pulls' ? 'pull' : 'issues'}/${m[3]}`, number: Number(m[3]) } : null
}

const repoOf = (f: Found) => f.repository?.nameWithOwner ?? ''

function fromPr(me: string, pr: Found, view: PrView, since: string): GithubEvent[] {
  const base = { repo: repoOf(pr), number: pr.number, title: pr.title, headRef: view.headRefName }
  const out: GithubEvent[] = []
  for (const c of view.comments ?? []) {
    if (newer(c.createdAt, since) && c.author?.login !== me) out.push({ ...base, type: 'comment', url: c.url, pr: pr.url, who: c.author?.login, when: c.createdAt, text: clip(c.body) })
  }
  for (const r of view.reviews ?? []) {
    if (newer(r.submittedAt, since) && r.author?.login !== me && (r.body?.trim() || r.state === 'CHANGES_REQUESTED' || r.state === 'APPROVED')) {
      out.push({ ...base, type: 'review', url: pr.url, pr: pr.url, who: r.author?.login, when: r.submittedAt, text: clip(r.body) ?? r.state?.toLowerCase().replace('_', ' ') })
    }
  }
  // a commit status has no completedAt, so it dates from when it started
  const at = (c: NonNullable<PrView['statusCheckRollup']>[number]) => c.completedAt ?? c.startedAt
  const failed = (view.statusCheckRollup ?? []).filter(c => newer(at(c), since) && FAILED.has(c.conclusion ?? c.state ?? ''))
  if (failed.length) {
    const when = failed.map(c => at(c)!).sort().at(-1)!
    out.push({ ...base, type: 'ci-failure', url: pr.url, pr: pr.url, when, checks: failed.map(c => c.name ?? c.context ?? 'check') })
  }
  return out
}

// reads GitHub with read-only gh commands; a missing or signed out gh gives an error and no items
export async function fetchGithub(ctx: ForgeContext, since: string, deadlineMs = DEADLINE_MS): Promise<{ items: GithubEvent[]; error?: string }> {
  try {
    const search = (flag: string, kind = 'prs') => gh<Found[]>(ctx, ['search', kind, flag, '--state=open', '--sort=updated', `--limit=${MAX_PRS}`, '--json', SEARCH_FIELDS])
    const [user, mine, asked, issues, notes] = await Promise.all([
      gh<Login>(ctx, ['api', 'user']),
      search('--author=@me'),
      // reviews asked of me, not of a team I belong to
      search('user-review-requested:@me'),
      search('--assignee=@me', 'issues'),
      gh<Notification[]>(ctx, ['api', `notifications?since=${encodeURIComponent(since)}`, '--paginate']),
    ])
    const me = user.login
    if (!me) throw new GhError('gh did not say who is signed in')
    const items: GithubEvent[] = []

    // a pull request not updated since the last reading has nothing new
    const prs = mine.slice(0, MAX_PRS).filter(pr => newer(pr.updatedAt, since))
    const deadline = Date.now() + deadlineMs
    let next = 0
    let unread = 0
    // a few views at a time; PRs not reached by the deadline count as unread
    const worker = async () => {
      while (next < prs.length) {
        const pr = prs[next++]
        if (Date.now() >= deadline) {
          unread++
          continue
        }
        try {
          const view = await gh<PrView>(ctx, ['pr', 'view', pr.url, '--json', 'comments,reviews,statusCheckRollup,headRefName'])
          items.push(...fromPr(me, pr, view, since))
        } catch {
          unread++
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, prs.length) }, worker))

    for (const pr of asked) {
      if (newer(pr.updatedAt, since)) items.push({ type: 'review-request', repo: repoOf(pr), number: pr.number, title: pr.title, url: pr.url, pr: pr.url, who: pr.author?.login, when: pr.updatedAt })
    }

    for (const i of issues) {
      if (newer(i.updatedAt, since)) items.push({ type: 'assigned', repo: repoOf(i), number: i.number, title: i.title, url: i.url, pr: i.url, who: i.author?.login, when: i.updatedAt })
    }

    for (const n of notes) {
      const page = pageUrl(n.subject.url)
      if ((n.reason === 'mention' || n.reason === 'team_mention') && page && newer(n.updated_at, since)) {
        items.push({ type: 'mention', repo: n.repository.full_name, number: page.number, title: n.subject.title, url: page.url, pr: page.url, when: n.updated_at })
      }
    }
    return unread ? { items, error: `${unread} pull request${unread === 1 ? '' : 's'} could not be read` } : { items }
  } catch (e) {
    return { items: [], error: errorMessage(e) }
  }
}
