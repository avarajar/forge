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
  // base de las imágenes que qa-pilot subió a la rama qa-pilot/evidence: <evidence><ruta>
  evidence?: string
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
  // el bloque real es el último: uno anterior puede venir de texto que controla el PR
  const start = body.lastIndexOf(OPEN)
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

/** A file on the evidence branch, read with `gh` (the repo can be private, so no plain <img> to github.com). */
export interface EvidenceFile {
  ref: string
  path: string
}

export interface VisualChange {
  name: string
  journey?: string
  ai?: string
  summary?: string
  before?: EvidenceFile
  after?: EvidenceFile
  diff?: EvidenceFile
}

// lo que publica qa-pilot: https://github.com/<dueño>/<repo>/raw/<commit>/pr-<n>/<sha corto>/
const EVIDENCE = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/raw\/([0-9a-f]{40})\/(pr-\d+\/[0-9a-f]{7}\/)$/
const IMAGE_PATH = /^artifacts\/[A-Za-z0-9._-]+\.png$/

function summaryOf(img: Record<string, unknown>): string | undefined {
  const c = img.change
  if (!isObject(c) || !isCount(c.pixels) || !isCount(c.percent) || !isString(c.zone)) return undefined
  const amount = `${c.percent < 0.1 ? 'menos de 0,1 %' : `${String(c.percent).replace('.', ',')} %`} de la captura`
  const elements = Array.isArray(img.elements) && img.elements.every(isString) && img.elements.length ? `${img.elements.join(', ')} · ` : ''
  return `${elements}${amount} · ${c.zone}`
}

/** The snapshots that changed, with what changed and where to fetch Before, After (zone marked) and the diff. */
export function visualChanges(decision: Decision): VisualChange[] {
  const m = EVIDENCE.exec(decision.evidence ?? '')
  if (!m) return []
  const [, ref, prefix] = m as unknown as [string, string, string]
  const file = (p: unknown): EvidenceFile | undefined => (isString(p) && IMAGE_PATH.test(p) ? { ref, path: prefix + p } : undefined)
  const out: VisualChange[] = []
  for (const f of decision.findings as Array<Finding & { images?: unknown }>) {
    if (!Array.isArray(f.images)) continue
    for (const img of f.images) {
      if (!isObject(img) || !isString(img.name)) continue
      const v: VisualChange = { name: img.name }
      if (f.journey) v.journey = f.journey
      if (isString(img.ai) && img.ai) v.ai = img.ai.slice(0, 200)
      const summary = summaryOf(img)
      if (summary) v.summary = summary
      const before = file(img.expected)
      const after = file(img.marked) ?? file(img.actual)
      const diff = file(img.diff)
      if (before) v.before = before
      if (after) v.after = after
      if (diff) v.diff = diff
      if (before || after || diff) out.push(v)
    }
  }
  return out
}
