import { describe, it, expect } from 'vitest'
import { extractJson, normalizeRepo, parseClientes, parseReading, repoFor } from './parse'

const yo = { persona: { nombre: 'José Andrade', usuario: 'jose', correo: 'jose@monoku.com' }, sombreros: [] }

describe('extractJson', () => {
  it('reads bare, fenced and prose-wrapped JSON', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 })
    expect(extractJson('Aquí está:\n```json\n{"a":2}\n```')).toEqual({ a: 2 })
    expect(extractJson('Resultado: {"a":3} listo')).toEqual({ a: 3 })
  })

  it('throws upstream on no JSON', () => {
    expect(() => extractJson('no tengo acceso')).toThrow(/did not answer JSON/)
  })
})

describe('parseReading', () => {
  it('maps tickets from the schema names', () => {
    const r = parseReading(JSON.stringify({
      yo,
      me_toca: {
        tickets: [{ id: 42, titulo: 'Login con Google', proyecto: { nombre: 'web', cliente: { nombre: 'acme' } }, casilla: 'aprobacion', siguiente_paso: 'aprobar_el_trabajo', color_efectivo: 'rojo', espera: 'sin_espera', casilla_desde: '2026-11-18T10:00:00Z', fecha_prometida_al_cliente: '2026-11-30', le_toca_a_nombre: 'José' }],
        solicitudes: [],
      },
    }))
    expect(r).toEqual({
      tickets: [{ numero: 42, titulo: 'Login con Google', cliente: 'acme', proyecto: 'acme/web', casilla: 'aprobacion', siguientePaso: 'aprobar el trabajo', leTocaA: 'José', color: 'rojo', espera: 'sin_espera', desde: '2026-11-18T10:00:00Z', fechaPrometida: '2026-11-30' }],
      solicitudes: [],
      yo: { nombre: 'José Andrade', usuario: 'jose', correo: 'jose@monoku.com' },
      dropped: 0,
    })
  })

  it('reads a real tablero row, with closed values as { valor, frase }', () => {
    const row = { numero: 1, titulo: 'Modo oscuro para el equipo', proyecto: 'Reservas', casilla: { valor: 'definicion', frase: 'definición' }, color_efectivo: { valor: 'ambar', frase: 'ámbar' }, por_que_el_color_efectivo: 'declarado', espera: { valor: 'sin_espera', frase: 'sin espera' }, siguiente_paso: { valor: 'responder_la_pregunta', frase: 'responder la pregunta' }, le_toca_a_nombre: 'Marta', pendientes_para_aprobar: 3, avisos: 0, edad_en_la_casilla: 'hace 15 días' }
    const empty = { ...row, numero: 32, color_efectivo: { valor: '', frase: '' } }
    const r = parseReading(JSON.stringify({ tickets: [row, empty], solicitudes: [{ id: 5, que_se_pide: 'x', tipo_de_solicitud: { valor: 'pregunta', frase: 'pregunta' } }] }))
    if (!('tickets' in r)) throw new Error('expected a reading')
    expect(r.tickets[0]).toEqual({ numero: 1, titulo: 'Modo oscuro para el equipo', proyecto: 'Reservas', casilla: 'definición', siguientePaso: 'responder la pregunta', leTocaA: 'Marta', color: 'ambar', espera: 'sin_espera', edad: 'hace 15 días' })
    expect(r.tickets[1].color).toBeUndefined()
    expect(r.solicitudes[0].tipo).toBe('pregunta')
  })

  it('keeps a proyecto already written as cliente/proyecto', () => {
    const r = parseReading(JSON.stringify({ tickets: [{ numero: 7, titulo: 'x', cliente: 'beta', proyecto: 'beta/app' }], solicitudes: [] }))
    expect('tickets' in r && r.tickets[0].proyecto).toBe('beta/app')
  })

  it('marks requests addressed to José and not the ones he carries', () => {
    const r = parseReading(JSON.stringify({
      yo,
      me_toca: {
        tickets: [],
        solicitudes: [
          { id: 12, ticket: 57, tipo_de_solicitud: 'pregunta', que_se_pide: '¿El CSV incluye los borrados?', autor_persona: { nombre: 'Ana' }, destinatario_persona: { usuario: 'jose', nombre: 'José Andrade' }, destinatario_nombre: 'José', bloquea_el_trabajo: true, vence_en: '2026-11-20T00:00:00Z' },
          { id: 13, ticket: { id: 57 }, tipo_de_solicitud: 'pregunta', que_se_pide: '¿Aprueban el color?', destinatario_nombre: 'el cliente', quien_la_lleva_de_monoku: { usuario: 'jose' } },
        ],
      },
    }))
    if (!('solicitudes' in r)) throw new Error('expected a reading')
    expect(r.solicitudes).toEqual([
      { id: 12, ticket: 57, tipo: 'pregunta', queSePide: '¿El CSV incluye los borrados?', autor: 'Ana', destinatario: 'José', paraMi: true, bloquea: true, venceEn: '2026-11-20T00:00:00Z' },
      { id: 13, ticket: 57, tipo: 'pregunta', queSePide: '¿Aprueban el color?', destinatario: 'el cliente', paraMi: false, bloquea: false },
    ])
  })

  it('never marks a request as mine without knowing who I am', () => {
    const r = parseReading(JSON.stringify({ tickets: [], solicitudes: [{ id: 1, que_se_pide: 'x', destinatario_persona: { usuario: 'jose' } }] }))
    expect('solicitudes' in r && r.solicitudes[0].paraMi).toBe(false)
  })

  it('drops and counts items without an id or a title', () => {
    const r = parseReading(JSON.stringify({ tickets: [{ titulo: 'sin número' }, { id: 3 }, 'x', { id: 4, titulo: 'ok' }], solicitudes: [{ id: 9 }] }))
    expect(r).toMatchObject({ tickets: [{ numero: 4, titulo: 'ok' }], solicitudes: [], dropped: 4 })
  })

  it('passes a problem through', () => {
    expect(parseReading('{"problem":"the Monoku OS tools are not available"}')).toEqual({ problem: 'the Monoku OS tools are not available' })
  })

  it('throws when tickets or solicitudes are missing', () => {
    expect(() => parseReading('{"yo":{}}')).toThrow(/without tickets and solicitudes/)
  })
})

describe('repositories from clientes', () => {
  const clientes = { clientes: [
    { id: 1, nombre: 'Acme', proyectos: [{ nombre: 'Reservas', repositorio: 'https://github.com/example/acme-reservas' }, { nombre: 'Web', repositorio: '' }, { nombre: 'App', repositorio: 'https://github.com/example/acme-app' }] },
    { id: 2, nombre: 'Otro', proyectos: [{ nombre: 'App', repositorio: 'git@github.com:example/otro-app.git' }] },
  ] }

  it('normalizes GitHub URLs to owner/name', () => {
    expect(normalizeRepo('https://github.com/Example/Acme-POS.git')).toBe('example/acme-pos')
    expect(normalizeRepo('git@github.com:example/x.git\n')).toBe('example/x')
    expect(normalizeRepo('')).toBeUndefined()
  })

  it('keeps only projects with a repository', () => {
    expect(parseClientes(clientes)).toEqual([
      { cliente: 'Acme', proyecto: 'Reservas', repo: 'example/acme-reservas' },
      { cliente: 'Acme', proyecto: 'App', repo: 'example/acme-app' },
      { cliente: 'Otro', proyecto: 'App', repo: 'example/otro-app' },
    ])
    expect(parseClientes(null)).toEqual([])
  })

  it('matches a ticket by project, and by client when the name is shared', () => {
    const repos = parseClientes(clientes)
    expect(repoFor(repos, { proyecto: 'Reservas' })).toBe('example/acme-reservas')
    expect(repoFor(repos, { proyecto: 'App' })).toBeUndefined()
    expect(repoFor(repos, { proyecto: 'App', cliente: 'Otro' })).toBe('example/otro-app')
    expect(repoFor(repos, { proyecto: 'acme/app' })).toBe('example/acme-app')
  })

  it('puts the repository on each ticket of a reading', () => {
    const r = parseReading(JSON.stringify({ me_toca: { tickets: [{ numero: 1, titulo: 'x', proyecto: 'Reservas' }, { numero: 2, titulo: 'y', proyecto: 'Web' }], solicitudes: [] }, clientes }))
    expect('tickets' in r && r.tickets.map(t => t.repo)).toEqual(['example/acme-reservas', undefined])
  })
})
