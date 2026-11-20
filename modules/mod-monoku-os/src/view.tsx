import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { ago, byClient, pendientes } from './labels'
import { Btn, muted, SolicitudRow, TicketRow, useMonoku, useStart } from './ui'

const MODE: Record<string, string> = { 'on-open': 'lee al abrir Forge', interval: 'lee cada pocos minutos', daily: 'lee una vez al día', manual: 'lee solo a mano' }

function Section({ title, children }: { title: string; children: preact.ComponentChildren }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <h3 style={{ margin: '0 0 4px', fontSize: '11px', fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>{title}</h3>
      {children}
    </section>
  )
}

function View({ forge }: PanelProps) {
  const { state, error, reload, refresh, reading } = useMonoku(forge)
  const start = useStart(forge, state?.projectsFor ?? {})
  const r = state?.reading
  const total = r ? r.tickets.length + r.solicitudes.length : 0
  const problem = error ?? state?.lastError?.message
  const mine = r?.solicitudes.filter(s => s.paraMi) ?? []
  const carried = r?.solicitudes.filter(s => !s.paraMi) ?? []

  return (
    <div style={{ padding: '22px clamp(16px, 3vw, 32px)', color: 'var(--ink)', display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '980px' }}>
      <header style={{ display: 'flex', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--ink)', fontSize: '15px', fontWeight: 600 }}>{r ? pendientes(total) : reading ? 'leyendo…' : 'sin leer todavía'}</span>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={muted}>{[r && `leído ${ago(r.at)}`, state && MODE[state.mode]].filter(Boolean).join(' · ')}</span>
          <Btn label={reading ? 'Leyendo…' : 'Leer ahora'} disabled={reading} onClick={refresh} />
        </span>
      </header>

      {problem && (
        <div role="alert" style={{ fontSize: '12.5px', color: 'var(--ink-2)', padding: '10px 12px', borderRadius: '10px', border: '1px solid color-mix(in srgb, var(--orange) 40%, transparent)' }}>
          <b style={{ color: 'var(--orange)' }}>No se pudo leer Monoku OS.</b> {problem}
          {r && <span style={muted}> Lo de abajo es la última lectura buena.</span>}
        </div>
      )}

      {r && total === 0 && <div style={{ color: 'var(--ink-2)', fontSize: '13px', padding: '30px 0', textAlign: 'center' }}>Nada te toca en Monoku OS.</div>}

      {r && r.tickets.length > 0 && byClient(r.tickets).map(([client, tickets]) => (
        <Section key={client} title={client}>
          {tickets.map(t => <TicketRow key={t.numero} ticket={t} start={start} detail />)}
        </Section>
      ))}

      {mine.length > 0 && (
        <Section title="Solicitudes para ti">
          {mine.map(s => <SolicitudRow key={s.id} s={s} tickets={r?.tickets ?? []} forge={forge} onAnswered={reload} detail />)}
        </Section>
      )}

      {carried.length > 0 && (
        <Section title="Solicitudes que llevas">
          {carried.map(s => <SolicitudRow key={s.id} s={s} tickets={r?.tickets ?? []} forge={forge} onAnswered={reload} detail />)}
        </Section>
      )}

      {r && r.dropped > 0 && <div style={muted}>{r.dropped} elementos de la respuesta no se pudieron leer.</div>}
    </div>
  )
}

export default definePanel({ id: 'main', title: 'Monoku OS', component: View })
