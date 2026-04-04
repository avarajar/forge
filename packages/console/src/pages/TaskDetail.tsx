import { type FunctionComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { ActionButton, ForgeTerminal, showToast } from '@forge-dev/ui'
import type { CWSession } from '@forge-dev/core'
import { TYPE_STYLES } from '../config/types.js'

/* ── Types ── */

interface ToolsMcp { name: string; type: string; source: string; url?: string }
interface ToolsPlugin { name: string; enabled: boolean; hasMcp: boolean; mcpName?: string; mcpType?: string; marketplace: string }
interface ToolsInfo { mcps: ToolsMcp[]; plugins: ToolsPlugin[] }

interface TaskDetailProps {
  session: CWSession
  onClose: () => void
  onDone: () => void
}

/* ── Component ── */

export const TaskDetail: FunctionComponent<TaskDetailProps> = ({ session, onClose, onDone }) => {
  const [gitLog, setGitLog] = useState<string>('')
  const [gitStatus, setGitStatus] = useState<string>('')
  const [notes, setNotes] = useState<string>('')
  const [branch, setBranch] = useState<string>('')
  const [ptyExited, setPtyExited] = useState(false)
  const [connected, setConnected] = useState(false)
  const [wsKey, setWsKey] = useState(0)
  const [tools, setTools] = useState<ToolsInfo | null>(null)

  const sessionDir = session.type === 'review' ? `review-pr-${session.pr}` : `task-${session.task}`
  const typeCfg = TYPE_STYLES[session.type] ?? TYPE_STYLES.task

  const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsUrl = `${wsProto}//${window.location.host}/ws/terminal/${session.project}/${sessionDir}?k=${wsKey}`

  const fetchData = async () => {
    const [logRes, statusRes, notesRes, toolsRes] = await Promise.all([
      fetch(`/api/cw/git/log/${session.project}/${sessionDir}`).catch(() => null),
      fetch(`/api/cw/git/status/${session.project}/${sessionDir}`).catch(() => null),
      fetch(`/api/cw/notes/${session.project}/${sessionDir}`).catch(() => null),
      fetch(`/api/cw/tools?project=${session.project}`).catch(() => null),
    ])
    if (logRes) setGitLog((await logRes.json() as { output: string }).output)
    if (statusRes) setGitStatus((await statusRes.json() as { output: string }).output)
    if (notesRes) setNotes((await notesRes.json() as { content: string }).content)
    if (toolsRes) setTools(await toolsRes.json() as ToolsInfo)
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

  const mcpList = tools?.mcps ?? []
  const pluginList = tools?.plugins ?? []
  const hasTools = mcpList.length > 0 || pluginList.length > 0

  return (
    <div class="flex flex-col h-full">
      {/* ── Status bar ── */}
      <div class="shrink-0" style={{ backgroundColor: 'var(--forge-surface)', borderBottom: '1px solid var(--forge-ghost-border)' }}>
        {/* Row 1: type + stats + actions */}
        <div class="flex items-center gap-3 px-4 py-2">
          {/* Connection dot */}
          <span
            class={`w-2 h-2 rounded-full shrink-0${connected ? ' animate-pulse' : ''}`}
            style={{ backgroundColor: connected ? 'var(--forge-success)' : 'var(--forge-muted)' }}
            title={connected ? 'Connected' : 'Disconnected'}
          />

          {/* Type badge */}
          <span
            class="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider shrink-0"
            style={{ backgroundColor: typeCfg.bg, color: typeCfg.color, border: `1px solid ${typeCfg.border}` }}
          >
            {typeCfg.label}
          </span>

          {/* Branch */}
          {branch && (
            <span
              class="text-[11px] font-mono px-1.5 py-0.5 rounded shrink-0 truncate max-w-[180px]"
              style={{ backgroundColor: 'var(--forge-ghost-bg)', color: 'var(--forge-muted)' }}
            >
              {branch}
            </span>
          )}

          {/* Separator */}
          <span class="w-px h-3 shrink-0" style={{ backgroundColor: 'var(--forge-ghost-border)' }} />

          {/* Stats */}
          <div class="flex items-center gap-2.5 text-[11px] text-forge-muted">
            <span>{filesChanged} file{filesChanged !== 1 ? 's' : ''}</span>
            <span style={{ opacity: 0.3 }}>&middot;</span>
            <span>{commitCount} commit{commitCount !== 1 ? 's' : ''}</span>
            <span style={{ opacity: 0.3 }}>&middot;</span>
            <span>{session.opens} session{session.opens !== 1 ? 's' : ''}</span>
            {notes && (
              <>
                <span style={{ opacity: 0.3 }}>&middot;</span>
                <span style={{ color: 'var(--forge-accent)' }}>has notes</span>
              </>
            )}
          </div>

          <span class="flex-1" />

          {/* Actions */}
          <div class="flex items-center gap-2 shrink-0">
            {ptyExited && (
              <ActionButton label="Restart" variant="secondary" onClick={handleRestart} />
            )}
            {session.status === 'active' && (
              <ActionButton label="Done" variant="secondary" onClick={markDone} />
            )}
          </div>
        </div>

        {/* Row 2: MCPs + Plugins */}
        {hasTools && (
          <div class="flex items-center gap-1.5 px-4 pb-2 flex-wrap" style={{ marginTop: '-2px' }}>
            {mcpList.length > 0 && (
              <>
                <span class="text-[9px] font-bold uppercase tracking-widest text-forge-muted mr-0.5" style={{ opacity: 0.45 }}>MCP</span>
                {mcpList.map(m => (
                  <span
                    key={m.name}
                    class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
                    style={{
                      backgroundColor: m.source === 'project' ? 'rgba(217,119,6,0.08)' : 'rgba(99,102,241,0.08)',
                      color: m.source === 'project' ? 'rgba(217,170,100,0.85)' : 'rgba(147,151,255,0.85)',
                      border: `1px solid ${m.source === 'project' ? 'rgba(217,119,6,0.15)' : 'rgba(99,102,241,0.15)'}`,
                    }}
                    title={`${m.name} (${m.type} · ${m.source})`}
                  >
                    <span class="w-1 h-1 rounded-full shrink-0" style={{
                      backgroundColor: m.type === 'sse' || m.type === 'url' ? '#10b981' : '#6366f1'
                    }} />
                    {m.name}
                  </span>
                ))}
              </>
            )}
            {mcpList.length > 0 && pluginList.length > 0 && (
              <span class="w-px h-3 mx-0.5" style={{ backgroundColor: 'var(--forge-ghost-border)' }} />
            )}
            {pluginList.length > 0 && (
              <>
                <span class="text-[9px] font-bold uppercase tracking-widest text-forge-muted mr-0.5" style={{ opacity: 0.45 }}>Plugins</span>
                {pluginList.map(p => (
                  <span
                    key={p.name}
                    class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
                    style={{
                      backgroundColor: p.enabled ? 'rgba(16,185,129,0.08)' : 'rgba(107,114,128,0.08)',
                      color: p.enabled ? 'rgba(52,211,153,0.85)' : 'rgba(107,114,128,0.6)',
                      border: `1px solid ${p.enabled ? 'rgba(16,185,129,0.15)' : 'rgba(107,114,128,0.15)'}`,
                    }}
                    title={`${p.name}${p.hasMcp ? ` (MCP: ${p.mcpName}, ${p.mcpType})` : ''} · ${p.enabled ? 'enabled' : 'disabled'} · ${p.marketplace}`}
                  >
                    <span class="w-1 h-1 rounded-full shrink-0" style={{
                      backgroundColor: p.enabled ? (p.hasMcp ? '#10b981' : '#6366f1') : '#6b7280'
                    }} />
                    {p.name}
                    {p.hasMcp && (
                      <span class="text-[8px] opacity-50">mcp</span>
                    )}
                  </span>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Terminal ── */}
      <div class="relative" style={{ flex: '1 1 0', minHeight: 0 }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <ForgeTerminal
            wsUrl={wsUrl}
            onExit={() => setPtyExited(true)}
            onConnectionChange={(c) => setConnected(c)}
          />
        </div>
        {!connected && !ptyExited && (
          <div class="absolute inset-0 flex items-center justify-center bg-black/50 pointer-events-none">
            <span class="text-sm text-white/70">Connecting...</span>
          </div>
        )}
      </div>
    </div>
  )
}
