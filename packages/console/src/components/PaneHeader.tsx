import { type FunctionComponent, type ComponentChildren } from 'preact'

export const PaneHeader: FunctionComponent<{ title: string; sub?: string; children?: ComponentChildren }> = ({ title, sub, children }) => (
  <div class="glass flex items-center flex-wrap shrink-0" style={{ gap: '10px', padding: '12px 20px', borderBottom: '1px solid var(--hair)' }}>
    <div class="min-w-0">
      <h2 style={{ fontSize: '17px', fontWeight: 650, letterSpacing: '-0.015em', overflowWrap: 'anywhere' }}>{title}</h2>
      {sub && <p class="mono" style={{ marginTop: '1px', fontSize: '11.5px', color: 'var(--ink-3)', overflowWrap: 'anywhere' }}>{sub}</p>}
    </div>
    <span style={{ flex: '1 1 40px' }} />
    {children}
  </div>
)
