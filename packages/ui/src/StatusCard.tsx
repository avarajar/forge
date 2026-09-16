import { type FunctionComponent } from 'preact'

interface StatusCardProps {
  icon: string
  label: string
  value: string | number
  trend?: string
  status: 'good' | 'warn' | 'bad' | 'neutral'
}

const statusColors = {
  good: 'var(--green)',
  warn: 'var(--orange)',
  bad: 'var(--red)',
  neutral: 'var(--ink-3)'
}

export const StatusCard: FunctionComponent<StatusCardProps> = ({
  icon, label, value, trend, status
}) => {
  return (
    <div class="relative overflow-hidden"
      style={{ padding: '10px 12px', borderRadius: '13px', background: 'var(--card)', border: '1px solid var(--hair)', boxShadow: 'var(--shadow-s)' }}>
      <div class="flex items-center gap-2" style={{ fontSize: '11.5px', color: 'var(--ink-2)' }}>
        <span>{icon}</span>
        <span>{label}</span>
      </div>
      <div class="mono" style={{ fontSize: '19px', fontWeight: 650, marginTop: '2px' }}>{value}</div>
      {trend && (
        <div class="mono"
          style={{ fontSize: '11.5px', marginTop: '2px', color: trend.startsWith('-') ? 'var(--red)' : 'var(--green)' }}>
          {trend}
        </div>
      )}
      <div
        class="absolute bottom-0 left-0 right-0 h-0.5"
        style={{ backgroundColor: statusColors[status] }}
      />
    </div>
  )
}
