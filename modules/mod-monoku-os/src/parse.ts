import { ModuleError } from '@forge-dev/sdk'

export type Color = 'verde' | 'ambar' | 'rojo'

export interface Ticket {
  numero: number
  titulo: string
  cliente?: string
  // "cliente/proyecto" when both are known, else the project's name
  // casilla and siguientePaso are kept as Monoku OS's readable phrase; espera as its value
  proyecto?: string
  casilla?: string
  siguientePaso?: string
  leTocaA?: string
  color?: Color
  espera?: string
  desde?: string
  // how long it has been in its box, as Monoku OS words it ("hace 15 días")
  edad?: string
  fechaPrometida?: string
  // owner/name of the project's GitHub repository, from Monoku OS's clientes
  repo?: string
}

export interface Solicitud {
  id: number
  ticket?: number
  tipo?: string
  queSePide: string
  autor?: string
  destinatario?: string
  // addressed to José himself, not to a role or to a third party he carries it for
  paraMi: boolean
  bloquea: boolean
  venceEn?: string
}

export interface Me { usuario?: string; nombre?: string; correo?: string }

export interface ParsedReading { tickets: Ticket[]; solicitudes: Solicitud[]; yo?: Me; dropped: number }

type Obj = Record<string, unknown>

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

// the first JSON object in a model's answer: bare, fenced, or with prose around it
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text)
  const candidates = [text.trim(), fenced?.[1]?.trim()]
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) candidates.push(text.slice(start, end + 1))
  for (const c of candidates) {
    if (!c) continue
    try {
      return JSON.parse(c)
    } catch {
      // next candidate
    }
  }
  throw new ModuleError('upstream', 'the reader did not answer JSON')
}

function str(v: unknown, max = 500): string | undefined {
  if (typeof v === 'string') {
    const s = v.replace(/\s+/g, ' ').trim()
    return s ? s.slice(0, max) : undefined
  }
  if (typeof v === 'number') return String(v)
  return undefined
}

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isInteger(v) && v > 0) return v
  if (typeof v === 'string' && /^\d+$/.test(v)) return Number(v)
  return undefined
}

// a reference can come as a plain value or as the referenced row
function nameOf(v: unknown): string | undefined {
  if (isObj(v)) return str(v.nombre) ?? str(v.titulo) ?? str(v.usuario) ?? str(v.correo)
  return str(v, 200)
}

function idOf(v: unknown): number | undefined {
  if (isObj(v)) return num(v.numero) ?? num(v.id)
  return num(v)
}

function pick(o: Obj, ...keys: string[]): unknown {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k]
  return undefined
}

// Monoku OS sends a closed value as { valor, frase }: valor to compare, frase to read
function valor(v: unknown): string | undefined {
  return isObj(v) ? str(v.valor) : str(v)
}

function frase(v: unknown): string | undefined {
  return isObj(v) ? str(v.frase) ?? str(v.valor)?.replace(/_/g, ' ') : str(v)?.replace(/_/g, ' ')
}

function color(v: unknown): Color | undefined {
  const s = valor(v)?.toLowerCase().replace('á', 'a')
  return s === 'verde' || s === 'ambar' || s === 'rojo' ? s : undefined
}

function toTicket(o: Obj): Ticket | undefined {
  const numero = num(pick(o, 'numero', 'id', 'ticket'))
  const titulo = str(pick(o, 'titulo', 'title'), 200)
  if (!numero || !titulo) return undefined
  const proyectoRaw = pick(o, 'proyecto')
  const cliente = nameOf(pick(o, 'cliente')) ?? (isObj(proyectoRaw) ? nameOf(proyectoRaw.cliente) : undefined)
  const proyectoName = nameOf(proyectoRaw)
  const proyecto = proyectoName && cliente && !proyectoName.includes('/') ? `${cliente}/${proyectoName}` : proyectoName
  return clean({
    numero,
    titulo,
    cliente,
    proyecto,
    casilla: frase(pick(o, 'casilla')),
    siguientePaso: frase(pick(o, 'siguiente_paso', 'siguientePaso')),
    leTocaA: str(pick(o, 'le_toca_a_nombre')),
    color: color(pick(o, 'color_efectivo', 'color')),
    espera: valor(pick(o, 'espera')),
    desde: str(pick(o, 'casilla_desde')),
    edad: str(pick(o, 'edad_en_la_casilla')),
    fechaPrometida: str(pick(o, 'fecha_prometida_al_cliente')),
  })
}

function samePerson(v: unknown, yo: Me | undefined): boolean {
  if (!yo || v === undefined || v === null) return false
  const values = isObj(v) ? [v.usuario, v.correo, v.nombre].map(x => str(x)) : [str(v)]
  const mine = [yo.usuario, yo.correo, yo.nombre].filter(Boolean)
  return values.some(x => x !== undefined && mine.includes(x))
}

function toSolicitud(o: Obj, yo: Me | undefined): Solicitud | undefined {
  const id = num(pick(o, 'id', 'solicitud_id'))
  const queSePide = str(pick(o, 'que_se_pide', 'queSePide'), 2000)
  if (!id || !queSePide) return undefined
  const persona = pick(o, 'destinatario_persona')
  return clean({
    id,
    ticket: idOf(pick(o, 'ticket', 'numero')),
    tipo: valor(pick(o, 'tipo_de_solicitud', 'tipo')),
    queSePide,
    autor: nameOf(pick(o, 'autor_persona', 'autor')),
    destinatario: str(pick(o, 'destinatario_nombre')) ?? nameOf(persona),
    paraMi: samePerson(persona, yo),
    bloquea: pick(o, 'bloquea_el_trabajo', 'bloquea') === true,
    venceEn: str(pick(o, 'vence_en')),
  })
}

function clean<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T
}

function toMe(v: unknown): Me | undefined {
  const p = isObj(v) && isObj(v.persona) ? v.persona : v
  if (!isObj(p)) return undefined
  const me = clean({ usuario: str(p.usuario), nombre: str(p.nombre), correo: str(p.correo) })
  return Object.keys(me).length ? me : undefined
}

// the reader prints { yo: <quien_soy>, me_toca: <lo_que_me_toca> } or { problem }
export function parseReading(text: string): ParsedReading | { problem: string } {
  const data = extractJson(text)
  if (!isObj(data)) throw new ModuleError('upstream', 'the reader did not answer an object')
  if (typeof data.problem === 'string') return { problem: data.problem.slice(0, 300) }
  const yo = toMe(data.yo)
  const body = isObj(data.me_toca) ? data.me_toca : data
  if (!Array.isArray(body.tickets) || !Array.isArray(body.solicitudes)) throw new ModuleError('upstream', 'the reader answered without tickets and solicitudes')
  let dropped = 0
  const keep = <T>(rows: unknown[], f: (o: Obj) => T | undefined): T[] => rows.flatMap(r => {
    const v = isObj(r) ? f(r) : undefined
    if (!v) dropped++
    return v ? [v] : []
  })
  const repos = parseClientes(data.clientes)
  const tickets = keep(body.tickets, toTicket).map(t => {
    const repo = repoFor(repos, t)
    return repo ? { ...t, repo } : t
  })
  const solicitudes = keep(body.solicitudes, o => toSolicitud(o, yo))
  return { tickets, solicitudes, ...(yo ? { yo } : {}), dropped }
}

export interface ProjectRepo { cliente: string; proyecto: string; repo: string }

export function normalizeRepo(value: string | undefined): string | undefined {
  if (!value) return undefined
  const m = value.trim().match(/^(?:git@github\.com:|(?:https?|ssh|git):\/\/(?:[^@/]+@)?github\.com\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i)
  return m ? `${m[1]}/${m[2]}`.toLowerCase() : undefined
}

// clientes: { clientes: [{ nombre, proyectos: [{ nombre, repositorio }] }] }; only projects with a GitHub repository
export function parseClientes(v: unknown): ProjectRepo[] {
  const list = isObj(v) && Array.isArray(v.clientes) ? v.clientes : Array.isArray(v) ? v : []
  return list.flatMap(c => {
    if (!isObj(c) || !Array.isArray(c.proyectos)) return []
    const cliente = str(c.nombre) ?? ''
    return c.proyectos.flatMap(p => {
      const repo = isObj(p) ? normalizeRepo(str(p.repositorio)) : undefined
      const proyecto = isObj(p) ? str(p.nombre) : undefined
      return repo && proyecto ? [{ cliente, proyecto, repo }] : []
    })
  })
}

// a ticket's project as cliente/proyecto or just proyecto; a bare name shared by two clients matches neither
export function repoFor(repos: ProjectRepo[], t: Pick<Ticket, 'proyecto' | 'cliente'>): string | undefined {
  if (!t.proyecto) return undefined
  const lower = (x: string) => x.trim().toLowerCase()
  const [a, b] = t.proyecto.includes('/') ? t.proyecto.split('/', 2) : [t.cliente, t.proyecto]
  const hits = repos.filter(r => lower(r.proyecto) === lower(b ?? '') && (!a || lower(r.cliente) === lower(a)))
  return hits.length === 1 ? hits[0].repo : undefined
}
