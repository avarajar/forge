import { type FunctionComponent } from 'preact'

interface Tab {
  id: string
  label: string
  count?: number | string
  disabled?: boolean
  // an icon class shown in place of the label, which stays as the accessible name
  icon?: string
}

interface TabsProps {
  tabs: Tab[]
  active: string
  onChange: (id: string) => void
  // stretch the options across the track
  fill?: boolean
  size?: 'md' | 'sm' | 'xs'
  label?: string
}

export const Tabs: FunctionComponent<TabsProps> = ({ tabs, active, onChange, fill, size = 'md', label }) => {
  const sm = size !== 'md'
  const xs = size === 'xs'
  return (
    <div
      role="tablist"
      aria-label={label}
      class={`${fill ? 'flex' : 'inline-flex'} max-w-full overflow-x-auto`}
      style={{ padding: '3px', borderRadius: 'var(--r-md)', background: 'var(--well)', boxShadow: 'var(--inset-s)' }}
    >
      {tabs.map(tab => {
        const on = active === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={on}
            disabled={tab.disabled}
            aria-label={tab.icon ? tab.label : undefined}
            title={tab.icon ? tab.label : undefined}
            class={`flex items-center justify-center gap-1.5 whitespace-nowrap transition-all duration-200 ease-spring ${fill ? 'flex-1' : ''} ${tab.disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
            style={{
              padding: tab.icon ? '5px 9px' : xs ? '4px 0' : fill ? (sm ? '5px 6px' : '7px 8px') : (sm ? '5px 11px' : '6px 12px'),
              border: 0,
              borderRadius: 'var(--r-sm)',
              fontSize: xs ? '11px' : sm ? '12px' : '12.5px',
              fontWeight: 600,
              background: on ? 'var(--seg-on, var(--card))' : 'transparent',
              color: on ? 'var(--ink)' : 'var(--ink-2)',
              boxShadow: on ? 'var(--lit), var(--shadow-s)' : 'none',
            }}
            onClick={() => onChange(tab.id)}
          >
            {tab.icon ? <span class={tab.icon} aria-hidden="true" style={{ width: '14px', height: '14px' }} /> : tab.label}
            {tab.count !== undefined && (
              <span class="mono num" style={{ fontSize: '11px', fontWeight: 400, color: 'var(--ink-3)' }}>{tab.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
