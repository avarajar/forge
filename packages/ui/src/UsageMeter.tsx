import { type FunctionComponent } from 'preact'

// mirrors UsageSeverity in @forge-dev/core, which this package does not depend on
type Severity = 'normal' | 'warning' | 'critical'

export interface UsageBar {
  label: string
  percent: number
  severity: Severity
  scope: string | null
  reset: string | null
}

interface UsageMeterProps {
  bars: UsageBar[]
  size?: 'sm' | 'md'
}

// a neutral fill until a limit gets close, so blue stays the action colour
const TOKEN: Record<Severity, string> = { normal: '--ink-2', warning: '--orange', critical: '--red' }

const Bar: FunctionComponent<{ bar: UsageBar; size: 'sm' | 'md' }> = ({ bar, size }) => {
  const token = TOKEN[bar.severity]
  const color = `var(${token})`
  const small = size === 'sm'
  const width = Math.max(0, Math.min(100, bar.percent))
  return (
    <span class="flex items-center w-full" style={{ gap: small ? '6px' : '9px' }}>
      <span class="mono num shrink-0 text-right" style={{ width: small ? '28px' : '32px', fontSize: '11px', color: 'var(--ink-3)' }}>{bar.label}</span>
      <span class="relative block flex-1 overflow-hidden" style={{ height: small ? '4px' : '6px', borderRadius: '99px', background: 'var(--well)', boxShadow: small ? 'none' : 'var(--inset-s)' }}>
        <span class="block h-full" style={{ width: `${width}%`, borderRadius: '99px', background: color, transition: 'width .6s var(--ease)' }} />
      </span>
      <span class="mono num shrink-0 text-right" style={{ width: small ? '30px' : '36px', fontSize: '11px', fontWeight: 600, color: bar.severity === 'normal' ? 'var(--ink-2)' : `var(${token}-ink, ${color})` }}>
        {Math.round(bar.percent)}%
      </span>
      {/* always rendered, so every track on a card ends at the same x */}
      {!small && (
        <span class="shrink-0 text-right whitespace-nowrap" style={{ width: '112px', fontSize: '11px', color: 'var(--ink-3)' }}>{bar.reset ?? '—'}</span>
      )}
    </span>
  )
}

export const UsageMeter: FunctionComponent<UsageMeterProps> = ({ bars, size = 'md' }) => (
  <span class="flex flex-col w-full" style={{ gap: size === 'sm' ? '4px' : '6px' }}>
    {bars.map((bar, i) => (
      <span key={i} class="flex flex-col w-full" style={{ gap: '2px' }}>
        <Bar bar={bar} size={size} />
        {bar.scope && size === 'md' && (
          <span style={{ paddingLeft: '39px', fontSize: '11px', color: 'var(--ink-3)' }}>{bar.scope}</span>
        )}
      </span>
    ))}
  </span>
)
