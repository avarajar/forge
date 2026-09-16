import { type FunctionComponent, type ComponentChildren } from 'preact'
import { useState } from 'preact/hooks'

interface AccordionSectionProps {
  title: string
  defaultOpen?: boolean
  children: ComponentChildren
}

export const AccordionSection: FunctionComponent<AccordionSectionProps> = ({
  title,
  defaultOpen = false,
  children
}) => {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div style={{ borderBottom: '1px solid var(--hair)' }}>
      <button
        class="flex items-center justify-between w-full px-3 py-2.5 cursor-pointer transition-colors text-ink3 hover:text-ink"
        style={{ fontSize: '11px', fontWeight: 600, border: 0, background: 'none' }}
        onClick={() => setOpen(!open)}
      >
        <span>{title}</span>
        <span
          class="transition-transform"
          style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
        >
          <span class="i-lucide-chevron-right" />
        </span>
      </button>
      {open && (
        <div class="px-3 pb-3">
          {children}
        </div>
      )}
    </div>
  )
}
