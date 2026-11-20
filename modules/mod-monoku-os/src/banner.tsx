import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { ago, bannerRows, pendientes } from './labels'
import { Btn, Frame, ghost, link, muted, SolicitudRow, TicketRow, useMonoku, useStart } from './ui'

function Banner({ forge }: PanelProps) {
  const { state, error, reload, refresh, reading } = useMonoku(forge)
  const start = useStart(forge, state?.projectsFor ?? {})
  if (!state) return null
  const r = state.reading
  const total = r ? r.tickets.length + r.solicitudes.length : 0
  // nothing to do and nothing wrong: the task list stays clean
  if (r && total === 0 && !state.lastError && !error && !reading) return null

  const refreshBtn = <Btn label={reading ? 'Leyendo…' : '↻'} title="Leer ahora" style={ghost} disabled={reading} onClick={refresh} />
  const problem = error ?? state.lastError?.message
  const { rows, more } = r ? bannerRows(r.tickets, r.solicitudes) : { rows: [], more: 0 }

  return (
    <Frame>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 14px 4px', fontSize: '12.5px', color: 'var(--ink-2)' }}>
        <b style={{ color: 'var(--ink)', fontWeight: 600 }}>Monoku OS</b>
        <span>· {r ? pendientes(total) : reading ? 'leyendo…' : 'sin leer todavía'}</span>
        <button type="button" onClick={() => forge.openPage()} style={link}>Ver todo →</button>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          {r && <span style={muted}>{ago(r.at)}</span>}
          {refreshBtn}
        </span>
      </div>
      <div style={{ padding: '0 14px 8px' }}>
        {rows.map(row => (row.kind === 'ticket'
          ? <TicketRow key={`t${row.item.numero}`} ticket={row.item} start={start} />
          : <SolicitudRow key={`s${row.item.id}`} s={row.item} tickets={r?.tickets ?? []} forge={forge} onAnswered={reload} />))}
        {more > 0 && <button type="button" onClick={() => forge.openPage()} style={{ ...link, fontSize: '12px', padding: '4px 0' }}>+{more} más</button>}
        {problem && <div role="alert" style={{ ...muted, color: 'var(--orange)', padding: '2px 0' }}>⚠ No se pudo leer Monoku OS: {problem}</div>}
      </div>
    </Frame>
  )
}

export default definePanel({ id: 'banner', title: 'Monoku OS', component: Banner })
