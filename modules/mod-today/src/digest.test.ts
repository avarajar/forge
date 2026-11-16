import { describe, it, expect } from 'vitest'
import { parseReaderOutput, dedupe, shouldRead, itemId, type Item } from './digest'

const known = { projects: ['forge'], sessions: ['forge::task-1'] }
const base = { who: 'Ana', where: '#dev', when: '2026-11-15T09:00:00Z', title: 'Something' }

function out(items: unknown[]): string {
  return JSON.stringify({ items })
}

describe('parseReaderOutput', () => {
  it('accepts the four kinds with links', () => {
    const items = parseReaderOutput(
      `Here you go:\n${out([
        { ...base, source: 'slack', kind: 'to-task', link: 'https://s/1', targetSession: { project: 'forge', sessionDir: 'task-1' } },
        { ...base, source: 'linear', kind: 'issue', link: 'https://l/2', issueKey: 'ENG-1', project: 'forge', quote: 'q' },
        { ...base, source: 'slack', kind: 'request', link: 'https://s/3' },
        { ...base, source: 'slack', kind: 'research', link: 'https://s/4' },
      ])}`,
      known,
    )
    expect(items.map(i => i.kind)).toEqual(['to-task', 'issue', 'request', 'research'])
    expect(items.every(i => i.state === 'proposed' && i.id)).toBe(true)
    expect(items[0].targetSession).toEqual({ project: 'forge', sessionDir: 'task-1' })
    expect(items[1].issueKey).toBe('ENG-1')
  })

  it('rejects non-JSON, truncated JSON and an unknown kind', () => {
    expect(() => parseReaderOutput('nothing here', known)).toThrow(Error)
    expect(() => parseReaderOutput('{"items":[{"kind":', known)).toThrow(Error)
    expect(() => parseReaderOutput(out([{ ...base, source: 'slack', kind: 'chore', link: 'https://s/1' }]), known)).toThrow(/kind/)
    expect(() => parseReaderOutput(out([{ ...base, source: 'slack', kind: 'request' }]), known)).toThrow(/link/)
  })

  it('treats empty optional fields as missing', () => {
    const items = parseReaderOutput(out([{ ...base, source: 'linear', kind: 'issue', link: 'https://l/9', quote: '', issueKey: '  ', project: '' }]), known)
    expect(items).toHaveLength(1)
    expect(items[0].quote).toBeUndefined()
    expect(items[0].issueKey).toBeUndefined()
    expect(items[0].project).toBeUndefined()
    expect(items[0].kind).toBe('issue')
  })

  it('rejects a javascript: link', () => {
    expect(() => parseReaderOutput(out([{ ...base, source: 'slack', kind: 'request', link: 'javascript:alert(1)' }]), known)).toThrow(/http\(s\) URL/)
  })

  it('rejects a link that is not a URL', () => {
    expect(() => parseReaderOutput(out([{ ...base, source: 'slack', kind: 'request', link: 'not a url' }]), known)).toThrow(/http\(s\) URL/)
  })

  it('rejects a when that is not a date', () => {
    expect(() => parseReaderOutput(out([{ ...base, when: 'yesterday', source: 'slack', kind: 'request', link: 'https://s/1' }]), known)).toThrow(/when must be a date/)
  })

  it('demotes a to-task item with an unknown session', () => {
    const gone = { project: 'forge', sessionDir: 'gone' }
    const [a, b] = parseReaderOutput(
      out([
        { ...base, source: 'linear', kind: 'to-task', link: 'https://l/1', issueKey: 'ENG-1', targetSession: gone },
        { ...base, source: 'slack', kind: 'to-task', link: 'https://s/2', targetSession: gone },
      ]),
      known,
    )
    expect([a.kind, b.kind]).toEqual(['issue', 'request'])
  })

  it('drops an unknown project and session', () => {
    const [a, b] = parseReaderOutput(
      out([
        { ...base, source: 'linear', kind: 'issue', link: 'https://l/1', project: 'nope' },
        { ...base, source: 'slack', kind: 'to-task', link: 'https://s/2', targetSession: { project: 'forge', sessionDir: 'gone' } },
      ]),
      known,
    )
    expect(a.project).toBeUndefined()
    expect(b.targetSession).toBeUndefined()
  })
})

describe('dedupe', () => {
  it('keeps only newer activity', () => {
    const mk = (link: string, when: string): Item => ({ ...base, id: itemId('slack', link), source: 'slack', kind: 'request', link, when, state: 'proposed' })
    const seen = mk('https://s/1', '2026-11-15T09:00:00Z')
    const same = mk('https://s/2', '2026-11-15T09:00:00Z')
    const newer = mk('https://s/3', '2026-11-15T11:00:00Z')
    const fresh = mk('https://s/4', '2026-11-15T08:00:00Z')
    const handled = { [seen.id]: seen.when, [same.id]: same.when, [newer.id]: '2026-11-15T10:00:00Z' }
    expect(dedupe([seen, same, newer, fresh], handled).map(i => i.link)).toEqual(['https://s/3', 'https://s/4'])
  })
})

describe('shouldRead', () => {
  const at = (h: number, m = 0) => new Date(2026, 10, 15, h, m)
  it('before 08:00 is false, after is true, false once read today', () => {
    expect(shouldRead(at(7, 59), '08:00', new Date(2026, 10, 14, 9).toISOString())).toBe(false)
    expect(shouldRead(at(8, 0), '08:00', new Date(2026, 10, 14, 9).toISOString())).toBe(true)
    expect(shouldRead(at(10), '08:00', at(8, 5).toISOString())).toBe(false)
    expect(shouldRead(at(3), '08:00')).toBe(true)
  })
})
