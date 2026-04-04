import { type FunctionComponent } from 'preact'
import type { CWSession } from '@forge-dev/core'

const TYPE_COLORS: Record<string, string> = {
  task: '#d97706',
  review: '#2563eb',
}

interface TabBarProps {
  tabs: CWSession[]
  activeIndex: number
  onActivate: (index: number) => void
  onClose: (index: number) => void
}

const tabKey = (s: CWSession) => `${s.project}::${s.task ?? s.pr}`
const tabLabel = (s: CWSession) => s.type === 'review' ? `PR #${s.pr}` : (s.task ?? 'unknown')

export const TabBar: FunctionComponent<TabBarProps> = ({ tabs, activeIndex, onActivate, onClose }) => {
  if (tabs.length === 0) return null

  return (
    <div
      class="flex items-center shrink-0 overflow-x-auto px-2 gap-0.5"
      style={{ borderBottom: '1px solid var(--forge-ghost-border)', backgroundColor: 'var(--forge-surface)' }}
    >
      {tabs.map((session, i) => {
        const isActive = i === activeIndex
        const color = TYPE_COLORS[session.type] ?? TYPE_COLORS.task
        return (
          <div
            key={tabKey(session)}
            class="flex items-center gap-1.5 px-3 py-2 text-xs cursor-pointer shrink-0 border-b-2 transition-colors"
            style={{
              borderBottomColor: isActive ? color : 'transparent',
              color: isActive ? 'var(--forge-text)' : 'var(--forge-muted)',
            }}
            onClick={() => onActivate(i)}
          >
            <span class="font-medium truncate max-w-[120px]">{tabLabel(session)}</span>
            <span class="text-[10px] opacity-60 truncate max-w-[80px]">({session.project})</span>
            <button
              class="ml-1 w-4 h-4 flex items-center justify-center rounded hover:bg-forge-surface text-forge-muted hover:text-forge-text transition-colors text-[10px]"
              onClick={(e: Event) => { e.stopPropagation(); onClose(i) }}
              title="Close tab"
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}
