import { useEffect, useState } from 'preact/hooks'
import { ActionButton, EmptyState } from '@forge-dev/ui'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import type { Item } from './digest'
import { readingProblem } from './ops'
import { dayLabel, readLine, Row, useActing, useDigest, useProjects } from './rows'

const GROUPS: { title: string; pick: (i: Item) => boolean }[] = [
  { title: 'In open tasks', pick: i => i.kind === 'to-task' },
  { title: 'New', pick: i => i.kind === 'issue' || i.kind === 'request' },
  { title: 'To review', pick: i => i.kind === 'review' },
  { title: 'Researching', pick: i => i.kind === 'research' },
]

// live items by kind, then the dismissed ones
function sections(all: Item[]): { title: string; items: Item[] }[] {
  const live = all.filter(i => i.state !== 'dismissed')
  const groups = GROUPS.map(g => ({ title: g.title, items: live.filter(g.pick) }))
  return [...groups, { title: 'Dismissed', items: all.filter(i => i.state === 'dismissed') }].filter(g => g.items.length > 0)
}

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
        {digest && <b style={{ fontSize: '13px', fontWeight: 600 }}>{dayLabel(new Date(), digest.date)}</b>}
        <span style={{ fontSize: '12px', color: 'var(--ink-2)' }}>{digest ? readLine(digest) : 'Not read yet'}</span>
        <span style={{ marginLeft: 'auto' }}><ActionButton label="Read now" variant="primary" size="sm" loading={acting.busy} onClick={read} /></span>
      </div>

      {(error || digest?.error) && (
        <div style={{ padding: '10px 12px', borderRadius: '10px', fontSize: '12px', color: 'var(--red)', background: 'var(--card)', border: '1px solid color-mix(in srgb, var(--red) 45%, var(--hair))' }}>
          {error ? `Can't load Today: ${error}` : readingProblem(digest!.error!)}
        </div>
      )}

      {!digest || digest.items.length === 0 ? (
        <EmptyState title="Nothing to show" description="Today reads your Linear, Slack and GitHub once a day. Use Read now to read them now." />
      ) : (
        sections(digest.items).map(({ title, items }) => {
          return (
            <section key={title} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <h4 style={{ margin: '4px 0', fontSize: '11px', fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>{title} · {items.length}</h4>
              {items.map(i => <Row key={i.id} item={i} projects={projects} acting={acting} forge={forge} />)}
            </section>
          )
        })
      )}
    </div>
  )
}

export default definePanel({ id: 'main', title: 'Today', component: View })
