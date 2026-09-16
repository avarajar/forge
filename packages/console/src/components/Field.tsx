import { type FunctionComponent, type ComponentChildren } from 'preact'

export const labelStyle = { fontSize: '12px', color: 'var(--ink-2)' }

// a label above one control; the control carries class="field"
export const Field: FunctionComponent<{ label: ComponentChildren; children: ComponentChildren }> = ({ label, children }) => (
  <label class="flex flex-col min-w-0" style={{ gap: '5px' }}>
    <span style={labelStyle}>{label}</span>
    {children}
  </label>
)
