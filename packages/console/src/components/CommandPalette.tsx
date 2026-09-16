import { type FunctionComponent } from 'preact'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { CWSession } from '@forge-dev/core'
import { useAutoFocus } from '../hooks/useAutoFocus.js'
import { getTypeStyle, sessionKey, sessionLabel, soft } from '../config/types.js'

export interface PaletteItem {
  id: string
  label: string
  hint: string
  glyph: string
  token: string | null
  run: () => void
}

interface CommandPaletteProps {
  openTabs: CWSession[]
  sessions: CWSession[]
  projects: string[]
  commands: PaletteItem[]
  onOpenSession: (s: CWSession) => void
  onSelectProject: (p: string) => void
  onClose: () => void
}

const sessionItem = (s: CWSession, hint: string, onOpen: (s: CWSession) => void): PaletteItem => {
  const style = getTypeStyle(s.type)
  return { id: sessionKey(s), label: `${sessionLabel(s)} · ${s.project}`, hint, glyph: style.glyph, token: style.token, run: () => onOpen(s) }
}

export const CommandPalette: FunctionComponent<CommandPaletteProps> = ({
  openTabs, sessions, projects, commands, onOpenSession, onSelectProject, onClose,
}) => {
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useAutoFocus<HTMLInputElement>()

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const match = (item: PaletteItem) => !q || item.label.toLowerCase().includes(q)
    const openKeys = new Set(openTabs.map(sessionKey))
    const live = openTabs.map((s, i) => sessionItem(s, i < 5 ? `⌘${i + 1}` : 'open', onOpenSession))
    const tasks = sessions.filter(s => s.status === 'active' && !openKeys.has(sessionKey(s))).map(s => sessionItem(s, 'resume', onOpenSession))
    const projectItems = q ? projects.map(p => ({ id: `project:${p}`, label: p, hint: 'project', glyph: 'P', token: '--green', run: () => onSelectProject(p) })) : []
    return [
      { name: 'Live now', items: live.filter(match) },
      { name: 'Tasks', items: tasks.filter(match).slice(0, q ? 12 : 6) },
      { name: 'Projects', items: projectItems.filter(match).slice(0, 6) },
      { name: 'Commands', items: commands.filter(match) },
    ].filter(g => g.items.length > 0)
  }, [query, openTabs, sessions, projects, commands, onOpenSession, onSelectProject])

  const flat = groups.flatMap(g => g.items)
  const current = Math.min(highlight, flat.length - 1)

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [current])

  const activate = (item: PaletteItem | undefined) => {
    if (!item) return
    onClose()
    item.run()
  }

  // the listener stays registered once and reads the latest list through a ref
  const latest = useRef({ flat, current, activate })
  latest.current = { flat, current, activate }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { flat: items, current: at, activate: run } = latest.current
      const n = items.length
      if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(i => n ? (Math.min(i, n - 1) + 1) % n : 0) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(i => n ? (Math.min(i, n - 1) - 1 + n) % n : 0) }
      else if (e.key === 'Enter') { e.preventDefault(); run(items[at]) }
      else if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  let index = -1
  return (
    <div
      class="fixed inset-0 z-[60] flex justify-center items-start overflow-auto"
      style={{ background: 'rgba(0,0,0,.42)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', padding: '88px 16px 16px' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        class="flex flex-col overflow-hidden"
        style={{
          width: 'min(560px, 100%)', maxHeight: 'calc(100vh - 104px)', borderRadius: '18px',
          background: 'var(--glass)', backdropFilter: 'blur(30px) saturate(180%)', WebkitBackdropFilter: 'blur(30px) saturate(180%)',
          border: '1px solid var(--hair-2)', boxShadow: 'var(--shadow-l)', animation: 'popIn .26s var(--ease) both',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-activedescendant={flat[current] ? `palette-${flat[current].id}` : undefined}
          aria-label="Search tasks, projects and commands"
          class="shrink-0"
          style={{ height: '48px', padding: '0 16px', border: 0, borderBottom: '1px solid var(--hair)', background: 'transparent', color: 'var(--ink)', fontSize: '16px', outline: 'none' }}
          placeholder="Task, project, skill or command…"
          value={query}
          onInput={(e) => { setQuery((e.target as HTMLInputElement).value); setHighlight(0) }}
        />
        <div id="palette-list" role="listbox" ref={listRef} class="overflow-auto" style={{ padding: '6px' }}>
          {flat.length === 0 && <p style={{ padding: '14px 10px', fontSize: '13px', color: 'var(--ink-2)' }}>Nothing matches “{query}”.</p>}
          {groups.map(g => (
            <div key={g.name} role="group" aria-label={g.name}>
              <div style={{ padding: '7px 10px 3px', fontSize: '11px', fontWeight: 600, color: 'var(--ink-3)' }}>{g.name}</div>
              {g.items.map(item => {
                index += 1
                const i = index
                const on = i === current
                return (
                  <button
                    key={item.id}
                    id={`palette-${item.id}`}
                    type="button"
                    role="option"
                    aria-selected={on}
                    data-active={on}
                    tabIndex={-1}
                    class="flex items-center w-full text-left cursor-pointer"
                    style={{ gap: '10px', padding: '8px 10px', borderRadius: '10px', border: 0, background: on ? 'var(--elev)' : 'transparent', color: 'var(--ink)', fontSize: '13px', transition: 'background .14s' }}
                    onMouseMove={() => { if (!on) setHighlight(i) }}
                    onClick={() => activate(item)}
                  >
                    <span class="grid place-items-center shrink-0" style={{ width: '22px', height: '22px', borderRadius: '7px', fontSize: '10px', fontWeight: 700, background: item.token ? soft(item.token) : 'var(--elev)', color: item.token ? `var(${item.token})` : 'var(--ink-2)' }}>
                      {item.glyph}
                    </span>
                    <span class="flex-1 min-w-0 truncate">{item.label}</span>
                    <span class="mono shrink-0" style={{ fontSize: '10.5px', color: 'var(--ink-3)' }}>{item.hint}</span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
        <div class="flex shrink-0" style={{ gap: '14px', padding: '8px 14px', borderTop: '1px solid var(--hair)' }}>
          {['↑↓ move', '↵ open', 'esc close'].map(t => <span key={t} class="mono" style={{ fontSize: '10.5px', color: 'var(--ink-3)' }}>{t}</span>)}
        </div>
      </div>
    </div>
  )
}
