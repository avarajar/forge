import { type FunctionComponent, type ComponentChildren } from 'preact'
import { useLayoutEffect } from 'preact/hooks'
import { CloseButton } from './Modal.js'

interface DrawerProps {
  title: string
  onClose: () => void
  children: ComponentChildren
}

// a panel that slides in from the right over a blurred page; Escape or a click outside closes it, from its first frame
export const Drawer: FunctionComponent<DrawerProps> = ({ title, onClose, children }) => {
  useLayoutEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      class="fixed inset-0 z-50 flex justify-end"
      style={{ background: 'rgba(0,0,0,.38)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        class="flex flex-col h-full overflow-auto"
        style={{ width: 'min(492px, 100%)', background: 'var(--bg-2)', borderLeft: '1px solid var(--hair)', boxShadow: 'var(--shadow-l)', animation: 'slideIn .3s var(--ease) both' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div class="glass flex items-center sticky top-0 z-1" style={{ gap: '10px', padding: '14px 18px', borderBottom: '1px solid var(--hair)' }}>
          <h2 style={{ fontSize: '17px', fontWeight: 700, letterSpacing: '-0.02em' }}>{title}</h2>
          <span class="flex-1" />
          <CloseButton onClick={onClose} />
        </div>
        <div class="flex flex-col" style={{ padding: '16px 18px 24px', gap: '14px' }}>
          {children}
        </div>
      </aside>
    </div>
  )
}
