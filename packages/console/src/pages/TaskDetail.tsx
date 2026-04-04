import { type FunctionComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { ActionButton, Badge, ForgeTerminal, showToast } from '@forge-dev/ui'
import type { CWSession } from '@forge-dev/core'

interface TaskDetailProps {
  session: CWSession
  onBack: () => void
  onDone: () => void
}

export const TaskDetail: FunctionComponent<TaskDetailProps> = ({ session, onBack, onDone }) => {
  const [gitLog, setGitLog] = useState<string>('')
  const [gitDiff, setGitDiff] = useState<string>('')
  const [gitStatus, setGitStatus] = useState<string>('')
  const [notes, setNotes] = useState<string>('')
  const [branch, setBranch] = useState<string>('')
  const [ptyExited, setPtyExited] = useState(false)
  const [connected, setConnected] = useState(false)
  const [wsKey, setWsKey] = useState(0)
  const [infoExpanded, setInfoExpanded] = useState(false)

  const sessionDir = session.type === 'review' ? `review-pr-${session.pr}` : `task-${session.task}`
  const taskName = session.type === 'review' ? `PR #${session.pr}` : session.task
  const typeLabel = session.type === 'review' ? 'REVIEW' : 'DEV'
  const typeColor = session.type === 'review' ? 'var(--forge-accent)' : 'var(--forge-warning)'

  const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsUrl = `${wsProto}//${window.location.host}/ws/terminal/${session.project}/${sessionDir}?k=${wsKey}`

  const fetchData = async () => {
    const [logRes, diffRes, statusRes, notesRes] = await Promise.all([
      fetch(`/api/cw/git/log/${session.project}/${sessionDir}`).catch(() => null),
      fetch(`/api/cw/git/diff/${session.project}/${sessionDir}`).catch(() => null),
      fetch(`/api/cw/git/status/${session.project}/${sessionDir}`).catch(() => null),
      fetch(`/api/cw/notes/${session.project}/${sessionDir}`).catch(() => null)
    ])
    if (logRes) setGitLog((await logRes.json() as { output: string }).output)
    if (diffRes) setGitDiff((await diffRes.json() as { output: string }).output)
    if (statusRes) setGitStatus((await statusRes.json() as { output: string }).output)
    if (notesRes) setNotes((await notesRes.json() as { content: string }).content)
    setBranch(session.task ?? session.pr ?? '')
  }

  useEffect(() => { fetchData() }, [session])

  const markDone = async () => {
    try {
      await fetch('/api/cw/done', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: session.project,
          task: session.type === 'review' ? session.pr : session.task,
          type: session.type
        })
      })
      showToast('Task closed', 'info')
      onDone()
    } catch {
      showToast('Failed to close task', 'error')
    }
  }

  const handleRestart = () => {
    setPtyExited(false)
    setWsKey(k => k + 1)
  }

  const filesChanged = gitStatus ? gitStatus.split('\n').filter(Boolean).length : 0
  const commitCount = gitLog ? gitLog.split('\n').filter(Boolean).length : 0

  return (
    <div class="flex flex-col h-full">
      {/* ---- Header ---- */}
      <div class="flex items-center justify-between px-4 py-2.5 border-b shrink-0" style={{ borderColor: 'var(--forge-ghost-border)' }}>
        <div class="flex items-center gap-3">
          <button
            class="inline-flex items-center px-2 py-1 text-xs font-medium rounded-lg border transition-colors text-forge-muted hover:text-forge-text"
            style={{ backgroundColor: 'var(--forge-ghost-bg)', borderColor: 'var(--forge-ghost-border)' }}
            onClick={onBack}
          >
            ←
          </button>
          <Badge label={typeLabel} color={typeColor} />
          <span class="text-sm font-bold text-forge-text">{taskName}</span>
          <span class="text-xs text-forge-muted">{session.project}</span>
          {branch && (
            <span class="text-[11px] font-mono text-forge-muted px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--forge-ghost-bg)' }}>
              {branch}
            </span>
          )}
        </div>
        <div class="flex items-center gap-2">
          <span
            class="w-2 h-2 rounded-full"
            style={{ backgroundColor: connected ? 'var(--forge-success)' : 'var(--forge-muted)' }}
            title={connected ? 'Connected' : 'Disconnected'}
          />
          {ptyExited && (
            <ActionButton label="Restart" variant="secondary" onClick={handleRestart} />
          )}
          {session.status === 'active' && (
            <ActionButton label="Done" variant="secondary" onClick={markDone} />
          )}
        </div>
      </div>

      {/* ---- Info bar (collapsible) ---- */}
      <div class="shrink-0 border-b" style={{ borderColor: 'var(--forge-ghost-border)' }}>
        {/* Summary row — always visible */}
        <button
          class="flex items-center gap-4 w-full px-4 py-2 text-left hover:bg-forge-surface/50 transition-colors"
          onClick={() => setInfoExpanded(!infoExpanded)}
        >
          <span class="text-[11px] text-forge-muted">
            {filesChanged} file{filesChanged !== 1 ? 's' : ''} changed
          </span>
          <span class="text-[11px] text-forge-muted">
            {commitCount} commit{commitCount !== 1 ? 's' : ''}
          </span>
          <span class="text-[11px] text-forge-muted">
            {session.opens} session{session.opens !== 1 ? 's' : ''}
          </span>
          {notes && (
            <span class="text-[11px] text-forge-accent">has notes</span>
          )}
          <span class="flex-1" />
          <span
            class="text-[10px] text-forge-muted transition-transform"
            style={{ transform: infoExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
          >
            ▼
          </span>
        </button>

        {/* Expanded detail panels */}
        {infoExpanded && (
          <div class="px-4 pb-3 grid grid-cols-2 gap-3 max-h-[280px] overflow-auto" style={{ borderTop: '1px solid var(--forge-ghost-border)' }}>
            {/* Status */}
            <div>
              <div class="text-[10px] text-forge-muted uppercase tracking-wider mb-1">Changed files</div>
              {gitStatus ? (
                <pre class="text-[11px] font-mono text-forge-text whitespace-pre-wrap break-all">{gitStatus}</pre>
              ) : (
                <span class="text-[11px] text-forge-muted">Clean</span>
              )}
            </div>

            {/* Commits */}
            <div>
              <div class="text-[10px] text-forge-muted uppercase tracking-wider mb-1">Commits</div>
              {gitLog ? (
                <pre class="text-[11px] font-mono text-forge-text whitespace-pre-wrap break-all">{gitLog}</pre>
              ) : (
                <span class="text-[11px] text-forge-muted">No commits</span>
              )}
            </div>

            {/* Diff */}
            <div>
              <div class="text-[10px] text-forge-muted uppercase tracking-wider mb-1">Diff</div>
              {gitDiff ? (
                <pre class="text-[11px] font-mono text-forge-text whitespace-pre-wrap break-all max-h-[180px] overflow-auto">{gitDiff}</pre>
              ) : (
                <span class="text-[11px] text-forge-muted">No diff</span>
              )}
            </div>

            {/* Notes */}
            <div>
              <div class="text-[10px] text-forge-muted uppercase tracking-wider mb-1">Notes</div>
              {notes ? (
                <pre class="text-[11px] font-mono text-forge-text whitespace-pre-wrap break-all max-h-[180px] overflow-auto">{notes}</pre>
              ) : (
                <span class="text-[11px] text-forge-muted">No notes</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ---- Terminal (full width, fills remaining height) ---- */}
      <div class="relative" style={{ flex: '1 1 0', minHeight: 0, overflow: 'hidden' }}>
        <ForgeTerminal
          wsUrl={wsUrl}
          onExit={() => setPtyExited(true)}
          onConnectionChange={(c) => setConnected(c)}
        />
        {!connected && !ptyExited && (
          <div class="absolute inset-0 flex items-center justify-center bg-black/50 pointer-events-none">
            <span class="text-sm text-white/70">Connecting...</span>
          </div>
        )}
      </div>
    </div>
  )
}
