// The decision qa-pilot publishes in its PR comment, between `<!-- qa-pilot:decision` and `-->`.

export type CheckStatus = 'pass' | 'fail' | 'warn'
export type DecisionKind = 'auto' | 'escalate' | 'blocked'

export interface Gate {
  id: string
  reason: string
}

export interface Finding {
  check: string
  kind: string
  message: string
  journey?: string
  file?: string
  severity?: string
  artifact?: string
}

export interface Decision {
  version: 1
  decision: DecisionKind
  sha: string
  gates: Gate[]
  diff: { files: number; added: number; removed: number }
  checks: Record<string, CheckStatus>
  findings: Finding[]
}

export interface WeekStats {
  total: number
  auto: number
  escalated: number
  blocked: number
}

export const LABELS = {
  auto: 'qa:auto',
  escalated: 'qa:needs-human',
  blocked: 'qa:blocked',
  approved: 'qa:approved',
} as const

const OPEN = '<!-- qa-pilot:decision'
const CLOSE = '-->'

const DECISIONS: readonly string[] = ['auto', 'escalate', 'blocked']
const STATUSES: readonly string[] = ['pass', 'fail', 'warn']
const OPTIONAL_FINDING_FIELDS = ['journey', 'file', 'severity', 'artifact'] as const

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const isString = (v: unknown): v is string => typeof v === 'string'
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

function isGate(v: unknown): v is Gate {
  return isObject(v) && isString(v.id) && isString(v.reason)
}

function isFinding(v: unknown): v is Finding {
  if (!isObject(v) || !isString(v.check) || !isString(v.kind) || !isString(v.message)) return false
  return OPTIONAL_FINDING_FIELDS.every((k) => v[k] === undefined || isString(v[k]))
}

function isDecision(v: unknown): v is Decision {
  if (!isObject(v)) return false
  if (v.version !== 1 || !isString(v.decision) || !DECISIONS.includes(v.decision) || !isString(v.sha)) return false
  if (!Array.isArray(v.gates) || !v.gates.every(isGate)) return false
  const diff = v.diff
  if (!isObject(diff) || !isCount(diff.files) || !isCount(diff.added) || !isCount(diff.removed)) return false
  if (!isObject(v.checks) || !Object.values(v.checks).every((s) => isString(s) && STATUSES.includes(s))) return false
  return Array.isArray(v.findings) && v.findings.every(isFinding)
}

/** The decision in a comment body, or null when the marker is missing or its JSON is unreadable. */
export function extractDecision(body: string): Decision | null {
  const start = body.indexOf(OPEN)
  if (start === -1) return null
  const from = start + OPEN.length
  const end = body.indexOf(CLOSE, from)
  if (end === -1) return null
  try {
    const parsed: unknown = JSON.parse(body.slice(from, end))
    return isDecision(parsed) ? parsed : null
  } catch {
    return null
  }
}

export interface PrComment {
  author?: { login: string } | null
  body: string
}

// qa-pilot publishes from its workflow; `gh` reports that author with or without the suffix
const PUBLISHERS: readonly string[] = ['github-actions[bot]', 'github-actions']

/** Anyone can write the marker in a comment, so only the workflow's own comments count. */
export function isPublisher(comment: PrComment): boolean {
  const login = comment.author?.login
  return typeof login === 'string' && PUBLISHERS.includes(login)
}

/** The newest readable decision qa-pilot published in a PR's comments (oldest first, as `gh` lists them). */
export function latestDecision(comments: readonly PrComment[]): Decision | null {
  for (let i = comments.length - 1; i >= 0; i--) {
    if (!isPublisher(comments[i])) continue
    const d = extractDecision(comments[i].body)
    if (d) return d
  }
  return null
}

/** Counts a week of PRs by qa-pilot label. */
export interface LabeledPr {
  number?: number
  labels?: readonly { name: string }[]
}

export function weekStats(prs: readonly LabeledPr[]): WeekStats {
  const stats: WeekStats = { total: prs.length, auto: 0, escalated: 0, blocked: 0 }
  for (const pr of prs) {
    const names = new Set((pr.labels ?? []).map((l) => l.name))
    if (names.has(LABELS.auto)) stats.auto++
    if (names.has(LABELS.escalated)) stats.escalated++
    if (names.has(LABELS.blocked)) stats.blocked++
  }
  return stats
}

/** A decision only stands for the commit it saw; once the head moves, approving it means nothing. */
export function isStale(decision: Decision, headSha: string): boolean {
  return decision.sha !== headSha
}
