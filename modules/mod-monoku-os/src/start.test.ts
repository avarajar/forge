import { describe, it, expect, beforeEach } from 'vitest'
import type { ForgeContext } from '@forge-dev/sdk'
import { briefFor, candidatesFor, projectsFor, resetRemotes, slug, startTicket, ticketUrl, webSlug } from './start'
import { stub } from './stub.test-util'

beforeEach(() => resetRemotes())

const ticket = { numero: 42, titulo: 'Login con Google', cliente: 'acme', proyecto: 'acme/web', siguientePaso: 'construir' }

function withReading(settings: Record<string, unknown> = {}) {
  const s = stub(settings)
  s.store.set('reading', { at: 'x', tickets: [ticket], solicitudes: [], dropped: 0 })
  return s
}

describe('candidatesFor', () => {
  const rows = [{ monoku: 'acme/web', project: 'acme-web' }, { monoku: 'acme/web', project: 'acme-api' }, { monoku: 'beta', project: 'beta-app' }]
  it('matches the full name, case-insensitive, and one side without client', () => {
    expect(candidatesFor(rows, { proyecto: 'ACME/web' })).toEqual(['acme-web', 'acme-api'])
    expect(candidatesFor(rows, { proyecto: 'web' })).toEqual(['acme-web', 'acme-api'])
    expect(candidatesFor(rows, { proyecto: 'beta/beta' })).toEqual(['beta-app'])
    expect(candidatesFor(rows, { proyecto: 'other/web' })).toEqual([])
    expect(candidatesFor(rows, {})).toEqual([])
  })
})

describe('slug and brief', () => {
  it('slugs accents away', () => {
    expect(slug('Diseño de la página — v2')).toBe('diseno-de-la-pagina-v2')
  })
  it('tells the session which ticket and to read it first', () => {
    const b = briefFor(ticket)
    expect(b).toContain('ticket #42')
    expect(b).toContain('contexto_del_proyecto')
    expect(b).toContain('https://os.monoku.com/ver/acme/web/42-login-con-google/')
  })
})

describe('ticketUrl', () => {
  it('builds the ficha web link Monoku OS uses', () => {
    const t = { numero: 42, titulo: 'Notificaciones: marchado, eliminado, caído, sin conexión', cliente: 'Seim Seim', proyecto: 'Seim Seim/POS' }
    expect(ticketUrl(t)).toBe('https://os.monoku.com/ver/seim-seim/pos/42-notificaciones-marchado-eliminado-caido-sin-conexion/')
  })
  it('takes a project written without its client', () => {
    expect(ticketUrl({ numero: 7, titulo: 'Menú', cliente: 'Seim Seim', proyecto: 'Reservas' })).toBe('https://os.monoku.com/ver/seim-seim/reservas/7-menu/')
  })
  it('falls back to the list without a client, a project or a ticket', () => {
    expect(ticketUrl({ numero: 7, titulo: 'x', proyecto: 'POS' })).toBe('https://os.monoku.com/ver/')
    expect(ticketUrl(undefined)).toBe('https://os.monoku.com/ver/')
    expect(ticketUrl({ numero: 7, titulo: 'x', cliente: '!!', proyecto: 'POS' })).toBe('https://os.monoku.com/ver/')
  })
  it('slugs like Django', () => {
    expect(webSlug('  Año — 2/3 _x_ ')).toBe('ano-23-_x')
  })
})

describe('startTicket', () => {
  it('404s a ticket not in the reading', async () => {
    await expect(startTicket(withReading().ctx, 7)).rejects.toMatchObject({ code: 'not_found' })
  })

  it('starts a ticket that is in progress, not your turn', async () => {
    const s = stub({ projects: [{ monoku: 'acme/web', project: 'acme-web' }] })
    s.store.set('reading', { at: 'x', tickets: [], enCurso: [ticket], solicitudes: [], dropped: 0 })
    await expect(startTicket(s.ctx, 42)).resolves.toMatchObject({ reused: false })
  })

  it('asks for a project when none is mapped, and to pick when several are', async () => {
    await expect(startTicket(withReading().ctx, 42)).rejects.toMatchObject({ code: 'bad_request', message: 'no_project' })
    const many = withReading({ projects: [{ monoku: 'acme/web', project: 'acme-web' }, { monoku: 'acme/web', project: 'acme-api' }] })
    await expect(startTicket(many.ctx, 42)).rejects.toMatchObject({ message: 'pick_project' })
  })

  it('starts a work session under the account in settings', async () => {
    const s = withReading({ account: 'monoku', projects: [{ monoku: 'acme/web', project: 'acme-web' }] })
    expect(await startTicket(s.ctx, 42)).toEqual({ session: { project: 'acme-web', sessionDir: 'work-1' }, reused: false })
    expect(s.start).toHaveBeenCalledWith({ type: 'work', project: 'acme-web', account: 'monoku', task: 'monoku-42-login-con-google', description: briefFor(ticket) })
    expect(s.store.get('followed')).toEqual([42])
  })

  it('takes a chosen project only if CW knows it', async () => {
    const s = withReading()
    await expect(startTicket(s.ctx, 42, 'nope')).rejects.toMatchObject({ code: 'bad_request' })
    await startTicket(s.ctx, 42, 'acme-api')
    expect(s.start).toHaveBeenCalledWith(expect.objectContaining({ project: 'acme-api' }))
  })

  it('opens the session already started for the ticket while it is listed', async () => {
    const s = withReading({ projects: [{ monoku: 'acme/web', project: 'acme-web' }] })
    await startTicket(s.ctx, 42)
    s.sessions.push({ project: 'acme-web', sessionDir: 'work-1' })
    expect(await startTicket(s.ctx, 42)).toEqual({ session: { project: 'acme-web', sessionDir: 'work-1' }, reused: true })
    expect(s.start).toHaveBeenCalledTimes(1)
    s.sessions.length = 0
    await startTicket(s.ctx as ForgeContext, 42)
    expect(s.start).toHaveBeenCalledTimes(2)
  })
})

describe('projects from the repository', () => {
  const withRepo = { ...ticket, repo: 'example/acme-web' }

  it('finds the CW project whose origin is the ticket repository', async () => {
    const s = stub()
    s.remotes['/p/acme-web'] = 'git@github.com:example/acme-web.git'
    s.remotes['/p/acme-api'] = 'https://github.com/example/acme-api'
    expect(await projectsFor(s.ctx, withRepo)).toEqual(['acme-web'])
    expect(await projectsFor(s.ctx, ticket)).toEqual([])
  })

  it('lets a mapping in settings win over the repository', async () => {
    const s = stub({ projects: [{ monoku: 'acme/web', project: 'acme-api' }] })
    s.remotes['/p/acme-web'] = 'https://github.com/example/acme-web'
    expect(await projectsFor(s.ctx, withRepo)).toEqual(['acme-api'])
  })

  it('starts in the matched project without asking', async () => {
    const s = stub()
    s.remotes['/p/acme-web'] = 'https://github.com/example/acme-web'
    s.store.set('reading', { at: 'x', tickets: [withRepo], solicitudes: [], dropped: 0 })
    await startTicket(s.ctx, 42)
    expect(s.start).toHaveBeenCalledWith(expect.objectContaining({ project: 'acme-web' }))
  })

  it('reads the remotes once for ten minutes', async () => {
    const s = stub()
    await projectsFor(s.ctx, withRepo)
    await projectsFor(s.ctx, withRepo)
    expect(s.exec).toHaveBeenCalledTimes(2)
  })
})
