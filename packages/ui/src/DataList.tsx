import { type FunctionComponent, type ComponentChildren } from 'preact'
import { useState } from 'preact/hooks'
import { Badge } from './Badge.js'

export interface DataListItem {
  id: string
  title: string
  subtitle?: string
  badge?: { label: string; color?: string }
  trailing?: ComponentChildren
}

interface DataListProps {
  items: DataListItem[]
  loading?: boolean
  onItemClick?: (id: string) => void
}

const DataListRow: FunctionComponent<{
  item: DataListItem
  onItemClick?: (id: string) => void
}> = ({ item, onItemClick }) => {
  const [hovered, setHovered] = useState(false)
  const borderColor = onItemClick && hovered
    ? 'var(--hair-2)'
    : 'var(--hair)'

  return (
    <div
      class={`flex items-center justify-between transition-all duration-180 ease-spring ${onItemClick ? 'cursor-pointer' : ''}`}
      style={{ padding: '11px 15px', borderRadius: '12px', background: 'var(--card)', border: `1px solid ${borderColor}`, boxShadow: 'var(--shadow-s)' }}
      onMouseEnter={onItemClick ? () => setHovered(true) : undefined}
      onMouseLeave={onItemClick ? () => setHovered(false) : undefined}
      onClick={onItemClick ? () => onItemClick(item.id) : undefined}
    >
      <div class="min-w-0 flex-1">
        <div class="truncate" style={{ fontSize: '14px', fontWeight: 600 }}>{item.title}</div>
        {item.subtitle && (
          <div class="truncate" style={{ fontSize: '12px', color: 'var(--ink-2)', marginTop: '2px' }}>{item.subtitle}</div>
        )}
      </div>
      <div class="flex items-center gap-2 ml-3">
        {item.badge && (
          <Badge label={item.badge.label} color={item.badge.color} variant="tint" />
        )}
        {item.trailing}
      </div>
    </div>
  )
}

export const DataList: FunctionComponent<DataListProps> = ({ items, loading, onItemClick }) => {
  if (loading) {
    return (
      <div class="space-y-2">
        {[1, 2, 3].map(i => (
          <div key={i} class="h-16 animate-pulse" style={{ borderRadius: '12px', background: 'var(--card)' }} />
        ))}
      </div>
    )
  }

  if (items.length === 0) return null

  return (
    <div class="space-y-1">
      {items.map(item => (
        <DataListRow key={item.id} item={item} onItemClick={onItemClick} />
      ))}
    </div>
  )
}
