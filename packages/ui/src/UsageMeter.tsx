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

const TOKEN: Record<Severity, string> = { normal: '--blue', warning: '--orange', critical: '--red' }

const Bar: FunctionComponent<{ bar: UsageBar; size: 'sm' | 'md' }> = ({ bar, size }) => {
  const color = `var(${TOKEN[bar.severity]})`
  const small = size === 'sm'
  const width = Math.max(0, Math.min(100, bar.percent))
  return (
    <span class="flex items-center w-full" style={{ gap: small ? '6px' : '9px' }}>
      <span class="mono shrink-0 text-right" style={{ width: small ? '28px' : '32px', fontSize: small ? '10px' : '11.5px', color: 'var(--ink-3)' }}>{bar.label}</span>
      <span class="relative block flex-1 overflow-hidden" style={{ height: small ? '4px' : '6px', borderRadius: '99px', background: 'var(--elev)' }}>
        <span class="block h-full" style={{ width: `${width}%`, borderRadius: '99px', background: color, transition: 'width .6s var(--ease)' }} />
      </span>
      <span class="mono shrink-0 text-right" style={{ width: small ? '30px' : '36px', fontSize: small ? '10px' : '11.5px', fontWeight: 600, color: bar.severity === 'normal' ? 'var(--ink-2)' : color }}>
        {Math.round(bar.percent)}%
      </span>
      {!small && bar.reset && (
        <span class="shrink-0 whitespace-nowrap" style={{ fontSize: '11px', color: 'var(--ink-3)' }}>{bar.reset}</span>
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
          <span style={{ paddingLeft: '39px', fontSize: '10.5px', color: 'var(--ink-3)' }}>{bar.scope}</span>
        )}
      </span>
    ))}
  </span>
)
