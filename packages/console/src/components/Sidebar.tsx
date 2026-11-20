import { type FunctionComponent } from 'preact'
import { useEffect } from 'preact/hooks'
import type { CWSession, UsageWindow } from '@forge-dev/core'
import { Tabs, ToggleSwitch, UsageMeter, showToast } from '@forge-dev/ui'
import { PRIMARY_FILL, inkOf, projectOf, soft, sessionLabel, getHarnessStyle, usageBars, formatReset, needsYou, stateLabel, stateShape, stateToken } from '../config/types.js'
import { theme, setTheme, sidebarOpen } from '../shell.js'
import { forgeVersion, loadForgeVersion } from '../hooks/useForgeVersion.js'
import { skills } from '../hooks/useSkills.js'
import { Dot } from './Dot.js'
import { ProjectNav, type ProjectNavItem } from './ProjectNav.js'
import { metricsFor, formatCost, formatTokens } from '../hooks/useTerminalMetrics.js'
import { usage, watchUsage } from '../hooks/useUsage.js'
import { sessionStates } from '../hooks/useSessionStates.js'
import { notificationsSupported, notifySessions, setNotifySessions } from '../state/notifications.js'
import { addModuleOpen, modules, moduleWarning, sidebarModules } from '../hooks/useModules.js'
import { moduleCounts } from '../hooks/useModuleNotifications.js'

export type BuiltinView = 'list' | 'accounts' | 'skills' | 'prototypes' | 'qa' | 'memory'
export type View = BuiltinView | `module:${string}`

export const NAV: Array<{ view: BuiltinView; label: string; glyph: string; token: string }> = [
  { view: 'list', label: 'Tasks', glyph: 'T', token: '--blue' },
  { view: 'accounts', label: 'Accounts', glyph: 'A', token: '--purple' },
  { view: 'skills', label: 'Skills', glyph: 'S', token: '--green' },
  { view: 'prototypes', label: 'Prototypes', glyph: 'P', token: '--orange' },
  { view: 'qa', label: 'QA', glyph: 'Q', token: '--teal' },
  { view: 'memory', label: 'Memory', glyph: 'M', token: '--red' },
]

export interface SidebarProps {
  view: View
  counts: Partial<Record<BuiltinView, number | null>>
  projects: ProjectNavItem[]
  accounts: string[]
  selectedProject: string | null
  live: Array<{ key: string; session: CWSession }>
  onNavigate: (view: View) => void
  onSelectProject: (project: string) => void
  onAddProject: () => void
  onOpenLive: (session: CWSession) => void
  onSearch?: () => void
}

const rowBase = 'flex items-center w-full text-left cursor-pointer transition-all duration-180 ease-spring hover:bg-elev'

const selectedRow = (on: boolean) => ({
  borderRadius: 'var(--r-sm)',
  border: 0,
  background: on ? 'var(--card)' : 'transparent',
  boxShadow: on ? 'var(--lit), var(--shadow-s)' : 'none',
  color: 'var(--ink)',
})

const cardClass = 'flex flex-col text-left cursor-pointer transition-all duration-180 ease-spring hover:-translate-y-px hover:shadow-m'

const cardStyle = { gap: '6px', padding: '9px 10px', borderRadius: 'var(--r-md)', border: 0, background: 'var(--card)', boxShadow: 'var(--lit), var(--shadow-s)', color: 'var(--ink)' }

const cardFoot = { fontSize: '11px', color: 'var(--ink-3)' }

const Label: FunctionComponent = ({ children }) => (
  <span style={{ display: 'block', paddingTop: '4px', fontSize: '11px', fontWeight: 600, color: 'var(--ink-3)' }}>{children}</span>
)

const LiveCard: FunctionComponent<{ id: string; session: CWSession; onOpen: () => void }> = ({ id, session, onOpen }) => {
  const m = metricsFor(id).value
  const state = sessionStates.value[id]
  const urgent = needsYou(state)
  const isLoop = session.type === 'loop'
  const pct = m?.context ?? null
  const tok = state ? stateToken(state) : '--green'
  const fill = pct !== null && pct >= 90 ? 'var(--red)' : pct !== null && pct >= 70 ? 'var(--orange)' : 'var(--ink-2)'
  const sub = urgent ? stateLabel(state!) : isLoop
    ? (session.loop_interval ? `every ${session.loop_interval}` : 'self-paced')
    : m && (m.tokens !== null || m.cost !== null)
      ? [m.tokens !== null ? `${formatTokens(m.tokens)} tokens` : null, m.cost !== null ? formatCost(m.cost) : null].filter(Boolean).join(' · ')
      : projectOf(session) || session.account
  return (
    <button
      type="button"
      class={cardClass}
      style={urgent
        ? { ...cardStyle, position: 'relative', background: `color-mix(in srgb, var(${tok}) 10%, var(--card))`, boxShadow: `var(--lit), 0 0 0 1px color-mix(in srgb, var(${tok}) 40%, transparent), var(--shadow-s)` }
        : cardStyle}
      onClick={onOpen}
      title={state ? stateLabel(state) : undefined}
    >
      {urgent && <span aria-hidden="true" style={{ position: 'absolute', left: 0, top: '10px', bottom: '10px', width: '3px', borderRadius: '0 3px 3px 0', background: `var(${tok})` }} />}
      <span class="flex items-center w-full" style={{ gap: '6px' }}>
        <Dot size={6} color={state ? `var(${tok})` : undefined} shape={state ? stateShape(state) : 'solid'} live={!state || state.state === 'working' || urgent} />
        <span class="truncate" style={{ fontSize: '12.5px', fontWeight: 600 }}>{sessionLabel(session)}</span>
        <span class="flex-1" />
        <span class="mono num" style={{ fontSize: '11px', color: 'var(--ink-2)' }}>{pct !== null ? `${Math.round(pct)}%` : '—'}</span>
      </span>
      <span class="relative block w-full overflow-hidden" style={{ height: '4px', borderRadius: '99px', background: 'var(--well)' }}>
        <span class="block h-full" style={{ width: `${pct ?? 0}%`, borderRadius: '99px', background: fill, transition: 'width .6s var(--ease)' }} />
        {state?.state === 'working' && (
          <span class="absolute inset-y-0 left-0" style={{ width: '30%', background: 'linear-gradient(90deg, transparent, var(--sheen), transparent)', animation: 'sweep 2.6s ease-in-out infinite' }} />
        )}
      </span>
      <span class="mono truncate w-full" style={urgent ? { ...cardFoot, color: inkOf(tok), fontWeight: 600 } : cardFoot}>{sub}</span>
    </button>
  )
}

// one entry per module view; disabled ones stay listed with their reason
const ModuleNav: FunctionComponent<{ view: View; onNavigate: (view: View) => void }> = ({ view, onNavigate }) => {
  const list = sidebarModules(modules.value)
  const counts = moduleCounts.value
  const add = () => { sidebarOpen.value = false; addModuleOpen.value = true }
  return (
    <nav class="flex flex-col sb-section" style={{ gap: '2px' }} aria-label="Modules">
      <div class="flex items-center justify-between" style={{ padding: '0 9px 4px' }}>
        <Label>Modules</Label>
        <button type="button" aria-label="Add a module" title="Add a module" class="grid place-items-center cursor-pointer" style={{ border: 0, background: 'none', color: 'var(--blue)', padding: '0 2px' }} onClick={add}>
          <span class="i-lucide-plus" style={{ width: '14px', height: '14px' }} />
        </button>
      </div>
      {list.length === 0 && (
        <button type="button" class={rowBase} style={{ ...selectedRow(false), gap: '9px', height: '30px', padding: '0 9px', fontSize: '12.5px', color: 'var(--ink-3)' }} onClick={add}>
          <span class="i-lucide-package-plus shrink-0" style={{ width: '15px', height: '15px' }} />
          <span class="flex-1 sb-label truncate">Add a module</span>
        </button>
      )}
      {list.map(m => {
        const target: View = `module:${m.id}`
        const on = view === target
        const off = m.state !== 'enabled'
        const warning = off ? null : moduleWarning(m)
        const c = counts[m.id]
        const tint = m.color ?? 'var(--ink-3)'
        return (
          <button
            key={`${m.id}-${m.source}`}
            type="button"
            aria-current={on ? 'page' : undefined}
            title={off ? `${m.displayName} is disabled: ${m.reason ?? ''}` : warning ?? m.displayName}
            class={rowBase}
            style={{ ...selectedRow(on), gap: '9px', height: '32px', padding: '0 9px', fontSize: '13.5px', fontWeight: on ? 600 : 500, opacity: off ? 0.5 : 1 }}
            onClick={() => onNavigate(target)}
          >
            <span class="grid place-items-center shrink-0" style={{
              width: '18px', height: '18px', borderRadius: 'var(--r-xs)', fontSize: '11px', fontWeight: 600,
              background: on ? `color-mix(in srgb, ${tint} var(--tint), transparent)` : 'var(--elev)',
              color: on ? tint : 'var(--ink-3)',
            }}>{m.displayName.charAt(0).toUpperCase()}</span>
            <span class="flex-1 sb-label truncate">{m.displayName}</span>
            {warning && <span class="sb-label" aria-label="Has a warning" style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--orange)' }} />}
            {c && c.attention > 0 && <span class="mono sb-label" aria-label={`${c.attention} need you`} style={{ fontSize: '11px', fontWeight: 700, padding: '0 6px', borderRadius: '99px', color: '#fff', background: 'var(--red-fill)' }}>{c.attention}</span>}
            {c && c.badge > 0 && <span class="mono sb-label" style={{ fontSize: '11px', color: 'var(--ink-3)' }}>{c.badge}</span>}
          </button>
        )
      })}
    </nav>
  )
}

const NotifySwitch: FunctionComponent = () => (
  <label class="flex items-center justify-between" style={{ gap: '8px', padding: '0 9px', fontSize: '12px', color: 'var(--ink-2)' }}>
    <span class="sb-label">Notify when waiting</span>
    <ToggleSwitch
      checked={notifySessions.value}
      label="Notify me when a session or module needs me"
      onChange={(on) => {
        void setNotifySessions(on).then((ok) => { if (!ok) showToast('The browser blocked notifications for Forge', 'error') })
      }}
    />
  </label>
)

// the tightest window decides what the card says underneath, because that is the one that will bite
const LimitCard: FunctionComponent<{ account: string; harness: string; windows: UsageWindow[]; stale: boolean; onOpen: () => void }> = ({ account, harness, windows, stale, onOpen }) => {
  const tightest = windows.reduce((worst, w) => (w.percent > worst.percent ? w : worst))
  const harnessLabel = getHarnessStyle(harness).label
  return (
    <button type="button" class={cardClass} style={cardStyle} onClick={onOpen} title={`Usage limits for ${account} on ${harnessLabel}`}>
      <span class="flex items-center w-full" style={{ gap: '6px' }}>
        <span class="truncate" style={{ fontSize: '12.5px', fontWeight: 600 }}>{account}</span>
        <span class="flex-1" />
        <span class="mono truncate" style={{ fontSize: '11px', color: 'var(--ink-3)' }}>{harnessLabel}</span>
      </span>
      <UsageMeter bars={usageBars(windows)} size="sm" />
      <span class="mono truncate w-full" style={cardFoot}>
        {stale ? 'last known values' : formatReset(tightest.resetsAt)}
      </span>
    </button>
  )
}

export const Sidebar: FunctionComponent<SidebarProps> = ({
  view, counts, projects, accounts, selectedProject, live, onNavigate, onSelectProject, onAddProject, onOpenLive, onSearch,
}) => {
  const version = forgeVersion.value
  const nav = NAV.map(n => ({ ...n, count: n.view === 'skills' ? skills.value?.length ?? null : counts[n.view] ?? null }))
  useEffect(() => watchUsage(), [])
  useEffect(() => { loadForgeVersion().catch(() => {}) }, [])
  // sessions waiting on the user go first
  const liveOrdered = [...live].sort((a, b) => Number(needsYou(sessionStates.value[b.key])) - Number(needsYou(sessionStates.value[a.key])))
  const limits = usage.value?.available ? usage.value.usage.filter(u => u.state === 'ok' && u.windows.some(w => !w.scope)) : []
  return (
  <aside
    class={`forge-sidebar flex flex-col${sidebarOpen.value ? ' open' : ''}`}
    aria-label="Sidebar"
    style={{
      position: 'sticky', top: 0, height: '100vh', overflowY: 'auto', overscrollBehavior: 'contain',
      gap: '20px', padding: '14px 10px 12px', background: 'var(--bg-2)', boxShadow: 'inset -1px 0 0 var(--hair-soft)',
    }}
  >
    <div role="button" tabIndex={0} class="flex items-center cursor-pointer" style={{ gap: '9px', padding: '2px 8px' }}
      onClick={() => onNavigate('list')}
      onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') onNavigate('list') }}
    >
      <span class="grid place-items-center shrink-0" style={{ width: '22px', height: '22px', borderRadius: 'var(--r-xs)', background: PRIMARY_FILL, boxShadow: 'var(--shadow-s)', fontSize: '12px', fontWeight: 700, color: '#fff' }}>F</span>
      <span class="sb-label" style={{ fontSize: '15px', fontWeight: 600, letterSpacing: '-0.015em' }}>Forge</span>
      <span class="flex-1 sb-label" />
      {version && <span class="mono sb-label" style={{ fontSize: '11px', color: 'var(--ink-3)' }} title="Forge version">{version}</span>}
    </div>

    {onSearch && (
      <button
        type="button"
        class="flex items-center text-left cursor-pointer transition-all duration-180 ease-spring text-ink2 hover:text-ink hover:-translate-y-px hover:shadow-m"
        style={{ gap: '8px', padding: '6px 9px', borderRadius: 'var(--r-sm)', border: 0, background: 'var(--card)', fontSize: '12.5px', boxShadow: 'var(--shadow-s)' }}
        onClick={onSearch}
        aria-label="Search (⌘K)"
      >
        <span class="i-lucide-search shrink-0" style={{ width: '13px', height: '13px', opacity: 0.7 }} />
        <span class="flex-1 sb-label">Search</span>
        <kbd class="sb-label" style={{ fontSize: '11px', padding: '1px 5px', borderRadius: 'var(--r-xs)', background: 'var(--well)' }}>⌘K</kbd>
      </button>
    )}

    <nav class="flex flex-col" style={{ gap: '2px' }} aria-label="Sections">
      {nav.map(n => {
        const on = view === n.view
        return (
          <button
            key={n.view}
            type="button"
            aria-current={on ? 'page' : undefined}
            title={n.label}
            class={rowBase}
            style={{ ...selectedRow(on), gap: '9px', height: '32px', padding: '0 9px', fontSize: '13.5px', fontWeight: on ? 600 : 500 }}
            onClick={() => onNavigate(n.view)}
          >
            <span class="grid place-items-center shrink-0" style={{
              width: '18px', height: '18px', borderRadius: 'var(--r-xs)', fontSize: '11px', fontWeight: 600,
              background: on ? soft(n.token) : 'var(--elev)',
              color: on ? inkOf(n.token) : 'var(--ink-3)',
            }}>{n.glyph}</span>
            <span class="flex-1 sb-label">{n.label}</span>
            {n.count !== null && <span class="mono sb-label" style={{ fontSize: '11px', color: 'var(--ink-3)' }}>{n.count}</span>}
          </button>
        )
      })}
    </nav>

    <ModuleNav view={view} onNavigate={onNavigate} />

    <ProjectNav projects={projects} accounts={accounts} selected={selectedProject} onSelect={onSelectProject} onAdd={onAddProject} />

    <div class="flex flex-col" style={{ marginTop: 'auto', flex: 'none', gap: '8px' }}>
      {live.length > 0 && (
        <div class="flex flex-col sb-section" style={{ gap: '8px' }}>
          <span style={{ padding: '0 9px' }}><Label>Live now</Label></span>
          {liveOrdered.map(l => <LiveCard key={l.key} id={l.key} session={l.session} onOpen={() => onOpenLive(l.session)} />)}
        </div>
      )}
      {limits.length > 0 && (
        <div class="flex flex-col sb-section" style={{ gap: '8px' }}>
          <span style={{ padding: '0 9px' }}><Label>Limits</Label></span>
          {limits.map(l => (
            <LimitCard
              key={`${l.account}/${l.harness}`}
              account={l.account}
              harness={l.harness}
              windows={l.windows.filter(w => !w.scope)}
              stale={l.stale}
              onOpen={() => onNavigate('accounts')}
            />
          ))}
        </div>
      )}
      {notificationsSupported && <div class="sb-section"><NotifySwitch /></div>}
      <div class="sb-section">
        <Tabs
          fill
          size="xs"
          label="Appearance"
          tabs={[{ id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }]}
          active={theme.value}
          onChange={(id) => setTheme(id === 'light' ? 'light' : 'dark')}
        />
      </div>
    </div>
  </aside>
  )
}
