import { type FunctionComponent } from 'preact'

interface Tab {
  id: string
  label: string
  icon?: string
}

interface TabsProps {
  tabs: Tab[]
  active: string
  onChange: (id: string) => void
}

export const Tabs: FunctionComponent<TabsProps> = ({ tabs, active, onChange }) => {
  return (
    <div class="flex border-b border-forge-border mb-6">
      {tabs.map(tab => (
        <button
          key={tab.id}
          class={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px
            ${active === tab.id
              ? 'border-forge-accent text-forge-accent'
              : 'border-transparent text-forge-muted hover:text-forge-text hover:border-forge-border'}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.icon && <span class="mr-2">{tab.icon}</span>}
          {tab.label}
        </button>
      ))}
    </div>
  )
}
