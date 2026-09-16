import { type FunctionComponent, type ComponentChildren } from 'preact'
import { useEffect } from 'preact/hooks'

interface ModalProps {
  open: boolean
  title: string
  onClose: () => void
  onConfirm?: () => void
  confirmLabel?: string
  footer?: ComponentChildren
  width?: number
  children: ComponentChildren
}

export const CloseButton: FunctionComponent<{ onClick: () => void; label?: string }> = ({ onClick, label = 'Close' }) => (
  <button
    type="button"
    aria-label={label}
    class="grid place-items-center shrink-0 cursor-pointer transition-all duration-180 ease-spring hover:text-ink"
    style={{ width: '26px', height: '26px', borderRadius: '50%', border: '1px solid var(--hair)', background: 'var(--card)', color: 'var(--ink-2)' }}
    onClick={onClick}
  >
    <span class="i-lucide-x" style={{ width: '13px', height: '13px' }} />
  </button>
)

export const Modal: FunctionComponent<ModalProps> = ({
  open, title, onClose, onConfirm, confirmLabel = 'Confirm', footer, width = 540, children
}) => {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const actions = footer ?? (onConfirm !== undefined || confirmLabel !== 'Confirm' ? (
    <>
      <span class="flex-1" />
      <button
        type="button"
        class="cursor-pointer transition-all duration-180 ease-spring hover:-translate-y-px hover:shadow-m"
        style={{ padding: '7px 13px', borderRadius: '9px', border: '1px solid var(--hair)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px', boxShadow: 'var(--shadow-s)' }}
        onClick={onClose}
      >Cancel</button>
      <button
        type="button"
        disabled={!onConfirm}
        class={onConfirm ? 'cursor-pointer transition-all duration-180 ease-spring hover:-translate-y-px hover:brightness-106' : 'cursor-not-allowed'}
        style={onConfirm
          ? { padding: '7px 15px', borderRadius: '9px', border: 0, background: 'linear-gradient(180deg, var(--blue-2), var(--blue))', color: '#fff', fontSize: '13px', fontWeight: 600, boxShadow: 'var(--shadow-m)' }
          : { padding: '7px 15px', borderRadius: '9px', border: 0, background: 'var(--elev)', color: 'var(--ink-3)', fontSize: '13px', fontWeight: 600, opacity: 0.8 }}
        onClick={onConfirm}
      >{confirmLabel}</button>
    </>
  ) : null)

  return (
    <div
      class="fixed inset-0 z-[55] flex items-start justify-center overflow-auto"
      style={{ background: 'rgba(0,0,0,.42)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', padding: '56px 16px 16px' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        class="flex flex-col overflow-hidden"
        style={{
          width: `min(${width}px, 100%)`, maxHeight: 'calc(100vh - 72px)', borderRadius: '18px',
          background: 'var(--bg-2)', border: '1px solid var(--hair-2)', boxShadow: 'var(--shadow-l)',
          animation: 'popIn .26s var(--ease) both',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div class="flex items-center gap-2.5 shrink-0" style={{ padding: '14px 18px', borderBottom: '1px solid var(--hair)' }}>
          <h2 style={{ fontSize: '17px', fontWeight: 700, letterSpacing: '-0.02em' }}>{title}</h2>
          <span class="flex-1" />
          <CloseButton onClick={onClose} />
        </div>
        <div class="overflow-auto min-h-0" style={{ padding: '16px 18px' }}>{children}</div>
        {actions && (
          <div class="flex items-center gap-2.5 shrink-0" style={{ padding: '13px 18px', borderTop: '1px solid var(--hair)' }}>
            {actions}
          </div>
        )}
      </div>
    </div>
  )
}
