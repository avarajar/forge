import { type FunctionComponent } from 'preact'
import { useState } from 'preact/hooks'

type Viewport = 'desktop' | 'tablet' | 'mobile'

const VIEWPORTS: { id: Viewport; label: string; width: string }[] = [
  { id: 'desktop', label: 'Desktop', width: '100%' },
  { id: 'tablet', label: 'Tablet', width: '768px' },
  { id: 'mobile', label: 'Mobile', width: '375px' },
]

const LIVE_STATES = new Set(['live', 'ready', 'generating'])

function placeholderText(state: string): string {
  switch (state) {
    case 'creating':    return 'Setting up sandbox...'
    case 'idle':        return 'Select an input and generate a prototype'
    case 'archived':    return 'Prototype archived'
    case 'ready':
    default:            return 'Ready — click Generate to start'
  }
}

function statusDotColor(state: string): string {
  switch (state) {
    case 'live':        return 'var(--forge-success)'
    case 'generating':  return 'var(--forge-warning)'
    case 'ready':       return 'var(--forge-accent)'
    default:            return 'var(--forge-muted)'
  }
}

interface PrototypePreviewProps {
  port: number | null
  state: string
}

export const PrototypePreview: FunctionComponent<PrototypePreviewProps> = ({ port, state }) => {
  const [viewport, setViewport] = useState<Viewport>('desktop')

  const showIframe = port != null && LIVE_STATES.has(state)
  const selectedViewport = VIEWPORTS.find(v => v.id === viewport)!

  return (
    <div class="flex flex-col h-full">
      {/* Main area */}
      <div class="flex-1 flex items-center justify-center overflow-hidden" style={{ backgroundColor: 'var(--forge-bg)' }}>
        {showIframe ? (
          <iframe
            src={`http://127.0.0.1:${port}`}
            style={{
              width: selectedViewport.width,
              height: '100%',
              border: 'none',
              backgroundColor: '#ffffff',
              borderRadius: '8px',
              display: 'block',
              ...(selectedViewport.id !== 'desktop' ? { maxWidth: '100%' } : {}),
            }}
            title="Prototype preview"
          />
        ) : (
          <span class="text-sm" style={{ color: 'var(--forge-muted)' }}>
            {placeholderText(state)}
          </span>
        )}
      </div>

      {/* Bottom bar */}
      <div
        class="flex items-center justify-between px-3 py-2 shrink-0"
        style={{ borderTop: '1px solid var(--forge-ghost-border)' }}
      >
        {/* Viewport switcher */}
        <div class="flex items-center gap-1">
          {VIEWPORTS.map(v => {
            const isActive = v.id === viewport
            return (
              <button
                key={v.id}
                class="px-2.5 py-1 rounded-md text-xs font-medium transition-colors"
                style={isActive
                  ? { backgroundColor: 'var(--forge-accent)', color: '#ffffff' }
                  : { backgroundColor: 'transparent', color: 'var(--forge-muted)' }
                }
                onClick={() => setViewport(v.id)}
              >
                {v.label}
              </button>
            )
          })}
        </div>

        {/* Status indicator */}
        <div class="flex items-center gap-1.5">
          <span
            class="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: statusDotColor(state) }}
          />
          <span class="text-xs capitalize" style={{ color: 'var(--forge-muted)' }}>
            {state}
          </span>
        </div>
      </div>
    </div>
  )
}
