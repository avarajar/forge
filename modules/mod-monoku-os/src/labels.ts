import type { Solicitud, Ticket } from './parse'

// Monoku OS values are snake_case Spanish; the page reads them as words
export const words = (v?: string) => (v ? v.replace(/_/g, ' ') : '')

const CASILLA: Record<string, string> = { definicion: 'definición', diseno: 'diseño', construccion: 'construcción', aprobacion: 'aprobación' }
export const casillaLabel = (v?: string) => (v ? CASILLA[v] ?? words(v) : '')

export function ago(iso: string | undefined, now = new Date()): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const min = Math.max(0, Math.round((now.getTime() - t) / 60_000))
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.round(h / 24)
  return d === 1 ? 'hace 1 día' : `hace ${d} días`
}

export const pendientes = (n: number) => (n === 1 ? '1 pendiente' : `${n} pendientes`)

export function overdue(s: Pick<Solicitud, 'venceEn'>, now = new Date()): boolean {
  const t = s.venceEn ? Date.parse(s.venceEn) : NaN
  return !Number.isNaN(t) && t < now.getTime()
}

export const urgent = (s: Solicitud, now = new Date()) => s.bloquea || overdue(s, now)

// the banner's rows: urgent requests first, then red tickets, then the rest in reading order
export function bannerRows(tickets: Ticket[], solicitudes: Solicitud[], max = 5, now = new Date()) {
  const rank = (r: Row) => (r.kind === 'solicitud' ? (urgent(r.item, now) ? 0 : 3) : r.item.color === 'rojo' ? 1 : 2)
  const rows: Row[] = [...tickets.map(item => ({ kind: 'ticket' as const, item })), ...solicitudes.map(item => ({ kind: 'solicitud' as const, item }))]
  const sorted = rows.map((r, i) => ({ r, i })).sort((a, b) => rank(a.r) - rank(b.r) || a.i - b.i).map(x => x.r)
  return { rows: sorted.slice(0, max), more: Math.max(0, sorted.length - max) }
}

export type Row = { kind: 'ticket'; item: Ticket } | { kind: 'solicitud'; item: Solicitud }

export function byClient(tickets: Ticket[]): Array<[string, Ticket[]]> {
  const groups = new Map<string, Ticket[]>()
  for (const t of tickets) {
    const k = t.cliente ?? t.proyecto?.split('/')[0] ?? 'Sin cliente'
    groups.set(k, [...(groups.get(k) ?? []), t])
  }
  return [...groups.entries()]
}
