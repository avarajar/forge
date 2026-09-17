import { type FunctionComponent } from 'preact'
import type { CWSession } from '@forge-dev/core'
import { Tabs } from '@forge-dev/ui'
import { soft, sessionLabel } from '../config/types.js'
import { theme, setTheme, sidebarOpen } from '../shell.js'
import { harnesses } from '../hooks/useHarnesses.js'
import { skills } from '../hooks/useSkills.js'
import { Dot } from './Dot.js'
import { ProjectNav, type ProjectNavItem } from './ProjectNav.js'
import { metricsFor, formatCost, formatTokens } from '../hooks/useTerminalMetrics.js'

export type View = 'list' | 'accounts' | 'skills' | 'prototypes'

export const NAV: Array<{ view: View; label: string; glyph: string; token: string }> = [
  { view: 'list', label: 'Tasks', glyph: 'T', token: '--blue' },
  { view: 'accounts', label: 'Accounts', glyph: 'A', token: '--purple' },
  { view: 'skills', label: 'Skills', glyph: 'S', token: '--green' },
  { view: 'prototypes', label: 'Prototypes', glyph: 'P', token: '--orange' },
]

export interface SidebarProps {
  view: View
  counts: Partial<Record<View, number | null>>
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
  borderRadius: '9px',
  border: `1px solid ${on ? 'var(--hair)' : 'transparent'}`,
  background: on ? 'var(--card)' : 'transparent',
  boxShadow: on ? 'var(--shadow-s)' : 'none',
  color: 'var(--ink)',
})

const Label: FunctionComponent = ({ children }) => (
  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink-3)', letterSpacing: '.02em' }}>{children}</span>
)

const LiveCard: FunctionComponent<{ id: string; session: CWSession; index: number; onOpen: () => void }> = ({ id, session, index, onOpen }) => {
  const m = metricsFor(id).value
  const isLoop = session.type === 'loop'
  const pct = m?.context ?? null
  const [c1, c2] = index % 2 === 0 ? ['var(--blue)', 'var(--purple)'] : ['var(--purple)', 'var(--blue)']
  const sub = isLoop
    ? (session.loop_interval ? `every ${session.loop_interval}` : 'self-paced')
    : m && (m.tokens !== null || m.cost !== null)
      ? [m.tokens !== null ? `${formatTokens(m.tokens)} tokens` : null, m.cost !== null ? formatCost(m.cost) : null].filter(Boolean).join(' · ')
      : session.project
  return (
    <button
      type="button"
      class="flex flex-col text-left cursor-pointer transition-all duration-180 ease-spring hover:-translate-y-px hover:shadow-m"
      style={{ gap: '6px', padding: '9px 10px', borderRadius: '12px', background: 'var(--card)', border: '1px solid var(--hair)', boxShadow: 'var(--shadow-s)', color: 'var(--ink)' }}
      onClick={onOpen}
    >
      <span class="flex items-center w-full" style={{ gap: '6px' }}>
        <Dot size={6} color={c1} live />
        <span class="truncate" style={{ fontSize: '12.5px', fontWeight: 600 }}>{sessionLabel(session)}</span>
        <span class="flex-1" />
        <span class="mono" style={{ fontSize: '11px', color: 'var(--ink-2)' }}>{pct !== null ? `${Math.round(pct)}%` : '—'}</span>
      </span>
      <span class="relative block w-full overflow-hidden" style={{ height: '5px', borderRadius: '99px', background: 'var(--elev)' }}>
        <span class="block h-full" style={{ width: `${pct ?? 0}%`, borderRadius: '99px', background: `linear-gradient(90deg, ${c1}, ${c2})`, transition: 'width .6s var(--ease)' }} />
        <span class="absolute inset-y-0 left-0" style={{ width: '30%', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,.22), transparent)', animation: 'sweep 2.6s ease-in-out infinite' }} />
      </span>
      <span class="mono truncate w-full" style={{ fontSize: '10.5px', color: 'var(--ink-3)' }}>{sub}</span>
    </button>
  )
}

export const Sidebar: FunctionComponent<SidebarProps> = ({
  view, counts, projects, accounts, selectedProject, live, onNavigate, onSelectProject, onAddProject, onOpenLive, onSearch,
}) => {
  const version = harnesses.value?.available ? harnesses.value.doctor.cw_version : null
  const nav = NAV.map(n => ({ ...n, count: n.view === 'skills' ? skills.value?.length ?? null : counts[n.view] ?? null }))
  return (
  <aside
    class={`forge-sidebar flex flex-col${sidebarOpen.value ? ' open' : ''}`}
    aria-label="Sidebar"
    style={{
      position: 'sticky', top: 0, height: '100vh', overflowY: 'auto', overscrollBehavior: 'contain',
      gap: '18px', padding: '14px 10px 12px', background: 'var(--bg-2)', borderRight: '1px solid var(--hair)',
    }}
  >
    <div role="button" tabIndex={0} class="flex items-center cursor-pointer" style={{ gap: '9px', padding: '2px 8px' }}
      onClick={() => onNavigate('list')}
      onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') onNavigate('list') }}
    >
      <span class="grid place-items-center shrink-0" style={{ width: '22px', height: '22px', borderRadius: '7px', background: 'linear-gradient(160deg, var(--blue), var(--purple))', boxShadow: 'var(--shadow-s)', fontSize: '12px', fontWeight: 700, color: '#fff' }}>F</span>
      <span class="sb-label" style={{ fontSize: '15px', fontWeight: 600, letterSpacing: '-0.015em' }}>Forge</span>
      <span class="flex-1 sb-label" />
      {version && <span class="mono sb-label" style={{ fontSize: '10px', color: 'var(--ink-3)' }} title="CW version">{version}</span>}
    </div>

    {onSearch && (
      <button
        type="button"
        class="flex items-center text-left cursor-pointer transition-all duration-180 ease-spring text-ink2 hover:text-ink hover:border-hair2 hover:-translate-y-px hover:shadow-m"
        style={{ gap: '8px', padding: '6px 9px', borderRadius: '9px', border: '1px solid var(--hair)', background: 'var(--card)', fontSize: '12.5px', boxShadow: 'var(--shadow-s)' }}
        onClick={onSearch}
        aria-label="Search (⌘K)"
      >
        <span class="i-lucide-search shrink-0" style={{ width: '13px', height: '13px', opacity: 0.7 }} />
        <span class="flex-1 sb-label">Search</span>
        <kbd class="sb-label" style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '5px', background: 'var(--elev)', border: '1px solid var(--hair)' }}>⌘K</kbd>
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
            style={{ ...selectedRow(on), gap: '9px', height: '32px', padding: '0 9px', fontSize: '13.5px', fontWeight: on ? 600 : 450 }}
            onClick={() => onNavigate(n.view)}
          >
            <span class="grid place-items-center shrink-0" style={{
              width: '18px', height: '18px', borderRadius: '5px', fontSize: '10px', fontWeight: 600,
              background: on ? soft(n.token) : 'var(--elev)',
              color: on ? `var(${n.token})` : 'var(--ink-3)',
            }}>{n.glyph}</span>
            <span class="flex-1 sb-label">{n.label}</span>
            {n.count !== null && <span class="mono sb-label" style={{ fontSize: '11px', color: 'var(--ink-3)' }}>{n.count}</span>}
          </button>
        )
      })}
    </nav>

    <ProjectNav projects={projects} accounts={accounts} selected={selectedProject} onSelect={onSelectProject} onAdd={onAddProject} />

    <div class="flex flex-col" style={{ marginTop: 'auto', flex: 'none', gap: '8px' }}>
      {live.length > 0 && (
        <div class="flex flex-col sb-section" style={{ gap: '8px' }}>
          <span style={{ padding: '0 9px' }}><Label>Live now</Label></span>
          {live.map((l, i) => <LiveCard key={l.key} id={l.key} session={l.session} index={i} onOpen={() => onOpenLive(l.session)} />)}
        </div>
      )}
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
