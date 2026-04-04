import { type FunctionComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { ActionButton, Badge, ForgeTerminal, SplitPane, AccordionSection, showToast } from '@forge-dev/ui'
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
  const [stack, setStack] = useState<Record<string, unknown> | null>(null)
  const [mcps, setMcps] = useState<{ global: Record<string, unknown>; project: string[]; cw: string[]; plugins: string[] } | null>(null)
  const [ptyExited, setPtyExited] = useState(false)
  const [connected, setConnected] = useState(false)
  const [wsKey, setWsKey] = useState(0) // increment to force reconnect

  const sessionDir = session.type === 'review' ? `review-pr-${session.pr}` : `task-${session.task}`
  const taskName = session.type === 'review' ? `PR #${session.pr}` : session.task
  const typeLabel = session.type === 'review' ? 'REVIEW' : 'DEV'
  const typeColor = session.type === 'review' ? 'var(--forge-accent)' : 'var(--forge-warning)'

  const wsUrl = `ws://${window.location.host}/ws/terminal/${session.project}/${sessionDir}?k=${wsKey}`

  const fetchSidebarData = async () => {
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

  const fetchTools = async () => {
    try {
      const [stackRes, mcpsRes] = await Promise.all([
        fetch(`/api/cw/detect/${session.project}`),
        fetch(`/api/cw/mcps?project=${session.project}`)
      ])
      setStack(await stackRes.json() as Record<string, unknown>)
      setMcps(await mcpsRes.json() as { global: Record<string, unknown>; project: string[]; cw: string[]; plugins: string[] })
    } catch {}
  }

  useEffect(() => {
    fetchSidebarData()
    fetchTools()
  }, [session])

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

  /* ---- Sidebar content ---- */
  const sidebar = (
    <div class="h-full bg-forge-bg">
      {/* Quick stats */}
      <div class="px-3 py-3 border-b" style={{ borderColor: 'var(--forge-ghost-border)' }}>
        <div class="text-xs text-forge-muted mb-1">
          {session.opens} session{session.opens !== 1 ? 's' : ''}
        </div>
        {gitStatus && (
          <div class="text-xs text-forge-muted">
            {gitStatus.split('\n').filter(Boolean).length} file{gitStatus.split('\n').filter(Boolean).length !== 1 ? 's' : ''} changed
          </div>
        )}
      </div>

      <AccordionSection title="Status" defaultOpen={true}>
        {gitStatus ? (
          <pre class="text-[11px] font-mono text-forge-text whitespace-pre-wrap break-all">{gitStatus}</pre>
        ) : (
          <span class="text-xs text-forge-muted">Clean</span>
        )}
        {gitLog && (
          <div class="mt-3">
            <div class="text-[10px] text-forge-muted uppercase mb-1">Commits</div>
            <pre class="text-[11px] font-mono text-forge-text whitespace-pre-wrap break-all">{gitLog}</pre>
          </div>
        )}
      </AccordionSection>

      <AccordionSection title="Diff">
        {gitDiff ? (
          <pre class="text-[11px] font-mono text-forge-text whitespace-pre-wrap break-all max-h-[300px] overflow-auto">{gitDiff}</pre>
        ) : (
          <span class="text-xs text-forge-muted">No diff</span>
        )}
      </AccordionSection>

      <AccordionSection title="Notes">
        {notes ? (
          <pre class="text-[11px] font-mono text-forge-text whitespace-pre-wrap break-all max-h-[400px] overflow-auto">{notes}</pre>
        ) : (
          <span class="text-xs text-forge-muted">No notes</span>
        )}
      </AccordionSection>

      <AccordionSection title="Tools">
        <div class="space-y-2">
          {stack && (
            <div class="flex flex-wrap gap-1">
              {stack.framework && (
                <span class="px-2 py-0.5 rounded text-[10px] font-medium" style={{ backgroundColor: 'rgba(99,102,241,0.1)', color: 'var(--forge-accent)', border: '1px solid rgba(99,102,241,0.2)' }}>
                  {String(stack.framework)}
                </span>
              )}
              {stack.testRunner && (
                <span class="px-2 py-0.5 rounded text-[10px] font-medium" style={{ backgroundColor: 'rgba(16,185,129,0.1)', color: 'var(--forge-success)', border: '1px solid rgba(16,185,129,0.2)' }}>
                  {String(stack.testRunner)}
                </span>
              )}
              {stack.hasTailwind && (
                <span class="px-2 py-0.5 rounded text-[10px] font-medium" style={{ backgroundColor: 'rgba(56,189,248,0.1)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.2)' }}>
                  Tailwind
                </span>
              )}
              {stack.hasPlaywright && (
                <span class="px-2 py-0.5 rounded text-[10px] font-medium" style={{ backgroundColor: 'rgba(16,185,129,0.1)', color: 'var(--forge-success)', border: '1px solid rgba(16,185,129,0.2)' }}>
                  Playwright
                </span>
              )}
              {stack.hasDockerfile && (
                <span class="px-2 py-0.5 rounded text-[10px] font-medium" style={{ backgroundColor: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.2)' }}>
                  Docker
                </span>
              )}
            </div>
          )}
          {mcps && (
            <div class="text-[11px] text-forge-muted">
              {[...Object.keys(mcps.global), ...mcps.project, ...mcps.cw].join(', ') || 'No MCPs'}
            </div>
          )}
        </div>
      </AccordionSection>
    </div>
  )

  /* ---- Terminal content ---- */
  const terminal = (
    <div class="h-full relative">
      <ForgeTerminal
        wsUrl={wsUrl}
        onExit={(code) => setPtyExited(true)}
        onConnectionChange={(c) => setConnected(c)}
      />
      {/* Connecting overlay */}
      {!connected && !ptyExited && (
        <div class="absolute inset-0 flex items-center justify-center bg-black/50 pointer-events-none">
          <span class="text-sm text-white/70">Connecting...</span>
        </div>
      )}
    </div>
  )

  return (
    <div class="flex flex-col h-full">
      {/* ---- Header ---- */}
      <div class="flex items-center justify-between px-4 py-3 border-b shrink-0" style={{ borderColor: 'var(--forge-ghost-border)' }}>
        <div class="flex items-center gap-3">
          <button
            class="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors text-forge-muted hover:text-forge-text"
            style={{ backgroundColor: 'var(--forge-ghost-bg)', borderColor: 'var(--forge-ghost-border)' }}
            onClick={onBack}
          >
            ←
          </button>
          <Badge label={typeLabel} color={typeColor} />
          <span class="text-base font-bold text-forge-text">{taskName}</span>
          <span class="text-sm text-forge-muted">{session.project}</span>
          {branch && (
            <span class="text-xs font-mono text-forge-muted px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--forge-ghost-bg)' }}>
              {branch}
            </span>
          )}
        </div>
        <div class="flex items-center gap-2">
          {/* Connection indicator */}
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

      {/* ---- Split layout ---- */}
      <div class="flex-1 min-h-0">
        <SplitPane
          left={sidebar}
          right={terminal}
          defaultWidth={300}
          minWidth={200}
          maxWidth={500}
          storageKey="forge-task-sidebar-width"
        />
      </div>
    </div>
  )
}
