import { useEffect, useState } from 'preact/hooks'
import { ActionButton, EmptyState } from '@forge-dev/ui'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import type { Item } from './digest'
import { readLine, Row, useActing, useDigest, useProjects } from './rows'

const GROUPS: { title: string; pick: (i: Item) => boolean }[] = [
  { title: 'In open tasks', pick: i => i.state !== 'dismissed' && i.kind === 'to-task' },
  { title: 'New', pick: i => i.state !== 'dismissed' && (i.kind === 'issue' || i.kind === 'request') },
  { title: 'Researching', pick: i => i.state !== 'dismissed' && i.kind === 'research' },
  { title: 'Dismissed', pick: i => i.state === 'dismissed' },
]

function View({ forge }: PanelProps) {
  const [days, setDays] = useState<string[]>([])
  const [day, setDay] = useState<string | null>(null)
  const { reply, error, reload } = useDigest(forge, day ? `/digest/${day}` : '/digest')
  const projects = useProjects(forge)
  const digest = reply?.digest
  const acting = useActing(forge, digest?.date, reload)

  useEffect(() => {
    forge.route<{ days: string[] }>('/days').then(r => setDays(r.days), () => {})
  }, [forge, digest?.readAt])

  const read = () => acting.run(() => forge.action('refresh'))

  return (
    <div style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '1180px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        {days.length > 0 && (
          <select aria-label="Day" value={digest?.date ?? ''} onChange={e => setDay((e.target as HTMLSelectElement).value)} style={{ font: 'inherit', fontSize: '12.5px', padding: '5px 8px', borderRadius: '8px', border: '1px solid var(--hair-2)', background: 'var(--card)', color: 'var(--ink)' }}>
            {days.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
        <span style={{ fontSize: '12px', color: 'var(--ink-2)' }}>{digest ? readLine(digest) : 'Not read yet'}</span>
        <span style={{ marginLeft: 'auto' }}><ActionButton label="Read now" variant="primary" size="sm" loading={acting.busy} onClick={read} /></span>
      </div>

      {(error || reply?.lastError) && (
        <div style={{ padding: '10px 12px', borderRadius: '10px', fontSize: '12px', color: 'var(--red)', background: 'var(--card)', border: '1px solid color-mix(in srgb, var(--red) 45%, var(--hair))' }}>
          Last reading failed: {error ?? reply?.lastError}
        </div>
      )}

      {!digest || digest.items.length === 0 ? (
        <EmptyState title="Nothing to show" description="Today reads your Linear and Slack once a day. Use Read now to read them now." />
      ) : (
        GROUPS.map(g => {
          const items = digest.items.filter(g.pick)
          if (items.length === 0) return null
          return (
            <section key={g.title} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <h4 style={{ margin: '4px 0', fontSize: '11px', fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>{g.title} · {items.length}</h4>
              {items.map(i => <Row key={i.id} item={i} projects={projects} acting={acting} forge={forge} />)}
            </section>
          )
        })
      )}
    </div>
  )
}

export default definePanel({ id: 'main', title: 'Today', component: View })
