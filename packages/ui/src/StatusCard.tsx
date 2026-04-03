import { type FunctionComponent } from 'preact'

interface StatusCardProps {
  icon: string
  label: string
  value: string | number
  trend?: string
  status: 'good' | 'warn' | 'bad' | 'neutral'
}

const statusColors = {
  good: 'var(--forge-success)',
  warn: 'var(--forge-warning)',
  bad: 'var(--forge-error)',
  neutral: 'var(--forge-muted)'
}

export const StatusCard: FunctionComponent<StatusCardProps> = ({
  icon, label, value, trend, status
}) => {
  return (
    <div class={`p-4 rounded-lg bg-forge-surface border border-forge-border relative overflow-hidden`}>
      <div class="flex items-center gap-2 mb-2 text-sm text-forge-muted">
        <span>{icon}</span>
        <span>{label}</span>
      </div>
      <div class="text-2xl font-bold">{value}</div>
      {trend && (
        <div class={`text-xs mt-1 ${trend.startsWith('-') ? 'text-forge-error' : 'text-forge-success'}`}>
          {trend}
        </div>
      )}
      <div
        class="absolute bottom-0 left-0 right-0 h-1"
        style={{ backgroundColor: statusColors[status] }}
      />
    </div>
  )
}
