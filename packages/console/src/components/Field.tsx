import { type FunctionComponent, type ComponentChildren } from 'preact'

export const labelStyle = { fontSize: '12px', color: 'var(--ink-2)' }

// a label above one control; the control carries class="field"
// plain skips the label element, for custom controls that open popovers
export const Field: FunctionComponent<{ label: ComponentChildren; plain?: boolean; children: ComponentChildren }> = ({ label, plain, children }) => {
  const Tag = plain ? 'div' : 'label'
  return (
    <Tag class="flex flex-col min-w-0" style={{ gap: '5px' }}>
      <span style={labelStyle}>{label}</span>
      {children}
    </Tag>
  )
}
