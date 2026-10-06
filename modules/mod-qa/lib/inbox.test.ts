import { describe, it, expect } from 'vitest'
import { readGh, readGhRun, readPng, timeAgo, checkMark } from './inbox.js'

describe('readGh', () => {
  it('parses the JSON gh printed', () => {
    expect(readGh<{ number: number }[]>({ exitCode: 0, output: '[{"number":42}]\n' })).toEqual({ ok: true, data: [{ number: 42 }] })
  })

  it('reports a failed gh run with its output', () => {
    const r = readGh({ exitCode: 4, output: 'To get started with GitHub CLI, please run:  gh auth login\n' })
    expect(r).toEqual({ ok: false, message: 'To get started with GitHub CLI, please run:  gh auth login' })
  })

  it('reports output that is not JSON', () => {
    expect(readGh({ exitCode: 0, output: 'sh: gh: command not found' })).toMatchObject({ ok: false })
  })

  it('reports a request Forge refused', () => {
    expect(readGh({ error: 'Param PR does not match \\d+' })).toEqual({ ok: false, message: 'Param PR does not match \\d+' })
  })

  it('reports a timeout', () => {
    expect(readGh({ exitCode: 1, output: '', timedOut: true })).toMatchObject({ ok: false })
  })
})

describe('readGhRun', () => {
  it('succeeds on exit 0 whatever gh printed', () => {
    expect(readGhRun({ exitCode: 0, output: 'https://github.com/o/r/pull/42\n' })).toEqual({ ok: true, data: 'https://github.com/o/r/pull/42' })
  })

  it('fails with gh output on a non-zero exit', () => {
    expect(readGhRun({ exitCode: 1, output: 'HTTP 403\n' })).toEqual({ ok: false, message: 'HTTP 403' })
  })

  it('fails on a refused request', () => {
    expect(readGhRun({ error: 'Param MSG does not match' })).toEqual({ ok: false, message: 'Param MSG does not match' })
  })
})

describe('timeAgo', () => {
  const now = Date.parse('2026-10-02T12:00:00Z')
  it('speaks Spanish', () => {
    expect(timeAgo('2026-10-02T11:59:40Z', now)).toBe('ahora')
    expect(timeAgo('2026-10-02T11:59:00Z', now)).toBe('hace 1 min')
    expect(timeAgo('2026-10-02T09:00:00Z', now)).toBe('hace 3 h')
    expect(timeAgo('2026-09-29T12:00:00Z', now)).toBe('hace 3 d')
  })

  it('is empty for an unreadable date', () => {
    expect(timeAgo('nope', now)).toBe('')
  })
})

describe('checkMark', () => {
  it('maps statuses to marks', () => {
    expect(checkMark('pass')).toBe('✓')
    expect(checkMark('fail')).toBe('✗')
    expect(checkMark('warn')).toBe('!')
  })
})

describe('readPng', () => {
  const png = btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2))
  it('turns the base64 gh printed into a data URL', () => {
    expect(readPng({ exitCode: 0, output: `${png}\n` })).toEqual({ ok: true, data: `data:image/png;base64,${png}` })
  })
  it('refuses anything that is not a PNG, and keeps gh errors', () => {
    expect(readPng({ exitCode: 0, output: btoa('<svg onload=x>') })).toEqual({ ok: false, message: 'la imagen no es un PNG' })
    expect(readPng({ exitCode: 1, output: 'HTTP 404: Not Found' })).toEqual({ ok: false, message: 'HTTP 404: Not Found' })
  })
})
