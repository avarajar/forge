import { type FunctionComponent, type ComponentChildren } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { ActionButton, ForgeTerminal, showToast } from '@forge-dev/ui'
import type { CWSession } from '@forge-dev/core'
import { getTypeStyle, harnessLabel, inkOf, pageCard, projectOf, sessionDirOf, sessionKey, sessionLabel, soft, tierToken } from '../config/types.js'
import { reviewSummary, unpushedCount } from '../config/review.js'
import { copyText, errorText, postJson } from '../config/api.js'
import { EditorButton, GitHubButton, TicketButton, secondaryButton, secondaryClass } from '../components/TaskLinks.js'
import { useTaskReview } from '../hooks/useTaskReview.js'
import { stackParts, useProjectStack } from '../hooks/useProjectStack.js'
import { recordOutput, metricsFor, formatCost, formatTokens } from '../hooks/useTerminalMetrics.js'
import { brainName, sumPages, useKiokuChain } from '../hooks/useKioku.js'
import { useAutoFocus } from '../hooks/useAutoFocus.js'
import { theme } from '../shell.js'

interface ToolsMcp { name: string; type: string; source: string; url?: string }
interface ToolsPlugin { name: string; enabled: boolean; hasMcp: boolean; mcpName?: string; mcpType?: string; marketplace: string }
interface ToolsInfo { mcps: ToolsMcp[]; plugins: ToolsPlugin[] }

interface TaskDetailProps {
  session: CWSession
  active: boolean
  onDone: () => void | Promise<void>
  onOpenMemory?: (project: string) => void
}

// the second stop of each type's avatar gradient
const AVATAR_PAIR: Record<string, string> = { '--orange': '--red', '--blue': '--purple', '--purple': '--blue', '--green': '--teal' }

// a cell of the metric strip; the strip is the card, cells only pad
const metricCell = { padding: '10px 14px', minWidth: 0 }
const metricLabel = { fontSize: '11px', fontWeight: 500, color: 'var(--ink-2)' }

// a solid fill that warms only as the context fills up
const contextFill = (pct: number): string => pct >= 90 ? 'var(--red)' : pct >= 70 ? 'var(--orange)' : 'var(--ink-2)'

const Unit: FunctionComponent<{ children: ComponentChildren }> = ({ children }) => (
  <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--ink-2)', marginLeft: '2px' }}>{children}</span>
)

const Metric: FunctionComponent<{ label: string; color?: string; bar?: number | null; title?: string; empty?: boolean; unit?: string; children: ComponentChildren }> = ({ label, color = 'var(--ink)', bar, title, empty, unit, children }) => (
  <div title={title} style={metricCell}>
    <div style={metricLabel}>{label}</div>
    <div class="truncate num" style={{ fontSize: '17px', lineHeight: '24px', fontWeight: empty ? 400 : 650, color: empty ? 'var(--ink-4)' : color, marginTop: '2px' }}>
      {children}{!empty && unit && <Unit>{unit}</Unit>}
    </div>
    {bar !== undefined && (
      <div style={{ height: '4px', borderRadius: '99px', background: 'var(--well)', marginTop: '7px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${bar ?? 0}%`, borderRadius: '99px', background: contextFill(bar ?? 0), transition: 'width .6s var(--ease)' }} />
      </div>
    )}
  </div>
)

// splits a k or M suffix off formatTokens, so it reads as a unit
const tokenParts = (n: number): [string, string | undefined] => {
  const text = formatTokens(n)
  const m = /^(.*?)([kM])$/.exec(text)
  return m ? [m[1], m[2]] : [text, undefined]
}

const RememberForm: FunctionComponent<{ value: string; onChange: (value: string) => void; onSend: () => void; onCancel: () => void }> = ({ value, onChange, onSend, onCancel }) => {
  const ref = useAutoFocus<HTMLInputElement>()
  return (
    <form class="flex items-center" style={{ gap: '6px', marginTop: '6px' }} onSubmit={(e) => { e.preventDefault(); onSend() }}>
      <input
        ref={ref}
        type="text"
        class="field flex-1"
        style={{ height: '28px', fontSize: '12.5px' }}
        value={value}
        maxLength={500}
        placeholder="Payments retry at most three times"
        onInput={(e) => onChange((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => { if (e.key === 'Escape') onCancel() }}
      />
      <ActionButton label="Send" variant="primary" size="sm" disabled={!value.trim()} onClick={onSend} />
    </form>
  )
}

// the brains this session loads, in the order kioku chains them; Remember asks the agent to save a note
const MemoryMetric: FunctionComponent<{ session: CWSession; onOpen?: (project: string) => void }> = ({ session, onOpen }) => {
  const project = projectOf(session)
  const chain = useKiokuChain(project)
  const [note, setNote] = useState<string | null>(null)
  if (chain.length === 0) return null
  // kioku's plugin, and so its skill, exists only for Claude Code
  const canRemember = session.harness === 'claude' && session.status === 'active'
  const remember = async () => {
    if (!note?.trim()) return
    try {
      await postJson('/api/kioku/remember', { project, sessionDir: sessionDirOf(session), text: note })
      showToast('Sent to the agent to remember', 'success')
      setNote(null)
    } catch (err) {
      showToast(errorText(err), 'error')
    }
  }
  return (
    <div style={{ ...metricCell, gridColumn: 'span 2' }}>
      <div class="flex items-center" style={metricLabel}>
        Memory · {sumPages(chain)} pages
        <span class="flex-1" />
        {canRemember && note === null && (
          <button type="button" class="cursor-pointer hover:text-ink" style={{ border: 0, background: 'none', padding: 0, fontSize: '11px', fontWeight: 600, color: 'var(--blue-ink)' }} onClick={() => setNote('')}>Remember…</button>
        )}
      </div>
      {note !== null && <RememberForm value={note} onChange={setNote} onSend={remember} onCancel={() => setNote(null)} />}
      <div class="flex items-center flex-wrap" style={{ gap: '4px', marginTop: '6px' }}>
        {chain.map((b, i) => (
          <span key={b.key} class="inline-flex items-center" style={{ gap: '4px' }}>
            {i > 0 && <span style={{ color: 'var(--ink-3)', fontSize: '11px' }}>→</span>}
            <button
              type="button"
              class="cursor-pointer transition-all duration-180 ease-spring hover:-translate-y-px"
              style={{ padding: '2px 9px', borderRadius: '99px', fontSize: '12px', fontWeight: 600, border: 0, background: soft(tierToken(b.tier)), color: inkOf(tierToken(b.tier)) }}
              title={`${b.tier ?? 'brain'} · ${b.pages} pages`}
              onClick={() => onOpen?.(project)}
            >{brainName(b)}</button>
          </span>
        ))}
      </div>
    </div>
  )
}

const ChipCard: FunctionComponent<{ title: string; items: Array<{ name: string; title?: string; muted?: boolean }>; tone: string | null; empty: string }> = ({ title, items, tone, empty }) => (
  <div style={{ padding: '11px 13px', borderRadius: 'var(--r-md)', background: 'var(--card)', boxShadow: 'var(--lit), var(--shadow-s)' }}>
    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink-2)', marginBottom: '5px' }}>{title}</div>
    <div class="flex flex-wrap" style={{ gap: '5px' }}>
      {items.length === 0 && <span style={{ fontSize: '12px', color: 'var(--ink-3)' }}>{empty}</span>}
      {items.map(i => (
        <span
          key={i.name}
          title={i.title}
          style={{
            padding: '2px 8px', borderRadius: '99px', fontSize: '11px', fontWeight: 500,
            background: tone && !i.muted ? soft(tone) : 'var(--elev)',
            color: tone && !i.muted ? inkOf(tone) : 'var(--ink-2)',
            opacity: i.muted ? 0.6 : 1,
          }}
        >{i.name}</span>
      ))}
    </div>
  </div>
)

export const TaskDetail: FunctionComponent<TaskDetailProps> = ({ session, active, onDone, onOpenMemory }) => {
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
            style={{ width: '34px', height: '34px', borderRadius: 'var(--r-md)', background: `linear-gradient(160deg, var(${style.token}), var(${AVATAR_PAIR[style.token] ?? style.token}))`, boxShadow: 'var(--shadow-m)', color: '#fff', fontSize: '13px', fontWeight: 700 }}
            aria-hidden="true"
          >{style.glyph}</span>
          <div class="min-w-0">
            <h1 class="truncate" style={{ fontSize: '17px', fontWeight: 700, letterSpacing: '-0.02em' }}>{sessionLabel(session)}</h1>
            <p class="truncate" style={{ marginTop: '1px', fontSize: '12.5px', color: 'var(--ink-2)' }}>{identity}</p>
            {!isLogin && (
              <p class="mono truncate" style={{ marginTop: '2px', fontSize: '11px', color: 'var(--ink-3)' }} title={changes}>{changes}</p>
            )}
          </div>
          <span style={{ flex: '1 1 60px' }} />
          <div class="flex flex-wrap items-center" style={{ gap: '7px' }}>
            {!isLogin && (
              <button type="button" class={secondaryClass} style={secondaryButton} aria-expanded={contextOpen} onClick={() => setContextOpen(o => !o)}>
                {contextOpen ? 'Hide context' : `Context · ${mcpList.length} MCP, ${pluginList.length} plugins`}
              </button>
            )}
            {!isLogin && <TicketButton session={session} />}
            {!isLogin && <GitHubButton entry={review} />}
            {!isLogin && <EditorButton session={session} entry={review} />}
            {ptyExited && <ActionButton label="Restart" variant="secondary" size="sm" onClick={handleRestart} />}
            {session.status === 'active' && !isLogin && <ActionButton label="Mark done" variant="primary" size="sm" onClick={onDone} />}
          </div>
        </div>

        {!isLogin && (
          <div class="grid metric-strip" style={{ ...pageCard, overflow: 'hidden', gridTemplateColumns: 'repeat(auto-fit, minmax(128px, 1fr))', gap: 0, animation: 'riseIn .34s var(--ease) both' }}>
            <Metric label="Context used" bar={metrics?.context ?? null} title="Read from the harness status line" empty={metrics?.context == null} unit="%">
              {metrics?.context != null ? Math.round(metrics.context) : '—'}
            </Metric>
            {metrics?.tokens != null
              ? <Metric label="Tokens" unit={tokenParts(metrics.tokens)[1]}>{tokenParts(metrics.tokens)[0]}</Metric>
              : <Metric label="Tokens" empty>—</Metric>}
            <Metric label="Cost" empty={metrics?.cost == null}>{metrics?.cost != null ? formatCost(metrics.cost) : '—'}</Metric>
            {reviewed && <Metric label="Commits" empty={state?.commits == null}>{state?.commits ?? '—'}</Metric>}
            {reviewed && (
              <Metric label="Unpushed" empty={!state} color={state && unpushedCount(state) > 0 ? 'var(--orange-ink)' : 'var(--ink)'}>
                {state ? unpushedCount(state) : '—'}
              </Metric>
            )}
            <MemoryMetric session={session} onOpen={onOpenMemory} />
            {shownBranch && (
              <button
                type="button"
                class="text-left cursor-pointer transition-colors duration-180 ease-spring bg-transparent hover:bg-elev min-w-0"
                style={{ ...metricCell, border: 0, color: 'var(--ink)' }}
                title="Copy branch name"
                onClick={() => copyText(shownBranch, 'Branch')}
              >
                <div class="flex items-center" style={{ ...metricLabel, gap: '4px' }}>
                  Branch <span class="i-lucide-copy" style={{ width: '11px', height: '11px' }} />
                </div>
                <div class="mono truncate" style={{ fontSize: '13px', lineHeight: '24px', fontWeight: 600, marginTop: '2px' }}>{shownBranch}</div>
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
        style={{ margin: '0 20px 20px', borderRadius: 'var(--r-lg)', overflow: 'hidden', background: 'var(--term)', boxShadow: 'var(--lit), var(--shadow-l)' }}
      >
        <div class="absolute inset-0 flex flex-col">
          <div class="flex items-center shrink-0" style={{ gap: '7px', padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
            <span style={{ width: '11px', height: '11px', borderRadius: '50%', background: '#ff5f57' }} />
            <span style={{ width: '11px', height: '11px', borderRadius: '50%', background: '#febc2e' }} />
            <span style={{ width: '11px', height: '11px', borderRadius: '50%', background: '#28c840' }} />
            <span class="mono truncate" style={{ fontSize: '11px', color: 'var(--term-chrome)', marginLeft: '6px' }}>
              {shownBranch || sessionLabel(session)} — {session.harness ?? 'claude'}
            </span>
            <span class="flex-1" />
            <span class="mono" style={{ fontSize: '11px', color: connected ? '#30d158' /* the bar is dark in both themes */ : 'var(--term-chrome)' }}>{connected ? 'connected' : ptyExited ? 'exited' : 'offline'}</span>
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
