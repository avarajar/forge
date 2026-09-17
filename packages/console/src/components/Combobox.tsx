import { type FunctionComponent } from 'preact'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { useAutoFocus } from '../hooks/useAutoFocus.js'

export interface ComboOption { value: string; label: string; group?: string }

interface ComboboxProps {
  label: string
  value: string
  options: ComboOption[]
  onChange: (value: string) => void
  // shown on the trigger when the value matches no option
  placeholder?: string
  size?: 'sm' | 'md'
  width?: string
}

const SearchList: FunctionComponent<{
  options: ComboOption[]
  value: string
  label: string
  onPick: (value: string) => void
  onClose: () => void
}> = ({ options, value, label, onPick, onClose }) => {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useAutoFocus<HTMLInputElement>()
  const listRef = useRef<HTMLDivElement>(null)
  const q = query.trim().toLowerCase()
  const matches = useMemo(() => options.filter(o => !q || o.label.toLowerCase().includes(q) || o.group?.toLowerCase().includes(q)), [options, q])

  useEffect(() => {
    const start = matches.findIndex(o => o.value === value)
    setActive(start >= 0 && !q ? start : 0)
  }, [q])

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, matches.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); const pick = matches[active]; if (pick) onPick(pick.value) }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose() }
  }

  let lastGroup: string | undefined
  return (
    <div
      class="popover absolute right-0 top-full z-40 flex flex-col"
      style={{ marginTop: '6px', width: '260px', maxHeight: '320px', padding: '6px', borderRadius: '12px', background: 'var(--card-2)', backdropFilter: 'none', WebkitBackdropFilter: 'none' }}
      onKeyDown={onKeyDown}
    >
      <label class="relative block shrink-0">
        <span class="i-lucide-search absolute pointer-events-none" style={{ left: '9px', top: '9px', width: '12px', height: '12px', color: 'var(--ink-3)' }} />
        <input
          ref={inputRef}
          type="search"
          class="field"
          role="combobox"
          aria-expanded="true"
          aria-label={`Search ${label.toLowerCase()}`}
          placeholder={`Search ${label.toLowerCase()}s`}
          value={query}
          style={{ height: '30px', padding: '0 8px 0 27px', borderRadius: '8px', fontSize: '12.5px', background: 'var(--elev)' }}
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
        />
      </label>
      <div ref={listRef} role="listbox" aria-label={label} class="overflow-y-auto min-h-0" style={{ marginTop: '6px' }}>
        {matches.length === 0 && <p style={{ padding: '8px 10px', fontSize: '12.5px', color: 'var(--ink-3)' }}>No match for “{query.trim()}”.</p>}
        {matches.map((o, i) => {
          const header = o.group && o.group !== lastGroup ? o.group : null
          lastGroup = o.group
          const on = i === active
          const selected = o.value === value
          return (
            <div key={o.value || '__empty'}>
              {header && <div style={{ padding: '7px 9px 3px', fontSize: '11px', fontWeight: 600, color: 'var(--ink-3)' }}>{header}</div>}
              <button
                type="button"
                role="option"
                aria-selected={selected}
                data-active={on}
                tabIndex={-1}
                class="flex items-center w-full text-left cursor-pointer"
                style={{ gap: '8px', padding: '6px 9px', borderRadius: '8px', border: 0, background: on ? 'var(--elev)' : 'transparent', color: 'var(--ink)', fontSize: '13px' }}
                onMouseMove={() => { if (!on) setActive(i) }}
                onClick={() => onPick(o.value)}
              >
                <span class="flex-1 truncate" style={{ fontWeight: selected ? 600 : 400, color: o.value ? 'var(--ink)' : 'var(--ink-2)' }}>{o.label}</span>
                {selected && <span class="i-lucide-check shrink-0" style={{ width: '13px', height: '13px', color: 'var(--blue)' }} />}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export const Combobox: FunctionComponent<ComboboxProps> = ({ label, value, options, onChange, placeholder = 'Choose…', size = 'sm', width }) => {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = options.find(o => o.value === value)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const sm = size === 'sm'
  return (
    <div ref={ref} class="relative" style={{ width }}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        class="field flex items-center text-left cursor-pointer"
        style={sm
          ? { width: width ?? 'auto', minWidth: '130px', maxWidth: '200px', height: '30px', padding: '0 9px 0 10px', borderRadius: '9px', fontSize: '12.5px', background: 'var(--bg-2)', gap: '6px' }
          : { gap: '6px', boxShadow: 'var(--shadow-s)' }}
        onClick={() => setOpen(o => !o)}
        onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true) } }}
      >
        <span class="flex-1 truncate" style={{ color: current && current.value ? 'var(--ink)' : 'var(--ink-2)' }}>{current?.label ?? placeholder}</span>
        <span class="i-lucide-chevrons-up-down shrink-0" style={{ width: '12px', height: '12px', color: 'var(--ink-3)' }} />
      </button>
      {open && (
        <SearchList
          options={options}
          value={value}
          label={label}
          onPick={(v) => { onChange(v); setOpen(false) }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}

// project options grouped by account, accounts in the given order
export const projectOptions = (projects: Record<string, { account: string }>, accounts: string[], names = Object.keys(projects)): ComboOption[] => {
  const order = (a: string) => { const i = accounts.indexOf(a); return i < 0 ? accounts.length : i }
  return [...names]
    .sort((a, b) => order(projects[a].account) - order(projects[b].account) || a.localeCompare(b))
    .map(name => ({ value: name, label: name, group: projects[name].account }))
}
