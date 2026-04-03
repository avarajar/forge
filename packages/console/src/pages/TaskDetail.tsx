import { type FunctionComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { Tabs, ActionButton, Badge, ForgeTerminal, showToast } from '@forge-dev/ui'
import type { CWSession } from '@forge-dev/core'

interface TaskDetailProps {
  session: CWSession
  onBack: () => void
  onDone: () => void
}

export const TaskDetail: FunctionComponent<TaskDetailProps> = ({ session, onBack, onDone }) => {
  const [activeTab, setActiveTab] = useState('status')
  const [gitLog, setGitLog] = useState<string>('')
  const [gitDiff, setGitDiff] = useState<string>('')
  const [gitStatus, setGitStatus] = useState<string>('')
  const [notes, setNotes] = useState<string>('')
  const [testOutput, setTestOutput] = useState<string | null>(null)
  const [runningTests, setRunningTests] = useState(false)

  const sessionDir = session.type === 'review' ? `review-pr-${session.pr}` : `task-${session.task}`

  const fetchGit = async () => {
    const [logRes, diffRes, statusRes] = await Promise.all([
      fetch(`/api/cw/git/log/${session.project}/${sessionDir}`),
      fetch(`/api/cw/git/diff/${session.project}/${sessionDir}`),
      fetch(`/api/cw/git/status/${session.project}/${sessionDir}`)
    ])
    setGitLog((await logRes.json() as { output: string }).output)
    setGitDiff((await diffRes.json() as { output: string }).output)
    setGitStatus((await statusRes.json() as { output: string }).output)
  }

  const fetchNotes = async () => {
    const res = await fetch(`/api/cw/notes/${session.project}/${sessionDir}`)
    setNotes((await res.json() as { content: string }).content)
  }

  useEffect(() => { fetchGit(); fetchNotes() }, [session])

  const resume = async () => {
    try {
      await fetch('/api/cw/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: session.type === 'review' ? 'review' : 'dev',
          project: session.project,
          task: session.type === 'review' ? session.pr : session.task
        })
      })
      showToast('Session resumed in terminal', 'success')
    } catch {
      showToast('Failed to resume', 'error')
    }
  }

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

  const taskName = session.type === 'review' ? `PR #${session.pr}` : session.task
  const typeLabel = session.type === 'review' ? 'REVIEW' : 'DEV'
  const typeColor = session.type === 'review' ? 'var(--forge-accent)' : 'var(--forge-warning)'

  const tabs = [
    { id: 'status', label: 'Status' },
    { id: 'diff', label: 'Diff' },
    { id: 'tests', label: 'Tests' },
    { id: 'notes', label: 'Notes' },
  ]

  return (
    <div>
      <button class="text-sm text-forge-muted hover:text-forge-text mb-4" onClick={onBack}>
        ← Back to tasks
      </button>

      {/* Header */}
      <div class="flex items-center justify-between mb-6">
        <div class="flex items-center gap-3">
          <Badge label={typeLabel} color={typeColor} />
          <h2 class="text-xl font-bold">{taskName}</h2>
          <span class="text-sm text-forge-muted">{session.project}</span>
        </div>
        <div class="flex gap-2">
          {session.status === 'active' && (
            <>
              <ActionButton label="▶ Resume" variant="primary" onClick={resume} />
              <ActionButton label="✓ Done" variant="secondary" onClick={markDone} />
            </>
          )}
        </div>
      </div>

      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {/* Status tab */}
      {activeTab === 'status' && (
        <div>
          <div class="grid grid-cols-3 gap-4 mb-6">
            <div class="p-3 rounded-lg bg-forge-surface border border-forge-border">
              <div class="text-xs text-forge-muted mb-1">Branch</div>
              <div class="text-sm font-medium truncate">{session.task ?? session.pr}</div>
            </div>
            <div class="p-3 rounded-lg bg-forge-surface border border-forge-border">
              <div class="text-xs text-forge-muted mb-1">Sessions</div>
              <div class="text-sm font-medium">{session.opens} open{session.opens !== 1 ? 's' : ''}</div>
            </div>
            <div class="p-3 rounded-lg bg-forge-surface border border-forge-border">
              <div class="text-xs text-forge-muted mb-1">Status</div>
              <div class="text-sm font-medium">{session.status}</div>
            </div>
          </div>

          {gitStatus && (
            <div>
              <div class="text-xs text-forge-muted uppercase mb-2">Changed files</div>
              <pre class="p-3 rounded-lg bg-forge-surface border border-forge-border text-xs font-mono whitespace-pre-wrap">{gitStatus}</pre>
            </div>
          )}

          {gitLog && (
            <div class="mt-4">
              <div class="text-xs text-forge-muted uppercase mb-2">Recent commits</div>
              <pre class="p-3 rounded-lg bg-forge-surface border border-forge-border text-xs font-mono whitespace-pre-wrap">{gitLog}</pre>
            </div>
          )}
        </div>
      )}

      {/* Diff tab */}
      {activeTab === 'diff' && (
        <div>
          {gitDiff ? (
            <pre class="p-3 rounded-lg bg-forge-surface border border-forge-border text-xs font-mono whitespace-pre-wrap overflow-auto max-h-[600px]">{gitDiff}</pre>
          ) : (
            <div class="text-forge-muted text-sm py-8 text-center">No diff available</div>
          )}
        </div>
      )}

      {/* Tests tab */}
      {activeTab === 'tests' && (
        <div>
          <ActionButton
            label={runningTests ? 'Running...' : 'Run Tests'}
            variant="primary"
            loading={runningTests}
            onClick={async () => {
              setRunningTests(true)
              try {
                const res = await fetch(`/api/cw/git/status/${session.project}/${sessionDir}`)
                setTestOutput('Tests would run in worktree: ' + session.worktree)
              } catch {
                setTestOutput('Failed to run tests')
              } finally {
                setRunningTests(false)
              }
            }}
          />
          {testOutput && (
            <div class="mt-4">
              <ForgeTerminal content={testOutput} height={300} />
            </div>
          )}
        </div>
      )}

      {/* Notes tab */}
      {activeTab === 'notes' && (
        <div>
          {notes ? (
            <pre class="p-4 rounded-lg bg-forge-surface border border-forge-border text-sm font-mono whitespace-pre-wrap overflow-auto max-h-[600px]">{notes}</pre>
          ) : (
            <div class="text-forge-muted text-sm py-8 text-center">No notes for this task</div>
          )}
        </div>
      )}
    </div>
  )
}
