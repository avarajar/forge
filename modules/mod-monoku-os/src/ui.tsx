import type { ComponentChildren } from 'preact'
import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import type { PanelClient } from '@forge-dev/sdk'
import type { Solicitud, Ticket } from './parse'
import type { Reading, ReadError } from './reader'
import type { Started } from './start'
import { ticketUrl } from './start'
import { ANSWERABLE, MAX_ANSWER } from './answer'
import { casillaLabel, overdue, words } from './labels'

export interface StateReply { reading: Reading | null; lastError: ReadError | null; inFlight: boolean; projectsFor: Record<string, string[]>; mode: string }

export const soft = (token: string, pct = 18) => `color-mix(in srgb, var(${token}) ${pct}%, transparent)`
const base = { font: 'inherit', fontSize: '12px', fontWeight: 550, borderRadius: '8px', padding: '4px 10px', border: '1px solid var(--hair-2)', background: 'var(--card-2, var(--elev))', color: 'var(--ink)', cursor: 'pointer', whiteSpace: 'nowrap' as const }
export const ghost = { ...base, border: '1px solid transparent', background: 'transparent', color: 'var(--ink-2)' }
export const primary = { ...base, background: 'var(--blue)', borderColor: 'transparent', color: '#fff' }
export const muted = { fontSize: '11.5px', color: 'var(--ink-3)' }
export const link = { font: 'inherit', fontSize: 'inherit', padding: 0, border: 0, background: 'none', cursor: 'pointer', color: 'var(--blue)', fontWeight: 600 }

export function Btn({ label, style = base, disabled, onClick, title }: { label: string; style?: Record<string, string | number>; disabled?: boolean; onClick: () => void; title?: string }) {
  return <button type="button" title={title} disabled={disabled} onClick={onClick} style={{ ...style, opacity: disabled ? 0.55 : 1, cursor: disabled ? 'default' : 'pointer' }}>{label}</button>
}

const COLOR: Record<string, string> = { rojo: '--red', ambar: '--orange', verde: '--green' }
export function Dot({ color }: { color?: string }) {
  const token = color ? COLOR[color] : undefined
  return <i title={color ? `color ${color}` : undefined} style={{ flexShrink: 0, width: '7px', height: '7px', borderRadius: '50%', background: token ? `var(${token})` : 'var(--hair-2)', boxShadow: token ? `0 0 0 3px ${soft(token, 22)}` : 'none' }} />
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

// the module's state, shared by the banner and the page: asks for a reading when one is due, polls while it runs
export function useMonoku(forge: PanelClient) {
  const [state, setState] = useState<StateReply | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const load = useCallback(async () => {
    try {
      setState(await forge.route<StateReply>('/state'))
      setError(null)
    } catch (e) {
      setError(message(e))
    }
  }, [forge])

  useEffect(() => {
    forge.action<StateReply>('read-if-stale').then(s => s && setState(s)).catch(() => load())
  }, [forge, load])

  const inFlight = state?.inFlight === true
  useEffect(() => {
    const id = setInterval(load, inFlight ? 3000 : 60_000)
    return () => clearInterval(id)
  }, [load, inFlight])

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const s = await forge.action<StateReply>('refresh')
      if (s) setState(s)
    } catch {
      await load()
    } finally {
      setRefreshing(false)
    }
  }, [forge, load])

  return { state, error, reload: load, refresh, reading: refreshing || inFlight }
}

interface Picking { numero: number; options: string[]; remember: boolean; value: string }

// Start, with the project question when the ticket's project is not mapped or has several repos
export function useStart(forge: PanelClient, projectsFor: Record<string, string[]>) {
  const [busy, setBusy] = useState<number | null>(null)
  const [picking, setPicking] = useState<Picking | null>(null)
  const [failure, setFailure] = useState<{ numero: number; text: string } | null>(null)
  const allProjects = useRef<string[] | null>(null)

  const run = async (t: Ticket, project?: string, remember = false) => {
    setBusy(t.numero)
    setFailure(null)
    try {
      if (project && remember && t.proyecto) await saveMapping(forge, t.proyecto, project)
      const r = await forge.action<{ session: Started }>('start', project ? { numero: t.numero, project } : { numero: t.numero })
      setPicking(null)
      if (r) forge.openSession(r.session.project, r.session.sessionDir)
    } catch (e) {
      const text = message(e)
      if (text === 'no_project' || text === 'pick_project') {
        const several = projectsFor[t.numero] ?? []
        if (text === 'no_project' && !allProjects.current) allProjects.current = (await forge.route<{ projects: string[] }>('/projects')).projects
        const options = text === 'pick_project' && several.length ? several : allProjects.current ?? []
        setPicking({ numero: t.numero, options, remember: text === 'no_project', value: '' })
      } else setFailure({ numero: t.numero, text })
    } finally {
      setBusy(null)
    }
  }
  return { busy, picking, setPicking, failure, run }
}

async function saveMapping(forge: PanelClient, monoku: string, project: string) {
  const current = await forge.route<Record<string, unknown>>('/settings')
  const rows = Array.isArray(current.projects) ? current.projects : []
  await forge.route('/settings', { method: 'PUT', body: { ...current, projects: [...rows, { monoku, project }] } })
}

export function PickProject({ ticket, start }: { ticket: Ticket; start: ReturnType<typeof useStart> }) {
  const p = start.picking
  if (!p || p.numero !== ticket.numero) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', padding: '6px 0 2px 17px', fontSize: '12px', color: 'var(--ink-2)' }}>
      <span>¿En qué proyecto de CW?</span>
      <select aria-label="Proyecto de CW" value={p.value} onChange={e => start.setPicking({ ...p, value: (e.target as HTMLSelectElement).value })} style={{ font: 'inherit', fontSize: '12px', padding: '3px 6px', borderRadius: '8px', border: '1px solid var(--hair-2)', background: 'var(--card)', color: 'var(--ink)' }}>
        <option value="">Proyecto…</option>
        {p.options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      {ticket.proyecto && (
        <label style={{ display: 'inline-flex', gap: '5px', alignItems: 'center' }}>
          <input type="checkbox" checked={p.remember} onChange={e => start.setPicking({ ...p, remember: (e.target as HTMLInputElement).checked })} />
          Recordar para {ticket.proyecto}
        </label>
      )}
      <Btn label="Empezar" style={primary} disabled={!p.value || start.busy !== null} onClick={() => start.run(ticket, p.value, p.remember)} />
      <Btn label="Cancelar" style={ghost} onClick={() => start.setPicking(null)} />
    </div>
  )
}

export function TicketRow({ ticket, start, detail }: { ticket: Ticket; start: ReturnType<typeof useStart>; detail?: boolean }) {
  const where = [ticket.proyecto ?? ticket.cliente, ticket.siguientePaso && `te toca: ${words(ticket.siguientePaso)}`].filter(Boolean).join(' · ')
  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12.5px', minWidth: 0 }}>
        <Dot color={ticket.color} />
        <b style={{ color: 'var(--ink-3)', fontWeight: 550, fontVariantNumeric: 'tabular-nums' }}>#{ticket.numero}</b>
        <span style={{ color: 'var(--ink)', fontWeight: 550, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ticket.titulo}</span>
        <span style={{ ...muted, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{where}</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: '6px', flexShrink: 0 }}>
          <Btn label={start.busy === ticket.numero ? 'Abriendo…' : 'Empezar'} disabled={start.busy !== null} onClick={() => start.run(ticket)} />
          <a href={ticketUrl(ticket.numero)} target="_blank" rel="noopener noreferrer" style={{ ...ghost, textDecoration: 'none' }}>Abrir ↗</a>
        </span>
      </div>
      {detail && (
        <div style={{ ...muted, padding: '2px 0 0 17px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {ticket.casilla && <span>en {casillaLabel(ticket.casilla)}{ticket.edad ? ` ${ticket.edad}` : ''}</span>}
          {ticket.leTocaA && <span>le toca a {ticket.leTocaA}</span>}
          {ticket.espera && ticket.espera !== 'sin_espera' && <span style={{ color: ticket.espera === 'atascado' ? 'var(--red)' : undefined }}>{words(ticket.espera)}</span>}
          {ticket.fechaPrometida && <span>prometido para el {ticket.fechaPrometida}</span>}
        </div>
      )}
      {start.failure?.numero === ticket.numero && <div role="alert" style={{ fontSize: '11.5px', color: 'var(--red)', padding: '2px 0 0 17px' }}>{start.failure.text}</div>}
      <PickProject ticket={ticket} start={start} />
    </div>
  )
}

export function SolicitudRow({ s, forge, onAnswered, detail }: { s: Solicitud; forge: PanelClient; onAnswered: () => void; detail?: boolean }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const red = s.bloquea || overdue(s)
  const canAnswer = s.paraMi && ANSWERABLE.includes(s.tipo ?? '')
  const send = async () => {
    setBusy(true)
    setFailure(null)
    try {
      const r = await forge.action('answer', { solicitud: s.id, respuesta: text })
      if (r !== undefined) {
        setOpen(false)
        setText('')
        onAnswered()
      }
    } catch (e) {
      setFailure(message(e))
    } finally {
      setBusy(false)
    }
  }
  const meta = [s.autor && `de ${s.autor}`, !s.paraMi && s.destinatario && `para ${s.destinatario}`, s.bloquea && 'bloquea el trabajo', overdue(s) && 'vencida'].filter(Boolean).join(' · ')
  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12.5px', minWidth: 0 }}>
        <i style={{ flexShrink: 0, width: '7px', height: '7px', borderRadius: '50%', border: `1.5px solid var(${red ? '--red' : '--ink-3'})` }} />
        <b style={{ color: 'var(--ink-3)', fontWeight: 550, whiteSpace: 'nowrap' }}>{words(s.tipo) || 'solicitud'}{s.ticket ? ` · #${s.ticket}` : ''}</b>
        <span title={s.queSePide} style={{ color: 'var(--ink)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: detail ? 'normal' : 'nowrap' }}>“{s.queSePide}”</span>
        <span style={{ ...muted, whiteSpace: 'nowrap', color: red ? 'var(--red)' : 'var(--ink-3)' }}>{meta}</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: '6px', flexShrink: 0 }}>
          {canAnswer && !open && <Btn label="Responder…" onClick={() => setOpen(true)} />}
          {s.ticket && <a href={ticketUrl(s.ticket)} target="_blank" rel="noopener noreferrer" style={{ ...ghost, textDecoration: 'none' }}>Abrir ↗</a>}
        </span>
      </div>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '6px 0 2px 17px' }}>
          <textarea aria-label="Tu respuesta" value={text} maxLength={MAX_ANSWER} rows={3} onInput={e => setText((e.target as HTMLTextAreaElement).value)} style={{ font: 'inherit', fontSize: '12.5px', padding: '8px', borderRadius: '8px', border: '1px solid var(--hair-2)', background: 'var(--card)', color: 'var(--ink)', resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <Btn label={busy ? 'Enviando…' : 'Responder'} style={primary} disabled={busy || !text.trim()} onClick={send} />
            <Btn label="Cancelar" style={ghost} disabled={busy} onClick={() => setOpen(false)} />
            <span style={muted}>Verás exactamente qué se escribe antes de enviarlo.</span>
          </div>
          {failure && <div role="alert" style={{ fontSize: '11.5px', color: 'var(--red)' }}>{failure}</div>}
        </div>
      )}
    </div>
  )
}

export function Frame({ children }: { children: ComponentChildren }) {
  return (
    <div style={{ borderRadius: '14px', border: '1px solid var(--hair)', background: `radial-gradient(120% 140% at 0% 0%, ${soft('--purple', 10)} 0%, var(--card) 55%)` }}>
      {children}
    </div>
  )
}
