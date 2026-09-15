import type { TaskReviewState } from '@forge-dev/core'

// commits that exist only on this machine: ahead of the upstream, or every task commit when there is none
export const unpushedCount = (s: TaskReviewState): number =>
  s.upstream ? (s.unpushed ?? 0) : (s.commits ?? 0)

const PR_STATE_LABEL = { OPEN: 'open', MERGED: 'merged', CLOSED: 'closed' } as const
const CHECKS_MARK = { passing: '✓', failing: '✗', pending: '…', none: '' } as const

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
