import { useEffect, useState } from 'preact/hooks'
import { ActionButton, EmptyState } from '@forge-dev/ui'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { byAccount, failedLine, notesLine } from './ops'
import { AccountChip, dayLabel, readLine, Row, useActing, useDigest, useProjects } from './rows'

function View({ forge }: PanelProps) {
  const [days, setDays] = useState<string[]>([])
  const [day, setDay] = useState<string | null>(null)
  const { reply, error, reload } = useDigest(forge, day ? `/digest/${day}` : '/digest')
  const projects = useProjects(forge)
  const digest = reply?.digest
  const acting = useActing(forge, digest?.date, reload)
  const notes = notesLine(digest?.notes)
  const enabled = reply?.enabled === true

  useEffect(() => {
    forge.route<{ days: string[] }>('/days').then(r => setDays(r.days), () => {})
  }, [forge, digest?.readAt])


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
        <span style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          {enabled && <ActionButton label="Read now" variant="primary" size="sm" loading={acting.refreshing} onClick={acting.refresh} />}
          {reply && <ActionButton label={enabled ? 'Turn off' : 'Turn on'} variant={enabled ? 'secondary' : 'primary'} size="sm" disabled={acting.busy} onClick={() => acting.run(() => forge.action(enabled ? 'disable' : 'enable'))} />}
        </span>
      </div>

      {reply && !enabled && (
        <div style={{ padding: '12px 14px', borderRadius: '10px', fontSize: '12.5px', lineHeight: 1.5, color: 'var(--ink-2)', background: 'var(--card)', border: '1px solid var(--hair)', maxWidth: '640px' }}>
          Today is off. Turned on, it reads your Linear, Slack and GitHub each morning and whenever you press Read now. Each reading spends your account's usage. Research it proposes can start sessions on its own, a few a day.
        </div>
      )}

      {(error || digest?.error) && (
        <div style={{ padding: '10px 12px', borderRadius: '10px', fontSize: '12px', color: 'var(--red)', background: 'var(--card)', border: '1px solid color-mix(in srgb, var(--red) 45%, var(--hair))' }}>
          {error ? `Can't load Today: ${error}` : failedLine(digest!.error!)}
        </div>
      )}

      {notes && <div style={{ fontSize: '12px', color: 'var(--ink-3)' }}>{notes}</div>}

      {!digest || digest.items.length === 0 ? (
        <EmptyState title="Nothing to show" description={enabled ? 'Today reads your Linear, Slack and GitHub once a day. Use Read now to read them now.' : 'Turn Today on to read your Linear, Slack and GitHub.'} />
      ) : (
        byAccount(digest.items).map(({ account, sections }) => (
          <div key={account ?? ''} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {account && <div><AccountChip account={account} /></div>}
            {sections.map(({ title, items }) => (
              <section key={title} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <h4 style={{ margin: '4px 0', fontSize: '11px', fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>{title} · {items.length}</h4>
                {items.map(i => <Row key={i.id} item={i} projects={projects} acting={acting} forge={forge} />)}
              </section>
            ))}
          </div>
        ))
      )}
    </div>
  )
}

export default definePanel({ id: 'main', title: 'Today', component: View })
