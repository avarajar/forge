import { type FunctionComponent } from 'preact'
import { useState, useRef, useEffect } from 'preact/hooks'
import type { CWSession } from '@forge-dev/core'
import { TYPE_STYLES, QUICK_TYPES, sessionKey, sessionLabel } from '../config/types.js'

/* ── Types ── */

interface TabBarProps {
  tabs: CWSession[]
  activeIndex: number
  onActivate: (index: number) => void
  onClose: (index: number) => void
  /** All active sessions */
  allSessions?: CWSession[]
  /** Keys of sessions already open in tabs */
  openTabKeys?: Set<string>
  /** Open an existing session in a new tab */
  onOpenSession?: (session: CWSession) => void
  /** Navigate to new task form */
  onNewTask?: (type?: string) => void
}

/* ── Helpers ── */

/* ── Add Menu ── */

const AddMenu: FunctionComponent<{
  sessions: CWSession[]
  openTabKeys: Set<string>
  onOpenSession: (s: CWSession) => void
  onNewTask: (type?: string) => void
  onClose: () => void
  position: { top: number; left: number }
}> = ({ sessions, openTabKeys, onOpenSession, onNewTask, onClose, position }) => {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  // Group sessions by project
  const grouped: Record<string, CWSession[]> = {}
  for (const s of sessions) {
    if (!grouped[s.project]) grouped[s.project] = []
    grouped[s.project].push(s)
  }
  const projectNames = Object.keys(grouped).sort()

  return (
    <div
      ref={ref}
      class="fixed z-[999] rounded-xl"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
        backgroundColor: 'var(--forge-surface)',
        border: '1px solid var(--forge-ghost-border)',
        boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
        width: '320px',
        maxHeight: '420px',
        overflowY: 'auto',
      }}
    >
      {/* Sessions grouped by project */}
      {projectNames.length > 0 && (
        <div class="px-2 pt-2.5 pb-1">
          {projectNames.map(project => (
            <div key={project} class="mb-1.5">
              <div class="text-[9px] font-bold uppercase tracking-widest text-forge-muted px-2 py-1" style={{ opacity: 0.45 }}>
                {project}
              </div>
              {grouped[project].map(s => {
                const cfg = TYPE_STYLES[s.type] ?? TYPE_STYLES.task
                const isOpen = openTabKeys.has(sessionKey(s))
                return (
                  <button
                    key={sessionKey(s)}
                    class="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-left transition-colors"
                    style={{
                      backgroundColor: isOpen ? cfg.bg : 'transparent',
                      opacity: isOpen ? 0.55 : 1,
                    }}
                    onMouseEnter={(e) => {
                      if (!isOpen) (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--forge-ghost-bg)'
                    }}
                    onMouseLeave={(e) => {
                      if (!isOpen) (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'
                    }}
                    onClick={() => { if (!isOpen) { onOpenSession(s); onClose() } }}
                    disabled={isOpen}
                  >
                    <span class="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cfg.color }} />
                    <span class="text-xs font-medium text-forge-text truncate flex-1">{sessionLabel(s)}</span>
                    {isOpen ? (
                      <span class="text-[9px] text-forge-muted">open</span>
                    ) : (
                      <span
                        class="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded"
                        style={{ color: cfg.color, backgroundColor: cfg.bg }}
                      >
                        {cfg.label}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}

      {/* Divider */}
      <div class="mx-3 my-1" style={{ height: '1px', backgroundColor: 'var(--forge-ghost-border)' }} />

      {/* New task */}
      <div class="px-3 pt-1.5 pb-2.5">
        <div class="text-[9px] font-bold uppercase tracking-widest text-forge-muted mb-2" style={{ opacity: 0.45 }}>
          New task
        </div>
        <div class="flex items-center gap-1.5 flex-wrap">
          {QUICK_TYPES.map(t => (
            <button
              key={t.key}
              class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all hover:opacity-80"
              style={{ backgroundColor: t.style.bg, color: t.style.color, border: `1px solid ${t.style.border}` }}
              onClick={() => { onNewTask(t.key); onClose() }}
            >
              + {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Standalone Claude session */}
      <div class="mx-3 mb-1" style={{ height: '1px', backgroundColor: 'var(--forge-ghost-border)' }} />
      <div class="px-3 pt-1.5 pb-3">
        <button
          class="flex items-center gap-2 w-full px-2.5 py-2 rounded-lg text-left transition-colors"
          style={{ backgroundColor: 'transparent' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--forge-ghost-bg)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent' }}
          onClick={() => { onNewTask('standalone'); onClose() }}
        >
          <span class="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: 'var(--forge-accent)' }} />
          <span class="text-xs font-medium text-forge-text">Claude session</span>
          <span class="flex-1" />
          <span class="text-[10px] text-forge-muted">no project</span>
        </button>
      </div>

    </div>
  )
}

/* ── TabBar ── */

export const TabBar: FunctionComponent<TabBarProps> = ({
  tabs, activeIndex, onActivate, onClose,
  allSessions, openTabKeys, onOpenSession, onNewTask,
}) => {
  const [menuOpen, setMenuOpen] = useState(false)
  const addBtnRef = useRef<HTMLButtonElement>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })

  const toggleMenu = () => {
    if (!menuOpen && addBtnRef.current) {
      const rect = addBtnRef.current.getBoundingClientRect()
      setMenuPos({ top: rect.bottom + 4, left: Math.max(8, rect.right - 300) })
    }
    setMenuOpen(!menuOpen)
  }

  return (
    <div
      class="flex items-center shrink-0 overflow-x-auto px-2 gap-1"
      style={{ borderBottom: '1px solid var(--forge-ghost-border)', backgroundColor: 'var(--forge-bg)', paddingTop: '6px' }}
    >
      {/* Tabs */}
      {tabs.map((session, i) => {
        const isActive = i === activeIndex
        const cfg = TYPE_STYLES[session.type] ?? TYPE_STYLES.task
        return (
          <div
            key={sessionKey(session)}
            class="flex items-center gap-2 px-3.5 py-2 text-xs cursor-pointer shrink-0 transition-all"
            style={{
              backgroundColor: isActive ? 'var(--forge-surface)' : 'transparent',
              borderTop: isActive ? `2px solid ${cfg.color}` : '2px solid transparent',
              borderLeft: isActive ? '1px solid var(--forge-ghost-border)' : '1px solid transparent',
              borderRight: isActive ? '1px solid var(--forge-ghost-border)' : '1px solid transparent',
              borderBottom: 'none',
              borderRadius: '8px 8px 0 0',
              marginBottom: isActive ? '-1px' : '0',
              paddingBottom: isActive ? 'calc(0.5rem + 1px)' : '0.5rem',
              opacity: isActive ? 1 : 0.5,
            }}
            onClick={() => onActivate(i)}
          >
            <span class="text-[9px] font-mono" style={{ opacity: 0.35 }}>{i + 1}</span>
            <span class="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cfg.color }} />
            <span
              class="font-semibold truncate max-w-[140px]"
              style={{ color: isActive ? 'var(--forge-text)' : 'var(--forge-muted)' }}
            >
              {sessionLabel(session)}
            </span>
            <span class="text-[10px] truncate max-w-[90px]" style={{ color: 'var(--forge-muted)', opacity: 0.6 }}>
              {session.project}
            </span>
            <button
              class="ml-0.5 w-5 h-5 flex items-center justify-center rounded-md transition-colors text-[11px]"
              style={{ color: 'var(--forge-muted)', backgroundColor: 'transparent' }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(239,68,68,0.15)';
                (e.currentTarget as HTMLElement).style.color = '#ef4444'
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                (e.currentTarget as HTMLElement).style.color = 'var(--forge-muted)'
              }}
              onClick={(e: Event) => { e.stopPropagation(); onClose(i) }}
              title="Close tab (Cmd+W)"
            >
              ×
            </button>
          </div>
        )
      })}

      {/* Add tab button */}
      {onOpenSession && onNewTask && (
        <button
          ref={addBtnRef}
          class="flex items-center justify-center w-7 h-7 rounded-lg transition-all text-sm shrink-0 ml-1"
          style={{
            color: menuOpen ? 'var(--forge-text)' : 'var(--forge-muted)',
            backgroundColor: menuOpen ? 'var(--forge-surface)' : 'transparent',
            border: menuOpen ? '1px solid var(--forge-ghost-border)' : '1px solid transparent',
          }}
          onMouseEnter={(e) => {
            if (!menuOpen) (e.currentTarget as HTMLElement).style.color = 'var(--forge-text)'
          }}
          onMouseLeave={(e) => {
            if (!menuOpen) (e.currentTarget as HTMLElement).style.color = 'var(--forge-muted)'
          }}
          onClick={toggleMenu}
          title="Open or create tab"
        >
          +
        </button>
      )}

      {/* Menu — rendered as fixed portal to escape overflow clip */}
      {menuOpen && onOpenSession && onNewTask && (
        <AddMenu
          sessions={allSessions ?? []}
          openTabKeys={openTabKeys ?? new Set()}
          onOpenSession={onOpenSession}
          onNewTask={onNewTask}
          onClose={() => setMenuOpen(false)}
          position={menuPos}
        />
      )}
    </div>
  )
}
