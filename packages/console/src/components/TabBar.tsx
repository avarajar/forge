import { type FunctionComponent } from 'preact'
import { useState, useRef, useEffect, useCallback } from 'preact/hooks'
import type { CWSession } from '@forge-dev/core'
import { QUICK_TYPES, quickLabel, sessionKey, sessionLabel } from '../config/types.js'
import { TypeTile } from './TaskCard.js'
import { Dot } from './Dot.js'
import { BackButton, MenuButton } from './PageHeader.js'

interface TabBarProps {
  tabs: CWSession[]
  activeIndex: number
  onActivate: (index: number) => void
  onClose: (index: number) => void
  onBack: () => void
  allSessions: CWSession[]
  openTabKeys: Set<string>
  onOpenSession: (session: CWSession) => void
  onNewTask: (type?: string) => void
}

const menuItem = 'flex items-center w-full text-left cursor-pointer transition-colors duration-140 hover:bg-elev'

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
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [onClose])

  const closed = sessions.filter(s => !openTabKeys.has(sessionKey(s)))

  return (
    <div
      ref={ref}
      class="popover fixed z-[60] flex flex-col"
      style={{
        top: `${position.top}px`, left: `${position.left}px`, width: 'min(320px, calc(100vw - 16px))', maxHeight: '420px', overflowY: 'auto',
        padding: '6px', borderRadius: '14px',
      }}
    >
      <div style={{ padding: '7px 10px 3px', fontSize: '11px', fontWeight: 600, color: 'var(--ink-3)' }}>New</div>
      {QUICK_TYPES.map(t => (
        <button key={t.key} type="button" class={menuItem} style={{ gap: '10px', padding: '7px 10px', borderRadius: '10px', border: 0, background: 'none', color: 'var(--ink)', fontSize: '13px' }}
          onClick={() => { onNewTask(t.key); onClose() }}>
          <TypeTile type={t.sessionType} size={22} radius={7} font={10} />
          <span class="flex-1">{quickLabel(t.key)}</span>
        </button>
      ))}
      {closed.length > 0 && (
        <>
          <div style={{ padding: '9px 10px 3px', fontSize: '11px', fontWeight: 600, color: 'var(--ink-3)' }}>Resume</div>
          {closed.map(s => (
            <button key={sessionKey(s)} type="button" class={menuItem} style={{ gap: '10px', padding: '7px 10px', borderRadius: '10px', border: 0, background: 'none', color: 'var(--ink)', fontSize: '13px' }}
              onClick={() => { onOpenSession(s); onClose() }}>
              <TypeTile type={s.type} size={22} radius={7} font={10} />
              <span class="flex-1 truncate">{sessionLabel(s)}</span>
              <span class="mono truncate" style={{ fontSize: '10.5px', color: 'var(--ink-3)', maxWidth: '110px' }}>{s.project}</span>
            </button>
          ))}
        </>
      )}
    </div>
  )
}

export const TabBar: FunctionComponent<TabBarProps> = ({
  tabs, activeIndex, onActivate, onClose, onBack, allSessions, openTabKeys, onOpenSession, onNewTask,
}) => {
  const [menuOpen, setMenuOpen] = useState(false)
  const addBtnRef = useRef<HTMLButtonElement>(null)
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 })
  const closeMenu = useCallback(() => setMenuOpen(false), [])

  const toggleMenu = () => {
    if (!menuOpen && addBtnRef.current) {
      const rect = addBtnRef.current.getBoundingClientRect()
      setMenuPos({ top: rect.bottom + 6, left: Math.max(8, Math.min(rect.left, window.innerWidth - 328)) })
    }
    setMenuOpen(!menuOpen)
  }

  // the menu renders outside the glass bar: backdrop-filter would contain and clip a fixed child
  return (
    <>
    <div
      class="glass flex items-center shrink-0 overflow-x-auto"
      role="tablist"
      aria-label="Open sessions"
      style={{ gap: '8px', padding: '9px 16px', borderBottom: '1px solid var(--hair)' }}
    >
      <MenuButton />
      <BackButton onClick={onBack} />
      {tabs.map((session, i) => {
        const on = i === activeIndex
        return (
          <div
            key={sessionKey(session)}
            role="tab"
            tabIndex={0}
            aria-selected={on}
            title={i < 5 ? `⌘${i + 1}` : undefined}
            class="flex items-center shrink-0 whitespace-nowrap cursor-pointer transition-all duration-200 ease-spring"
            style={{
              gap: '8px', padding: '6px 11px', borderRadius: '10px', fontSize: '12.5px',
              background: on ? 'var(--card)' : 'transparent',
              border: `1px solid ${on ? 'var(--hair)' : 'transparent'}`,
              boxShadow: on ? 'var(--shadow-s)' : 'none',
            }}
            onClick={() => onActivate(i)}
            onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onActivate(i) } }}
          >
            <Dot size={6} live={session.status === 'active'} />
            <span style={{ fontWeight: 600, color: on ? 'var(--ink)' : 'var(--ink-2)' }}>{sessionLabel(session)}</span>
            <span class="mono truncate" style={{ fontSize: '11px', color: 'var(--ink-3)', maxWidth: '110px' }}>{session.project}</span>
            <button
              type="button"
              class="grid place-items-center cursor-pointer text-ink3 hover:text-red"
              style={{ border: 0, background: 'none', padding: '0 1px' }}
              onClick={(e: Event) => { e.stopPropagation(); onClose(i) }}
              title="Close tab (⌘W)"
              aria-label={`Close ${sessionLabel(session)}`}
            >
              <span class="i-lucide-x" style={{ width: '13px', height: '13px' }} />
            </button>
          </div>
        )
      })}

      <button
        ref={addBtnRef}
        type="button"
        class="grid place-items-center shrink-0 cursor-pointer text-ink2 hover:text-ink"
        style={{ width: '26px', height: '26px', borderRadius: '8px', border: '1px solid var(--hair)', background: 'var(--card)' }}
        onClick={toggleMenu}
        aria-expanded={menuOpen}
        title="Open or create a tab"
        aria-label="Open or create a tab"
      >
        <span class="i-lucide-plus" style={{ width: '14px', height: '14px' }} />
      </button>
    </div>

      {menuOpen && (
        <AddMenu
          sessions={allSessions}
          openTabKeys={openTabKeys}
          onOpenSession={onOpenSession}
          onNewTask={onNewTask}
          onClose={closeMenu}
          position={menuPos}
        />
      )}
    </>
  )
}
