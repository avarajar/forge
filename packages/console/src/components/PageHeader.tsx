import { type FunctionComponent, type ComponentChildren } from 'preact'

export const PageHeader: FunctionComponent<{
  title: ComponentChildren
  subtitle?: ComponentChildren
  leading?: ComponentChildren
  children?: ComponentChildren
  sticky?: boolean
  size?: 'lg' | 'md'
}> = ({ title, subtitle, leading, children, sticky = true, size = 'lg' }) => (
  <header
    class={`glass flex items-center flex-wrap shrink-0 ${sticky ? 'sticky top-0 z-20' : ''}`}
    style={{ gap: '12px 14px', padding: '12px 22px', borderBottom: '1px solid var(--hair)' }}
  >
    {leading}
    <div class="min-w-0">
      <h1 class="truncate" style={{ fontSize: size === 'lg' ? '20px' : '18px', fontWeight: 700, letterSpacing: '-0.02em' }}>{title}</h1>
      {subtitle && <p class="truncate" style={{ marginTop: '1px', fontSize: '12.5px', color: 'var(--ink-2)' }}>{subtitle}</p>}
    </div>
    <span style={{ flex: '1 1 40px' }} />
    {children && <div class="flex items-center flex-wrap" style={{ gap: '7px' }}>{children}</div>}
  </header>
)

export const BackButton: FunctionComponent<{ label?: string; onClick: () => void }> = ({ label = 'Tasks', onClick }) => (
  <button
    type="button"
    class="inline-flex items-center gap-1 shrink-0 whitespace-nowrap cursor-pointer transition-all duration-180 ease-spring text-ink2 hover:text-ink"
    style={{ padding: '5px 10px', borderRadius: '8px', border: '1px solid var(--hair)', background: 'var(--card)', fontSize: '12.5px' }}
    onClick={onClick}
  >
    <span aria-hidden="true">←</span> {label}
  </button>
)
