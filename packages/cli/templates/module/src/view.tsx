import { useEffect, useState } from 'preact/hooks'
import { ActionButton } from '@forge-dev/ui'
import { definePanel, type PanelProps } from '@forge-dev/sdk'

// Forge's UnoCSS does not see this bundle: style with inline styles and the theme tokens
function View({ forge }: PanelProps) {
  const [message, setMessage] = useState('…')
  const [n, setN] = useState(0)

  useEffect(() => {
    forge.route<{ message: string }>('/hello').then(r => setMessage(r.message), (err: Error) => setMessage(err.message))
  }, [forge])

  return (
    <div style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <p style={{ fontSize: '15px', color: 'var(--ink)' }}>{message}</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <ActionButton label="Count" onClick={async () => setN((await forge.action<{ n: number }>('count', { n }))?.n ?? n)} />
        <span style={{ color: 'var(--ink-2)' }}>{n}</span>
      </div>
    </div>
  )
}

export default definePanel({ id: 'main', title: '__DISPLAY__', component: View })
