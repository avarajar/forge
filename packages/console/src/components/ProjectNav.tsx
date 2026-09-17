import { type FunctionComponent } from 'preact'
import { useMemo, useState } from 'preact/hooks'
import { avatarPair } from '../config/types.js'
import { Dot } from './Dot.js'

export interface ProjectNavItem { name: string; account: string; count: number; live: boolean }

interface ProjectNavProps {
  projects: ProjectNavItem[]
  accounts: string[]
  selected: string | null
  onSelect: (project: string) => void
  onAdd: () => void
}

const PREVIEW = 5
const COLLAPSED_KEY = 'forge-sidebar-collapsed'

const readCollapsed = (): string[] => {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY)
    return raw ? JSON.parse(raw) as string[] : []
  } catch {
    return []
  }
}

// live projects first, then the busiest, then by name
const byActivity = (a: ProjectNavItem, b: ProjectNavItem) =>
  Number(b.live) - Number(a.live) || b.count - a.count || a.name.localeCompare(b.name)

export const ProjectNav: FunctionComponent<ProjectNavProps> = ({ projects, accounts, selected, onSelect, onAdd }) => {
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState<string[]>(readCollapsed)
  const [expanded, setExpanded] = useState<string[]>([])
  const q = query.trim().toLowerCase()

  const groups = useMemo(() => {
    const order = [...accounts, ...projects.map(p => p.account).filter(a => !accounts.includes(a))]
    return Array.from(new Set(order))
      .map((account, index) => ({
        account,
        index,
        items: projects.filter(p => p.account === account && (!q || p.name.toLowerCase().includes(q))).sort(byActivity),
        active: projects.filter(p => p.account === account).reduce((n, p) => n + p.count, 0),
      }))
      .filter(g => g.items.length > 0)
  }, [projects, accounts, q])

  const toggleCollapsed = (account: string) => {
    const next = collapsed.includes(account) ? collapsed.filter(a => a !== account) : [...collapsed, account]
    setCollapsed(next)
    try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next)) } catch {}
  }

  return (
    <div class="flex flex-col sb-section min-h-0" style={{ gap: '6px', flex: '0 1 auto', minHeight: '120px' }}>
      <div class="flex items-center justify-between shrink-0" style={{ padding: '0 9px' }}>
        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink-3)', letterSpacing: '.02em' }}>Projects</span>
        <button type="button" aria-label="Add project" title="Add project (P)" class="grid place-items-center cursor-pointer" style={{ border: 0, background: 'none', color: 'var(--blue)', padding: '0 2px' }} onClick={onAdd}>
          <span class="i-lucide-plus" style={{ width: '14px', height: '14px' }} />
        </button>
      </div>

      <label class="relative shrink-0 block" style={{ margin: '0 2px' }}>
        <span class="i-lucide-search absolute pointer-events-none" style={{ left: '9px', top: '8px', width: '12px', height: '12px', color: 'var(--ink-3)' }} />
        <input
          type="search"
          class="field"
          aria-label="Filter projects"
          placeholder="Filter projects"
          value={query}
          style={{ height: '28px', padding: '0 8px 0 27px', borderRadius: '8px', fontSize: '12.5px', background: 'var(--elev)' }}
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => { if (e.key === 'Escape') setQuery('') }}
        />
      </label>

      <div class="flex flex-col overflow-y-auto min-h-0" style={{ gap: '8px', overscrollBehavior: 'contain' }}>
        {groups.length === 0 && (
          <p style={{ padding: '4px 9px', fontSize: '12px', color: 'var(--ink-3)' }}>No project matches “{query.trim()}”.</p>
        )}
        {groups.map(g => {
          const open = q !== '' || !collapsed.includes(g.account)
          const showAll = q !== '' || expanded.includes(g.account) || g.items.some((p, i) => i >= PREVIEW && p.name === selected)
          const visible = showAll ? g.items : g.items.slice(0, PREVIEW)
          const [c1, c2] = avatarPair(g.index)
          const live = g.items.some(p => p.live)
          return (
            <div key={g.account} class="flex flex-col shrink-0" style={{ gap: '1px' }}>
              <button
                type="button"
                aria-expanded={open}
                class="flex items-center w-full text-left cursor-pointer transition-colors duration-160 hover:bg-elev"
                style={{ gap: '7px', height: '26px', padding: '0 7px', borderRadius: '8px', border: 0, background: 'none', color: 'var(--ink-2)' }}
                onClick={() => toggleCollapsed(g.account)}
              >
                <span class="i-lucide-chevron-right shrink-0" style={{ width: '11px', height: '11px', color: 'var(--ink-3)', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .2s var(--ease)' }} />
                <span class="grid place-items-center shrink-0" style={{ width: '16px', height: '16px', borderRadius: '5px', background: `linear-gradient(160deg, var(${c1}), var(${c2}))`, color: '#fff', fontSize: '9px', fontWeight: 700 }}>
                  {g.account.charAt(0).toUpperCase()}
                </span>
                <span class="flex-1 truncate" style={{ fontSize: '12px', fontWeight: 600 }}>{g.account}</span>
                {live && <Dot size={5} live glow={false} />}
                <span class="mono" style={{ fontSize: '10.5px', color: 'var(--ink-3)' }} title={`${g.items.length} projects · ${g.active} active tasks`}>{g.items.length}</span>
              </button>

              {open && (
                <div class="flex flex-col" style={{ gap: '1px', marginLeft: '13px', paddingLeft: '6px', borderLeft: '1px solid var(--hair)', animation: 'riseIn .24s var(--ease) both' }}>
                  {visible.map(p => {
                    const on = selected === p.name
                    return (
                      <button
                        key={p.name}
                        type="button"
                        aria-pressed={on}
                        class="flex items-center w-full text-left shrink-0 cursor-pointer transition-all duration-180 ease-spring hover:bg-elev"
                        style={{
                          gap: '8px', height: '27px', padding: '0 8px', borderRadius: '8px', fontSize: '13px', color: 'var(--ink)',
                          border: `1px solid ${on ? 'var(--hair)' : 'transparent'}`, background: on ? 'var(--card)' : 'transparent',
                          boxShadow: on ? 'var(--shadow-s)' : 'none',
                        }}
                        onClick={() => onSelect(p.name)}
                      >
                        <Dot size={6} live={p.live} />
                        <span class="flex-1 truncate" style={{ fontWeight: on ? 600 : 450, opacity: p.count > 0 || p.live || on ? 1 : 0.62 }}>{p.name}</span>
                        {p.count > 0 && <span class="mono" style={{ fontSize: '11px', color: 'var(--ink-3)' }}>{p.count}</span>}
                      </button>
                    )
                  })}
                  {g.items.length > PREVIEW && q === '' && (
                    <button
                      type="button"
                      class="text-left cursor-pointer hover:underline"
                      style={{ padding: '3px 8px', border: 0, background: 'none', color: 'var(--blue)', fontSize: '11.5px', fontWeight: 500 }}
                      onClick={() => setExpanded(showAll ? expanded.filter(a => a !== g.account) : [...expanded, g.account])}
                    >
                      {showAll ? 'Show less' : `Show all ${g.items.length}`}
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
