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
    <div class="border-b" style={{ borderColor: 'var(--forge-ghost-border)' }}>
      <button
        class="flex items-center justify-between w-full px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-forge-muted hover:text-forge-text transition-colors"
        onClick={() => setOpen(!open)}
      >
        <span>{title}</span>
        <span
          class="transition-transform"
          style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
        >
          ▸
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
