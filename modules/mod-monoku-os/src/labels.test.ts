import { describe, it, expect } from 'vitest'
import { ago, bannerRows, byClient, casillaLabel, pendientes, urgent, words } from './labels'

const now = new Date('2026-11-19T12:00:00Z')

describe('labels', () => {
  it('reads values as words', () => {
    expect(words('aprobar_el_trabajo')).toBe('aprobar el trabajo')
    expect(casillaLabel('construccion')).toBe('construcción')
    expect(casillaLabel('reporte')).toBe('reporte')
    expect(pendientes(1)).toBe('1 pendiente')
    expect(pendientes(3)).toBe('3 pendientes')
  })

  it('says how long ago', () => {
    expect(ago('2026-11-19T11:59:40Z', now)).toBe('ahora')
    expect(ago('2026-11-19T11:48:00Z', now)).toBe('hace 12 min')
    expect(ago('2026-11-19T09:00:00Z', now)).toBe('hace 3 h')
    expect(ago('2026-11-18T10:00:00Z', now)).toBe('hace 1 día')
    expect(ago(undefined, now)).toBe('')
  })

  it('treats blocking or overdue requests as urgent', () => {
    expect(urgent({ id: 1, queSePide: 'x', paraMi: true, bloquea: true }, now)).toBe(true)
    expect(urgent({ id: 1, queSePide: 'x', paraMi: true, bloquea: false, venceEn: '2026-11-19T11:00:00Z' }, now)).toBe(true)
    expect(urgent({ id: 1, queSePide: 'x', paraMi: true, bloquea: false, venceEn: '2026-11-20T00:00:00Z' }, now)).toBe(false)
  })

  it('orders banner rows urgent first, then red tickets, capped', () => {
    const tickets = [{ numero: 1, titulo: 'a' }, { numero: 2, titulo: 'b', color: 'rojo' as const }]
    const sols = [{ id: 9, queSePide: 'calm', paraMi: true, bloquea: false }, { id: 8, queSePide: 'urgent', paraMi: true, bloquea: true }]
    const { rows, more } = bannerRows(tickets, sols, 3, now)
    expect(rows.map(r => (r.kind === 'ticket' ? `t${r.item.numero}` : `s${r.item.id}`))).toEqual(['s8', 't2', 't1'])
    expect(more).toBe(1)
  })

  it('groups tickets by client', () => {
    expect(byClient([{ numero: 1, titulo: 'a', cliente: 'acme' }, { numero: 2, titulo: 'b', proyecto: 'beta/app' }, { numero: 3, titulo: 'c', cliente: 'acme' }]).map(([k, v]) => [k, v.length])).toEqual([['acme', 2], ['beta', 1]])
  })
})
