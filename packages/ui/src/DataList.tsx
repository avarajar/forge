import { type FunctionComponent, type ComponentChildren } from 'preact'
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

export const DataList: FunctionComponent<DataListProps> = ({ items, loading, onItemClick }) => {
  if (loading) {
    return (
      <div class="space-y-2">
        {[1, 2, 3].map(i => (
          <div key={i} class="h-16 rounded-lg bg-forge-surface animate-pulse" />
        ))}
      </div>
    )
  }

  if (items.length === 0) return null

  return (
    <div class="space-y-1">
      {items.map(item => (
        <div
          key={item.id}
          class={`flex items-center justify-between p-3 rounded-lg bg-forge-surface border border-forge-border ${onItemClick ? 'cursor-pointer hover:border-forge-accent/40' : ''}`}
          onClick={onItemClick ? () => onItemClick(item.id) : undefined}
        >
          <div class="min-w-0 flex-1">
            <div class="font-medium text-sm truncate">{item.title}</div>
            {item.subtitle && (
              <div class="text-xs text-forge-muted mt-0.5 truncate">{item.subtitle}</div>
            )}
          </div>
          <div class="flex items-center gap-2 ml-3">
            {item.badge && (
              <Badge label={item.badge.label} color={item.badge.color} variant="outline" />
            )}
            {item.trailing}
          </div>
        </div>
      ))}
    </div>
  )
}
