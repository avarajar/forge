import { jsx, jsxs } from 'preact/jsx-runtime'
import { useState } from 'preact/hooks'
import { Badge } from '@forge-dev/ui'
import { definePanel } from '@forge-dev/sdk'

function View({ forge }) {
  const [n, setN] = useState(0)
  const [boom, setBoom] = useState(false)
  const [msg, setMsg] = useState('')
  if (boom) throw new Error('demo view exploded')
  const send = async () => {
    const r = await forge.action('send', { to: 'dra@clinic.co' })
    setMsg(r === undefined ? 'cancelled' : JSON.stringify(r))
  }
  return jsxs('div', { style: { padding: '22px', display: 'flex', gap: '10px', alignItems: 'center' }, children: [
    jsx('button', { id: 'inc', onClick: () => setN(n + 1), children: `count ${n}` }),
    jsx(Badge, { label: `n=${n}` }),
    jsx('button', { id: 'send', onClick: send, children: 'Send' }),
    jsx('button', { id: 'boom', onClick: () => setBoom(true), children: 'Boom' }),
    jsx('span', { id: 'msg', children: msg }),
  ] })
}

export default definePanel({ id: 'demo', title: 'Demo', component: View })
