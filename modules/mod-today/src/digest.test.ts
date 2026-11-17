import { describe, it, expect } from 'vitest'
import { parseReaderOutput, parseReaderPending, parseSlackPending, sortPending, type PendingItem, parseReaderProblems, toProblem, dedupe, shouldRead, itemId, parseContext, startedBy, countStart, type Digest, type Item } from './digest'

const known = { projects: ['forge'], sessions: ['forge::task-1'] }
const base = { who: 'Ana', where: '#dev', when: '2026-11-15T09:00:00Z', title: 'Something' }

function out(items: unknown[]): string {
  return JSON.stringify({ items })
}

describe('parseReaderOutput', () => {
  it('accepts the four kinds with links', () => {
    const items = parseReaderOutput(
      `Here you go:\n${out([
        { ...base, source: 'slack', kind: 'to-task', link: 'https://x.slack.com/s/1', targetSession: { project: 'forge', sessionDir: 'task-1' } },
        { ...base, source: 'linear', kind: 'issue', link: 'https://l/2', issueKey: 'ENG-1', project: 'forge', quote: 'q' },
        { ...base, source: 'slack', kind: 'request', link: 'https://x.slack.com/s/3' },
        { ...base, source: 'slack', kind: 'research', link: 'https://x.slack.com/s/4' },
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
    expect(() => parseReaderOutput(out([{ ...base, source: 'slack', kind: 'chore', link: 'https://x.slack.com/s/1' }]), known)).toThrow(/kind/)
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
    expect(() => parseReaderOutput(out([{ ...base, when: 'yesterday', source: 'slack', kind: 'request', link: 'https://x.slack.com/s/1' }]), known)).toThrow(/when must be a date/)
  })

  it('accepts source github and kind review', () => {
    const [a] = parseReaderOutput(out([{ ...base, source: 'github', kind: 'review', link: 'https://github.com/o/r/pull/9', project: 'forge' }]), known)
    expect([a.source, a.kind, a.project]).toEqual(['github', 'review', 'forge'])
  })

  it('still refuses a github link that is not http(s)', () => {
    expect(() => parseReaderOutput(out([{ ...base, source: 'github', kind: 'review', link: 'javascript:alert(1)' }]), known)).toThrow(/http/)
  })

  it('demotes a to-task item with an unknown session', () => {
    const gone = { project: 'forge', sessionDir: 'gone' }
    const [a, b] = parseReaderOutput(
      out([
        { ...base, source: 'linear', kind: 'to-task', link: 'https://l/1', issueKey: 'ENG-1', targetSession: gone },
        { ...base, source: 'slack', kind: 'to-task', link: 'https://x.slack.com/s/2', targetSession: gone },
      ]),
      known,
    )
    expect([a.kind, b.kind]).toEqual(['issue', 'request'])
  })

  it('drops an unknown project and session', () => {
    const [a, b] = parseReaderOutput(
      out([
        { ...base, source: 'linear', kind: 'issue', link: 'https://l/1', project: 'nope' },
        { ...base, source: 'slack', kind: 'to-task', link: 'https://x.slack.com/s/2', targetSession: { project: 'forge', sessionDir: 'gone' } },
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
    const seen = mk('https://x.slack.com/s/1', '2026-11-15T09:00:00Z')
    const same = mk('https://x.slack.com/s/2', '2026-11-15T09:00:00Z')
    const newer = mk('https://x.slack.com/s/3', '2026-11-15T11:00:00Z')
    const fresh = mk('https://x.slack.com/s/4', '2026-11-15T08:00:00Z')
    const handled = { [seen.id]: seen.when, [same.id]: same.when, [newer.id]: '2026-11-15T10:00:00Z' }
    expect(dedupe([seen, same, newer, fresh], handled).map(i => i.link)).toEqual(['https://x.slack.com/s/3', 'https://x.slack.com/s/4'])
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

describe('accounts', () => {
  it('the account is part of a linear or slack id but not a github one', () => {
    expect(itemId('slack', 'https://x.slack.com/s/1', 'a')).not.toBe(itemId('slack', 'https://x.slack.com/s/1', 'b'))
    expect(itemId('github', 'https://g/1', 'a')).toBe(itemId('github', 'https://g/1', 'b'))
    expect(itemId('slack', 'https://x.slack.com/s/1')).toBe(itemId('slack', 'https://x.slack.com/s/1', undefined))
  })

  it('parsed items carry the reader account', () => {
    const [i] = parseReaderOutput(out([{ ...base, source: 'slack', kind: 'request', link: 'https://x.slack.com/s/1' }]), { ...known, account: 'meridian' })
    expect(i.account).toBe('meridian')
  })

  it('counts research starts per account and reads an old number', () => {
    const d = { autoStarted: 2 } as Digest
    expect(startedBy(d, 'a')).toBe(2)
    countStart(d, 'a')
    expect(d.autoStarted).toEqual({ a: 3 })
    expect(startedBy(d, 'b')).toBe(0)
  })
})

describe('parseReaderProblems', () => {
  const body = (problems: unknown[]) => JSON.stringify({ items: [], problems })

  it('keeps only Slack and Linear problems, case-insensitively', () => {
    expect(parseReaderProblems(body(['slack: down', 'Linear: unavailable', 'github: the fetched events list was empty', 'tools missing']))).toEqual(['slack: down', 'Linear: unavailable'])
  })

  it('keeps a failure that names Slack or Linear anywhere, and drops only GitHub-first ones', () => {
    expect(parseReaderProblems(body(['claude.ai Slack connector down', 'the Linear tools are missing', 'GitHub: slack link was empty']))).toEqual(['claude.ai Slack connector down', 'the Linear tools are missing'])
  })

  it('is empty when nothing is a problem', () => {
    expect(parseReaderProblems(body(['github: nothing']))).toEqual([])
    expect(parseReaderProblems('no json')).toEqual([])
  })
})

describe('toProblem', () => {
  it('names the source a phrased problem mentions', () => {
    expect(toProblem('meridian', 'claude.ai Slack connector down').source).toBe('slack')
    expect(toProblem('meridian', 'linear: unavailable')).toEqual({ account: 'meridian', source: 'linear', reason: 'unavailable' })
    expect(toProblem('meridian', 'timed out').source).toBe('reader')
  })
})

describe('reader pending', () => {
  const NOW = new Date('2026-11-16T12:00:00Z')
  const known = { projects: ['forge'], sessions: ['forge::t1'], account: 'monoku' }
  const entry = (over: Record<string, unknown> = {}) => ({ issueKey: 'MOB-1', title: 'Fix', state: 'In Progress', started: true, link: 'https://linear.app/x/issue/MOB-1', when: '2026-11-15T10:00:00Z', ...over })
  const out = (pending: unknown[]) => JSON.stringify({ items: [], pending })

  it('keeps valid entries with account, known project and session only', () => {
    const [p] = parseReaderPending(out([entry({ project: 'forge', targetSession: { project: 'forge', sessionDir: 't1' } })]), known, NOW)!
    expect(p).toMatchObject({ source: 'linear', kind: 'issue', account: 'monoku', project: 'forge', targetSession: { project: 'forge', sessionDir: 't1' }, started: true, issueKey: 'MOB-1' })
    const [q] = parseReaderPending(out([entry({ project: 'nope', targetSession: { project: 'x', sessionDir: 'y' } })]), known, NOW)!
    expect(q.project).toBeUndefined()
    expect(q.targetSession).toBeUndefined()
  })

  it('drops bad links, GitHub links, bad dates and anything older than 30 days', () => {
    const list = parseReaderPending(out([entry({ link: 'javascript:alert(1)' }), entry({ link: 'https://github.com/o/r/pull/1' }), entry({ when: 'soon' }), entry({ when: '2026-10-01T00:00:00Z' }), entry({ title: '' }), entry()]), known, NOW)!
    expect(list).toHaveLength(1)
  })

  it('is undefined when the reader gave no pending list', () => {
    expect(parseReaderPending('{"items":[]}', known, NOW)).toBeUndefined()
    expect(parseReaderPending('nonsense', known, NOW)).toBeUndefined()
    expect(parseReaderPending(out([]), known, NOW)).toEqual([])
  })

  it('sorts failing CI, Slack, review requests, started, issues, unstarted, then newest first', () => {
    const mk = (id: string, over: Partial<PendingItem>): PendingItem => ({ id, source: 'github', kind: 'issue', title: id, link: 'https://x.test', when: '2026-11-10T00:00:00Z', ...over })
    const sorted = sortPending([
      mk('issue', {}),
      mk('lin-un', { source: 'linear' }),
      mk('lin-st-old', { source: 'linear', started: true }),
      mk('review', { kind: 'review' }),
      mk('ci', { kind: 'ci' }),
      mk('lin-st-new', { source: 'linear', started: true, when: '2026-11-12T00:00:00Z' }),
      mk('slack', { source: 'slack', kind: 'reply' }),
    ]).map(p => p.id)
    expect(sorted).toEqual(['ci', 'slack', 'review', 'lin-st-new', 'lin-st-old', 'issue', 'lin-un'])
  })

  it('leaves Slack entries out of the Linear list', () => {
    const slack = { source: 'slack', kind: 'reply', title: 'Can you look?', who: 'Ana', where: '#web', when: '2026-11-16T09:00:00Z', link: 'https://x.slack.com/archives/C1/p1' }
    expect(parseReaderPending(out([entry(), slack]), known, NOW)).toHaveLength(1)
  })
})

describe('Slack links', () => {
  it('drops a Slack item that does not link to slack.com, and keeps a GitHub link for gh to judge', () => {
    const items = parseReaderOutput(out([
      { ...base, source: 'slack', kind: 'request', link: 'https://x.slack.com/archives/C1/p1' },
      { ...base, source: 'slack', kind: 'request', link: 'https://evil.test/p2' },
      { ...base, source: 'slack', kind: 'request', link: 'https://github.com/o/r/pull/1' },
      { ...base, source: 'linear', kind: 'issue', link: 'https://linear.app/x/1' },
    ]), known)
    expect(items.map(i => i.link)).toEqual(['https://x.slack.com/archives/C1/p1', 'https://github.com/o/r/pull/1', 'https://linear.app/x/1'])
  })

  it('drops Slack pending off slack.com', () => {
    const NOW = new Date('2026-11-16T12:00:00Z')
    const m = (link: string) => ({ source: 'slack', kind: 'reply', title: 't', who: 'a', where: '#w', when: '2026-11-15T09:00:00Z', link })
    expect(parseSlackPending(JSON.stringify({ pending: [m('https://evil.test/1'), m('https://a.slack.com/archives/C/p1')] }), known, NOW)!.map(p => p.link)).toEqual(['https://a.slack.com/archives/C/p1'])
  })
})

describe('Slack pending', () => {
  const NOW = new Date('2026-11-16T12:00:00Z')
  const known = { projects: ['forge'], sessions: ['forge::t1'], account: 'monoku' }
  const msg = (over: Record<string, unknown> = {}) => ({ source: 'slack', kind: 'reply', title: 'Can you look?', who: 'Ana', where: '#web', when: '2026-11-15T09:00:00Z', quote: 'ping', link: 'https://x.slack.com/archives/C1/p1', ...over })
  const out = (pending: unknown[]) => JSON.stringify({ items: [], pending })

  it('keeps a message with its account, known project and session only', () => {
    const [p] = parseSlackPending(out([msg({ project: 'forge', targetSession: { project: 'forge', sessionDir: 't1' } })]), known, NOW)!
    expect(p).toMatchObject({ source: 'slack', kind: 'reply', who: 'Ana', where: '#web', quote: 'ping', account: 'monoku', project: 'forge', targetSession: { project: 'forge', sessionDir: 't1' } })
    const [q] = parseSlackPending(out([msg({ project: 'nope', targetSession: { project: 'x', sessionDir: 'y' } })]), known, NOW)!
    expect(q.project).toBeUndefined()
    expect(q.targetSession).toBeUndefined()
  })

  it('drops bad links, GitHub links, missing who or where, and anything older than 7 days', () => {
    const list = parseSlackPending(out([msg({ link: 'javascript:alert(1)' }), msg({ link: 'https://github.com/o/r/pull/1' }), msg({ who: '' }), msg({ where: undefined }), msg({ when: '2026-11-08T00:00:00Z' }), msg({ when: 'soon' }), msg()]), known, NOW)!
    expect(list).toHaveLength(1)
  })

  it('counts the same permalink once, and ignores Linear entries', () => {
    const linear = { title: 'x', link: 'https://linear.app/x/1', when: '2026-11-15T10:00:00Z' }
    expect(parseSlackPending(out([msg(), msg(), linear]), known, NOW)).toHaveLength(1)
  })

  it('is undefined when the reader gave no pending list', () => {
    expect(parseSlackPending('{"items":[]}', known, NOW)).toBeUndefined()
    expect(parseSlackPending(out([]), known, NOW)).toEqual([])
  })
})

describe('context', () => {
  it('trims, caps at 800 characters and strips control characters', () => {
    expect(parseContext('  Ana: hi\nLuis: ok  ')).toBe('Ana: hi\nLuis: ok')
    expect(parseContext('a\u0000b\u001bc\u0007d\r\ne\tf')).toBe('abcd\ne\tf')
    expect(parseContext('x'.repeat(900))).toHaveLength(800)
    for (const bad of [undefined, null, 5, {}, '', '  \n ']) expect(parseContext(bad)).toBeUndefined()
  })

  it('news keeps the reader\'s context as plain text', () => {
    const [i] = parseReaderOutput(out([{ ...base, source: 'slack', kind: 'request', link: 'https://x.slack.com/s/3', context: 'Ana: <b>review</b>\u0000 this' }]), known)
    expect(i.context).toBe('Ana: <b>review</b> this')
    const [j] = parseReaderOutput(out([{ ...base, source: 'slack', kind: 'request', link: 'https://x.slack.com/s/3', context: 7 }]), known)
    expect(j.context).toBeUndefined()
  })

  it('pending Linear and Slack entries keep it too', () => {
    const now = new Date('2026-11-16T09:00:00Z')
    const linear = JSON.stringify({ pending: [{ issueKey: 'E-1', title: 'T', state: 'Todo', link: 'https://linear.app/e/1', when: '2026-11-15T09:00:00Z', context: 'Description: fix it\nLatest comment: soon' }] })
    expect(parseReaderPending(linear, known, now)![0].context).toBe('Description: fix it\nLatest comment: soon')
    const slack = JSON.stringify({ pending: [{ source: 'slack', kind: 'reply', title: 'T', who: 'Ana', where: '#dev', link: 'https://x.slack.com/s/1', when: '2026-11-15T09:00:00Z', context: 'Ana: hi\nLuis: yo' }] })
    expect(parseSlackPending(slack, known, now)![0].context).toBe('Ana: hi\nLuis: yo')
  })
})
