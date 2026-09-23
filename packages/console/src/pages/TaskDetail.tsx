import { type FunctionComponent, type ComponentChildren } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { ActionButton, ForgeTerminal, showToast } from '@forge-dev/ui'
import type { CWSession } from '@forge-dev/core'
import { getTypeStyle, harnessLabel, projectOf, sessionDirOf, sessionKey, sessionLabel, soft } from '../config/types.js'
import { reviewSummary, unpushedCount } from '../config/review.js'
import { EditorButton, GitHubButton, secondaryButton, secondaryClass } from '../components/TaskLinks.js'
import { useTaskReview } from '../hooks/useTaskReview.js'
import { stackParts, useProjectStack } from '../hooks/useProjectStack.js'
import { recordOutput, metricsFor, formatCost, formatTokens } from '../hooks/useTerminalMetrics.js'
import { theme } from '../shell.js'

interface ToolsMcp { name: string; type: string; source: string; url?: string }
interface ToolsPlugin { name: string; enabled: boolean; hasMcp: boolean; mcpName?: string; mcpType?: string; marketplace: string }
interface ToolsInfo { mcps: ToolsMcp[]; plugins: ToolsPlugin[] }

interface TaskDetailProps {
  session: CWSession
  active: boolean
  onDone: () => void | Promise<void>
}

// the second stop of each type's avatar gradient
const AVATAR_PAIR: Record<string, string> = { '--orange': '--red', '--blue': '--purple', '--purple': '--blue', '--green': '--teal' }

const Metric: FunctionComponent<{ label: string; index: number; color?: string; bar?: number | null; title?: string; children: ComponentChildren }> = ({ label, index, color = 'var(--ink)', bar, title, children }) => (
  <div
    class="min-w-0"
    title={title}
    style={{ padding: '10px 12px', borderRadius: '13px', background: 'var(--card)', border: '1px solid var(--hair)', boxShadow: 'var(--shadow-s)', animation: `riseIn .34s var(--ease) ${index * 60}ms both` }}
  >
    <div style={{ fontSize: '11.5px', color: 'var(--ink-2)' }}>{label}</div>
    <div class="mono truncate" style={{ fontSize: '19px', fontWeight: 650, color, marginTop: '2px' }}>{children}</div>
    {bar !== undefined && (
      <div style={{ height: '5px', borderRadius: '99px', background: 'var(--elev)', marginTop: '7px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${bar ?? 0}%`, borderRadius: '99px', background: 'linear-gradient(90deg, var(--blue), var(--purple))', transition: 'width .6s var(--ease)' }} />
      </div>
    )}
  </div>
)

const ChipCard: FunctionComponent<{ title: string; items: Array<{ name: string; title?: string; muted?: boolean }>; tone: string | null; empty: string }> = ({ title, items, tone, empty }) => (
  <div style={{ padding: '11px 13px', borderRadius: '13px', background: 'var(--card)', border: '1px solid var(--hair)', boxShadow: 'var(--shadow-s)' }}>
    <div style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--ink-2)', marginBottom: '5px' }}>{title}</div>
    <div class="flex flex-wrap" style={{ gap: '5px' }}>
      {items.length === 0 && <span style={{ fontSize: '12px', color: 'var(--ink-3)' }}>{empty}</span>}
      {items.map(i => (
        <span
          key={i.name}
          title={i.title}
          style={{
            padding: '2px 8px', borderRadius: '99px', fontSize: '11px', fontWeight: 500,
            background: tone && !i.muted ? soft(tone) : 'var(--elev)',
            color: tone && !i.muted ? `var(${tone})` : 'var(--ink-2)',
            opacity: i.muted ? 0.6 : 1,
          }}
        >{i.name}</span>
      ))}
    </div>
  </div>
)

export const TaskDetail: FunctionComponent<TaskDetailProps> = ({ session, active, onDone }) => {
  const [branch, setBranch] = useState<string>('')
  const [ptyExited, setPtyExited] = useState(false)
  const [connected, setConnected] = useState(false)
  const [wsKey, setWsKey] = useState(0)
  const [tools, setTools] = useState<ToolsInfo | null>(null)
  const [contextOpen, setContextOpen] = useState(false)

  const key = sessionKey(session)
  const sessionDir = sessionDirOf(session)
  const reviewed = session.type === 'task' || session.type === 'review'
  const review = useTaskReview(session, { poll: active && session.type === 'task' })
  const style = getTypeStyle(session.type)
  const isLogin = session.type === 'login'
  const stack = stackParts(useProjectStack(isLogin ? '' : projectOf(session)))
  const metrics = metricsFor(key).value

  // Branch-style task names become sessionDirs like `task-task/form-header`; encode so the slash stays in one segment
  const projectEnc = encodeURIComponent(session.project)
  const sessionDirEnc = encodeURIComponent(sessionDir)

  const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsUrl = `${wsProto}//${window.location.host}/ws/terminal/${projectEnc}/${sessionDirEnc}?k=${wsKey}`

  useEffect(() => {
    if (isLogin) return
    let cancelled = false
    Promise.all([
      fetch(`/api/cw/tools?project=${projectEnc}`).then(r => r.json() as Promise<ToolsInfo>).catch(() => null),
      fetch(`/api/cw/git/branch/${projectEnc}/${sessionDirEnc}`).then(r => r.json() as Promise<{ branch: string }>).catch(() => null),
    ]).then(([toolsInfo, branchInfo]) => {
      if (cancelled) return
      if (toolsInfo) setTools(toolsInfo)
      setBranch(branchInfo?.branch || session.task || session.pr || '')
    })
    return () => { cancelled = true }
  }, [key])

  const handleRestart = () => {
    setPtyExited(false)
    setWsKey(k => k + 1)
  }

  const mcpList = tools?.mcps ?? []
  const pluginList = tools?.plugins ?? []
  const state = review?.state ?? null
  const shownBranch = state?.branch ?? branch
  const changes = !review ? 'Checking changes…' : review.error !== null ? 'Changes unknown' : reviewSummary(review.state)
  const identity = [
    projectOf(session) || 'no project',
    session.account,
    [harnessLabel(session), session.provider && session.provider !== 'native' ? null : session.model].filter(Boolean).join(', '),
    `${session.opens} session${session.opens === 1 ? '' : 's'}`,
  ].filter(Boolean).join(' · ')

  return (
    <div class="flex flex-col h-full min-w-0">
      <div class="flex flex-col shrink-0" style={{ padding: '14px 20px', gap: '12px' }}>
        <div class="flex items-center flex-wrap" style={{ gap: '12px' }}>
          <span
            class="grid place-items-center shrink-0"
            style={{ width: '34px', height: '34px', borderRadius: '11px', background: `linear-gradient(160deg, var(${style.token}), var(${AVATAR_PAIR[style.token] ?? style.token}))`, boxShadow: 'var(--shadow-m)', color: '#fff', fontSize: '13px', fontWeight: 700 }}
            aria-hidden="true"
          >{style.glyph}</span>
          <div class="min-w-0">
            <h1 class="truncate" style={{ fontSize: '19px', fontWeight: 700, letterSpacing: '-0.02em' }}>{sessionLabel(session)}</h1>
            <p class="truncate" style={{ marginTop: '1px', fontSize: '12.5px', color: 'var(--ink-2)' }}>{identity}</p>
            {!isLogin && (
              <p class="mono truncate" style={{ marginTop: '2px', fontSize: '11.5px', color: 'var(--ink-3)' }} title={changes}>{changes}</p>
            )}
          </div>
          <span style={{ flex: '1 1 60px' }} />
          <div class="flex flex-wrap items-center" style={{ gap: '7px' }}>
            {!isLogin && (
              <button type="button" class={secondaryClass} style={secondaryButton} aria-expanded={contextOpen} onClick={() => setContextOpen(o => !o)}>
                {contextOpen ? 'Hide context' : `Context · ${mcpList.length} MCP, ${pluginList.length} plugins`}
              </button>
            )}
            {!isLogin && <GitHubButton entry={review} />}
            {!isLogin && <EditorButton session={session} entry={review} />}
            {ptyExited && <ActionButton label="Restart" variant="secondary" size="sm" onClick={handleRestart} />}
            {session.status === 'active' && !isLogin && <ActionButton label="Mark done" variant="primary" size="sm" onClick={onDone} />}
          </div>
        </div>

        {!isLogin && (
          <div class="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(138px, 1fr))', gap: '9px' }}>
            <Metric index={0} label="Context used" color="var(--blue)" bar={metrics?.context ?? null} title="Read from the harness status line">
              {metrics?.context != null ? `${Math.round(metrics.context)}%` : '—'}
            </Metric>
            <Metric index={1} label="Tokens">{metrics?.tokens != null ? formatTokens(metrics.tokens) : '—'}</Metric>
            <Metric index={2} label="Cost" color="var(--green)">{metrics?.cost != null ? formatCost(metrics.cost) : '—'}</Metric>
            {reviewed && <Metric index={3} label="Commits">{state?.commits ?? '—'}</Metric>}
            {reviewed && (
              <Metric index={4} label="Unpushed" color={state && unpushedCount(state) > 0 ? 'var(--orange)' : 'var(--ink)'}>
                {state ? unpushedCount(state) : '—'}
              </Metric>
            )}
            {shownBranch && (
              <button
                type="button"
                class="text-left cursor-pointer transition-all duration-180 ease-spring hover:-translate-y-px hover:shadow-m min-w-0"
                style={{ padding: '10px 12px', borderRadius: '13px', background: 'var(--card)', border: '1px solid var(--hair)', boxShadow: 'var(--shadow-s)', color: 'var(--ink)', animation: 'riseIn .34s var(--ease) 300ms both' }}
                title="Copy branch name"
                onClick={() => { void navigator.clipboard.writeText(shownBranch); showToast('Branch copied', 'info') }}
              >
                <div class="flex items-center" style={{ gap: '4px', fontSize: '11.5px', color: 'var(--ink-2)' }}>
                  Branch <span class="i-lucide-copy" style={{ width: '11px', height: '11px' }} />
                </div>
                <div class="mono truncate" style={{ fontSize: '13px', fontWeight: 600, marginTop: '6px' }}>{shownBranch}</div>
              </button>
            )}
          </div>
        )}

        {contextOpen && (
          <div class="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '9px', animation: 'riseIn .3s var(--ease) both' }}>
            <ChipCard
              title={`MCP · ${mcpList.length}`}
              tone="--blue"
              empty="No MCP servers"
              items={mcpList.map(m => ({ name: m.name, title: `${m.type} · ${m.source}` }))}
            />
            <ChipCard
              title={`Plugins · ${pluginList.length}`}
              tone="--green"
              empty="No plugins"
              items={pluginList.map(p => ({ name: p.name, muted: !p.enabled, title: `${p.enabled ? 'enabled' : 'disabled'} · ${p.marketplace}${p.hasMcp ? ` · MCP ${p.mcpName ?? ''}` : ''}` }))}
            />
            <ChipCard title="Stack" tone={null} empty="Nothing detected" items={stack.map(name => ({ name }))} />
          </div>
        )}
      </div>

      <div
        class="task-terminal relative flex-1 min-h-0"
        style={{ margin: '0 20px 20px', borderRadius: '14px', overflow: 'hidden', background: 'var(--term)', border: '1px solid var(--hair)', boxShadow: 'var(--shadow-l)' }}
      >
        <div class="absolute inset-0 flex flex-col">
          <div class="flex items-center shrink-0" style={{ gap: '7px', padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
            <span style={{ width: '11px', height: '11px', borderRadius: '50%', background: '#ff5f57' }} />
            <span style={{ width: '11px', height: '11px', borderRadius: '50%', background: '#febc2e' }} />
            <span style={{ width: '11px', height: '11px', borderRadius: '50%', background: '#28c840' }} />
            <span class="mono truncate" style={{ fontSize: '11px', color: '#8a8a92', marginLeft: '6px' }}>
              {shownBranch || sessionLabel(session)} — {session.harness ?? 'claude'}
            </span>
            <span class="flex-1" />
            <span class="mono" style={{ fontSize: '11px', color: connected ? '#30d158' : '#8a8a92' }}>{connected ? 'connected' : ptyExited ? 'exited' : 'offline'}</span>
          </div>
          <div class="relative flex-1 min-h-0" style={{ padding: '12px 6px 6px 14px' }}>
            <ForgeTerminal
              wsUrl={wsUrl}
              theme={theme.value}
              focused={active}
              onOutput={(data) => recordOutput(key, data)}
              onExit={() => setPtyExited(true)}
              onGiveUp={() => setPtyExited(true)}
              onConnectionChange={setConnected}
            />
            {!connected && !ptyExited && (
              <div class="absolute inset-0 grid place-items-center pointer-events-none" style={{ background: 'rgba(0,0,0,.35)' }}>
                <span style={{ fontSize: '13px', color: 'rgba(255,255,255,.7)' }}>Connecting…</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
