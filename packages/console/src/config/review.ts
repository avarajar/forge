import type { TaskReviewState } from '@forge-dev/core'

// commits that exist only on this machine: the server's count when it knows one, or every task commit
export const unpushedCount = (s: TaskReviewState): number =>
  s.unpushed ?? s.commits ?? 0

const PR_STATE_LABEL = { OPEN: 'open', MERGED: 'merged', CLOSED: 'closed' } as const
const CHECKS_MARK = { passing: '✓', failing: '✗', pending: '…', none: '' } as const

// the full change line shown in the task detail
export function reviewSummary(s: TaskReviewState): string {
  if (s.workspace === 'missing') return 'Workspace not created yet'
  if (s.closeWarnings.includes('state-unknown') && s.branch === null) return 'Changes unknown'

  const parts: string[] = []
  if (s.diff && s.diff.files > 0) {
    parts.push(`+${s.diff.insertions} −${s.diff.deletions} · ${s.diff.files} file${s.diff.files === 1 ? '' : 's'}`)
  }
  if (s.uncommitted > 0) parts.push(`${s.uncommitted} uncommitted`)
  const unpushed = unpushedCount(s)
  if (unpushed > 0) parts.push(`${unpushed} unpushed`)
  if (s.pr.status === 'found') {
    const stateLabel = s.pr.state === 'OPEN' && s.pr.isDraft ? 'draft' : PR_STATE_LABEL[s.pr.state]
    parts.push(`PR #${s.pr.number} ${stateLabel}`)
    if (s.pr.checks !== 'none') parts.push(`checks ${CHECKS_MARK[s.pr.checks]}`)
    if (s.pr.review === 'APPROVED') parts.push('approved')
    if (s.pr.review === 'CHANGES_REQUESTED') parts.push('changes requested')
  }

  if (parts.length > 0) return parts.join(' · ')
  return s.workspace === 'ready' ? 'No changes yet' : ''
}

const CHECKS_TEXT = { passing: 'checks pass', failing: 'checks failing', pending: 'checks running', none: '' } as const

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

// one short line for a task row
export function rowStatus(s: TaskReviewState): string {
  if (s.workspace === 'missing') return 'not created yet'
  if (s.pr.status === 'found') {
    const stateLabel = s.pr.state === 'OPEN' && s.pr.isDraft ? 'draft' : PR_STATE_LABEL[s.pr.state]
    return [`PR #${s.pr.number} ${stateLabel}`, CHECKS_TEXT[s.pr.checks]].filter(Boolean).join(' · ')
  }
  const parts: string[] = []
  if (s.diff && s.diff.files > 0) parts.push(plural(s.diff.files, 'file'))
  if (s.commits) parts.push(plural(s.commits, 'commit'))
  const unpushed = unpushedCount(s)
  if (unpushed > 0 && s.commits) parts.push(`${unpushed} unpushed`)
  if (s.uncommitted > 0) parts.push(`${s.uncommitted} uncommitted`)
  return parts.length > 0 ? parts.join(' · ') : 'no changes yet'
}
