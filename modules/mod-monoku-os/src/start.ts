import { ModuleError, type ForgeContext } from '@forge-dev/sdk'
import { normalizeRepo, type Ticket } from './parse'
import { accountOf, type Reading } from './reader'

export interface Mapping { monoku: string; project: string }
export interface Started { project: string; sessionDir: string }

const BASE = 'https://os.monoku.com/ver/'

// Django's slugify, which Monoku OS builds its links with: accents dropped, punctuation removed, spaces and hyphens joined
export function webSlug(text: string): string {
  return text.normalize('NFKD').replace(/[^\x00-\x7f]/g, '').replace(/[^\w\s-]/g, '').toLowerCase().trim().replace(/[-\s]+/g, '-').replace(/^[-_]+|[-_]+$/g, '')
}

// a ticket's web page is /ver/<client>/<project>/<numero>-<title>/; without its client and project, the list
export function ticketUrl(t: Pick<Ticket, 'numero' | 'titulo' | 'cliente' | 'proyecto'> | undefined): string {
  if (!t?.cliente || !t.proyecto) return BASE
  const proyecto = t.proyecto.startsWith(`${t.cliente}/`) ? t.proyecto.slice(t.cliente.length + 1) : t.proyecto
  const parts = [webSlug(t.cliente), webSlug(proyecto), `${t.numero}-${webSlug(t.titulo)}`]
  return parts.every(Boolean) ? `${BASE}${parts.join('/')}/` : BASE
}

export function mappingsOf(ctx: ForgeContext): Mapping[] {
  const list = Array.isArray(ctx.settings.projects) ? ctx.settings.projects : []
  return list.flatMap(row => {
    const r = row as Partial<Mapping>
    return typeof r.monoku === 'string' && typeof r.project === 'string' && r.monoku.trim() && r.project.trim() ? [{ monoku: r.monoku.trim(), project: r.project.trim() }] : []
  })
}

const norm = (s: string) => s.trim().toLowerCase()

// the CW projects mapped to a ticket's Monoku OS project; "web" matches a row written as "acme/web" and the reverse
export function candidatesFor(mappings: Mapping[], ticket: Pick<Ticket, 'proyecto'>): string[] {
  if (!ticket.proyecto) return []
  const want = norm(ticket.proyecto)
  const tail = (s: string) => s.split('/').pop() ?? s
  const hits = mappings.filter(m => {
    const have = norm(m.monoku)
    return have === want || (!have.includes('/') || !want.includes('/')) && tail(have) === tail(want)
  })
  return [...new Set(hits.map(m => m.project))]
}

const REMOTE_TTL = 10 * 60_000
let remotes: { at: number; byRepo: Promise<Map<string, string[]>> } | undefined

export function resetRemotes() {
  remotes = undefined
}

// each CW project's GitHub origin, read with git and kept 10 minutes
export function remoteIndex(ctx: ForgeContext, now = Date.now()): Promise<Map<string, string[]>> {
  if (remotes && now - remotes.at < REMOTE_TTL) return remotes.byRepo
  const byRepo = (async () => {
    const index = new Map<string, string[]>()
    const projects = await ctx.projects.list()
    await Promise.all(projects.map(async p => {
      try {
        const r = await ctx.shell.exec('git', ['remote', 'get-url', 'origin'], { cwd: p.path, timeoutMs: 5000 })
        const repo = r.exitCode === 0 ? normalizeRepo(r.output) : undefined
        if (repo) index.set(repo, [...(index.get(repo) ?? []), p.name])
      } catch {
        // a folder that is gone or not a repository has no origin
      }
    }))
    return index
  })()
  remotes = { at: now, byRepo }
  byRepo.catch(() => { remotes = undefined })
  return byRepo
}

// the mappings in settings win; without one, the CW projects whose origin is the repository Monoku OS names
export async function projectsFor(ctx: ForgeContext, ticket: Ticket, index?: Map<string, string[]>): Promise<string[]> {
  const manual = candidatesFor(mappingsOf(ctx), ticket)
  if (manual.length || !ticket.repo) return manual
  return (index ?? await remoteIndex(ctx)).get(ticket.repo) ?? []
}

export function slug(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30).replace(/^-+|-+$/g, '') || 'ticket'
}

export function briefFor(t: Ticket): string {
  return [
    `Trabajas el ticket #${t.numero} de Monoku OS: "${t.titulo}".`,
    t.siguientePaso ? `Monoku OS dice que el siguiente paso es: ${t.siguientePaso.replace(/_/g, ' ')}.` : '',
    `Antes de nada, lee la ficha con la herramienta ticket (numero ${t.numero}) y el contexto del proyecto con contexto_del_proyecto (numero ${t.numero}) del conector de Monoku OS.`,
    `Ficha web: ${ticketUrl(t)}`,
  ].filter(Boolean).join('\n')
}

export async function ticketIn(ctx: ForgeContext, numero: number): Promise<Ticket> {
  const reading = await ctx.storage.get<Reading>('reading')
  const ticket = reading?.tickets.find(t => t.numero === numero)
  if (!ticket) throw new ModuleError('not_found', `ticket ${numero} is not in the last reading`)
  return ticket
}

export async function startTicket(ctx: ForgeContext, numero: number, chosen?: string): Promise<{ session: Started; reused: boolean }> {
  const ticket = await ticketIn(ctx, numero)
  let project = chosen
  if (project) {
    if (!(await ctx.projects.list()).some(p => p.name === project)) throw new ModuleError('bad_request', `unknown CW project ${project}`)
  } else {
    const found = await projectsFor(ctx, ticket)
    if (found.length === 0) throw new ModuleError('bad_request', 'no_project')
    if (found.length > 1) throw new ModuleError('bad_request', 'pick_project')
    project = found[0]
  }

  // a session already started for this ticket in that project and still listed is opened again
  const before = await ctx.storage.get<Started>(`started/${numero}`)
  if (before && before.project === project && (await ctx.sessions.list()).some(s => s.project === before.project && s.sessionDir === before.sessionDir)) {
    return { session: before, reused: true }
  }
  const session = await ctx.cw.start({
    type: 'work',
    project,
    account: accountOf(ctx),
    task: `monoku-${numero}-${slug(ticket.titulo)}`,
    description: briefFor(ticket),
  })
  await ctx.storage.set(`started/${numero}`, session)
  return { session, reused: false }
}
