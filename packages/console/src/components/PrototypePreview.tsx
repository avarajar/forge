import { type FunctionComponent } from 'preact'

export type Viewport = 'desktop' | 'tablet' | 'mobile'

export const VIEWPORTS: { id: Viewport; label: string; width: string }[] = [
  { id: 'desktop', label: 'Desktop', width: '100%' },
  { id: 'tablet', label: 'Tablet', width: '768px' },
  { id: 'mobile', label: 'Mobile', width: '375px' },
]

const LIVE_STATES = new Set(['live', 'ready', 'generating', 'shared'])

function placeholderText(state: string): string {
  switch (state) {
    case 'creating': return 'Setting up the sandbox…'
    case 'archived': return 'This prototype is archived.'
    case 'ready': return 'The sandbox is ready. Generate to see it here.'
    default: return 'The generated app renders here on its own dev server. Share it as a PR when it holds up.'
  }
}

export const PrototypePreview: FunctionComponent<{ port: number | null; state: string; viewport: Viewport }> = ({ port, state, viewport }) => {
  const showIframe = port != null && LIVE_STATES.has(state)
  const width = VIEWPORTS.find(v => v.id === viewport)?.width ?? '100%'

  return (
    <div class="flex-1 grid place-items-center min-h-0 overflow-auto" style={{ padding: '24px' }}>
      <div
        class="grid place-items-center overflow-hidden"
        style={{ width: 'min(100%, 780px)', aspectRatio: '16 / 10', borderRadius: '16px', background: 'var(--card)', border: '1px solid var(--hair)', boxShadow: 'var(--shadow-l)' }}
      >
        {showIframe ? (
          <iframe
            src={`http://127.0.0.1:${port}`}
            title="Prototype preview"
            style={{ width, maxWidth: '100%', height: '100%', border: 'none', background: '#fff', display: 'block', justifySelf: 'center' }}
          />
        ) : (
          <p style={{ maxWidth: '34ch', padding: '28px', textAlign: 'center', fontSize: '13.5px', color: 'var(--ink-2)' }}>{placeholderText(state)}</p>
        )}
      </div>
    </div>
  )
}
