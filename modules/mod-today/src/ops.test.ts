import { describe, it, expect } from 'vitest'
import { acceptable, canHide, canResearch, inboxGroups, initialSelection, isGroupFolded, isUnread, keyCommand, moveFor, moveSelection, needsProject, parseLastSeen, parseTriage, triageCounts, triageDeck, triageNext, triageProgress, triageSummary, visibleEntries, type Entry, isSlackLink, ageShort, bannerSummary, countFor, filterNews, filterPending, matchesQuery, newsList, NO_FILTERS, parseFilters, safeHref, summaryText, urgentRows } from './ops'
import type { Item, PendingItem } from './digest'

const news = (over: Partial<Item> = {}): Item => ({ id: 'n', source: 'linear', kind: 'issue', title: 'Moved to review', who: 'Ana', where: 'Linear', when: '2026-11-16T08:00:00Z', link: 'https://linear.app/x', state: 'proposed', account: 'monoku', ...over })
const pend = (over: Partial<PendingItem> = {}): PendingItem => ({ id: 'p', source: 'linear', kind: 'issue', title: 'Fix login', link: 'https://linear.app/y', when: '2026-11-15T08:00:00Z', account: 'meridian', ...over })

describe('search', () => {
  it('matches title, key, who and where, case-insensitively', () => {
    const x = news({ title: 'Ship it', issueKey: 'MER-9138', who: 'Luis', where: '#Web' })
    for (const q of ['ship', 'mer-9138', 'LUIS', '#web']) expect(matchesQuery(x, q)).toBe(true)
    expect(matchesQuery(x, 'nope')).toBe(false)
    expect(matchesQuery(x, '  ')).toBe(true)
  })

  it('looks at a pending item\'s repository and Slack author', () => {
    expect(matchesQuery(pend({ repo: 'o/forge' }), 'forge')).toBe(true)
    expect(matchesQuery(pend({ source: 'slack', kind: 'reply', who: 'Ana', where: '#web' }), 'ana')).toBe(true)
  })
})

describe('filters', () => {
  const items = [news({ id: '1' }), news({ id: '2', account: 'meridian', source: 'slack' }), news({ id: '3', source: 'github' })]

  it('combine account, source and search', () => {
    expect(filterNews(items, { ...NO_FILTERS, account: 'meridian' }).map(i => i.id)).toEqual(['2'])
    expect(filterNews(items, { ...NO_FILTERS, source: 'github' }).map(i => i.id)).toEqual(['3'])
    expect(filterNews(items, { account: 'monoku', source: 'slack', query: '' })).toEqual([])
    expect(filterPending([pend(), pend({ id: 'q', title: 'Other' })], { ...NO_FILTERS, query: 'other' }).map(p => p.id)).toEqual(['q'])
  })

  it('counts each pill under the other filter and the search', () => {
    const c = countFor(items, [pend({ source: 'slack', kind: 'reply' })], { ...NO_FILTERS, account: 'meridian' })
    expect(c.sources).toEqual({ linear: 0, slack: 2, github: 0 })
    expect(c.accounts).toEqual({ monoku: 2, meridian: 2 })
    expect(c.total).toBe(4)
  })

  it('reads stored filters and survives garbage', () => {
    expect(parseFilters('{"account":"a","source":"slack","query":"x"}')).toEqual({ account: 'a', source: 'slack', query: 'x' })
    expect(parseFilters('{"source":"jira","account":3}')).toEqual(NO_FILTERS)
    expect(parseFilters('nonsense')).toEqual(NO_FILTERS)
    expect(parseFilters(null)).toEqual(NO_FILTERS)
  })
})

describe('news list', () => {
  it('drops dismissed, lists waiting first then the latest', () => {
    const list = newsList([news({ id: 'done', state: 'done', when: '2026-11-16T09:00:00Z' }), news({ id: 'old', when: '2026-11-16T07:00:00Z' }), news({ id: 'new' }), news({ id: 'gone', state: 'dismissed' })])
    expect(list.map(i => i.id)).toEqual(['new', 'old', 'done'])
  })
})

describe('age and links', () => {
  const now = new Date('2026-11-16T12:00:00Z')
  it('uses one short unit', () => {
    expect(ageShort('2026-11-16T11:59:40Z', now)).toBe('now')
    expect(ageShort('2026-11-16T11:30:00Z', now)).toBe('30m')
    expect(ageShort('2026-11-16T09:00:00Z', now)).toBe('3h')
    expect(ageShort('2026-11-13T12:00:00Z', now)).toBe('3d')
    expect(ageShort('soon', now)).toBe('')
  })

  it('opens http(s) only', () => {
    expect(safeHref('https://x.slack.com/a')).toBe('https://x.slack.com/a')
    expect(safeHref('javascript:alert(1)')).toBeUndefined()
  })
})

describe('accept and Slack links', () => {
  it('accepts only open items that have what they need', () => {
    const list = [news({ id: 'ready', kind: 'request', project: 'forge' }), news({ id: 'needs-project', kind: 'request' }), news({ id: 'done', kind: 'request', project: 'forge', state: 'done' }), news({ id: 'research', kind: 'research' })]
    expect(acceptable(list).map(i => i.id)).toEqual(['ready', 'research'])
  })

  it('takes slack.com and its subdomains only', () => {
    expect(isSlackLink('https://x.slack.com/archives/C1/p1')).toBe(true)
    expect(isSlackLink('https://slack.com/x')).toBe(true)
    for (const bad of ['https://evilslack.com/x', 'https://slack.com.evil.test/x', 'https://x.test/1', 'javascript:alert(1)', 'nope']) expect(isSlackLink(bad)).toBe(false)
  })
})

describe('account counts', () => {
  it('the account pills with No account add up to All', () => {
    const items = [news({ id: '1' }), news({ id: '2', account: 'meridian' }), news({ id: '3', account: undefined, source: 'github' })]
    const c = countFor(items, [pend({ account: undefined })], { ...NO_FILTERS, query: '' })
    expect(Object.values(c.accounts).reduce((a, b) => a + b, 0) + c.noAccount).toBe(c.total)
    expect(c.noAccount).toBe(2)
    expect(filterNews(items, { ...NO_FILTERS, account: '__none__' }).map(i => i.id)).toEqual(['3'])
  })
})

describe('banner summary', () => {
  const pending = [pend({ source: 'github', kind: 'ci', id: 'c1' }), pend({ source: 'slack', kind: 'reply', id: 's1' }), pend({ source: 'slack', kind: 'reply', id: 's2' }), pend({ id: 'l1' })]
  const items = [news({ id: 'a' }), news({ id: 'b', state: 'done' }), news({ id: 'c', state: 'failed' })]

  it('counts new items waiting and the urgent pending ones', () => {
    expect(summaryText(bannerSummary(items, pending))).toBe('2 new · 4 pending (1 CI · 2 Slack)')
    expect(summaryText(bannerSummary([], [pend()]))).toBe('0 new · 1 pending')
  })

  it('shows at most three urgent rows: CI, Slack, and the newest open news last', () => {
    const rows = urgentRows(items, pending)
    expect(rows.map(r => r.item.id)).toEqual(['c1', 's1', 'a'])
    expect(urgentRows([], pending).map(r => r.item.id)).toEqual(['c1', 's1', 's2'])
    expect(urgentRows(items, [pending[0]]).map(r => r.item.id)).toEqual(['c1', 'a', 'c'])
    expect(urgentRows([], [pend()])).toEqual([])
  })
})

const N = (over: Partial<Item> = {}): Entry => ({ kind: 'news', item: news(over) })
const P = (over: Partial<PendingItem> = {}): Entry => ({ kind: 'pending', item: pend(over) })

describe('inbox groups', () => {
  const news1 = [news({ id: 'open' }), news({ id: 'failed', state: 'failed' }), news({ id: 'done', state: 'done' })]
  const pending = [
    pend({ id: 'ci', source: 'github', kind: 'ci' }), pend({ id: 'reply', source: 'slack', kind: 'reply' }), pend({ id: 'rev', source: 'github', kind: 'review' }),
    pend({ id: 'prog', started: true }), pend({ id: 'issue', source: 'github' }), pend({ id: 'todo' }),
  ]

  it('puts CI, Slack and open news under Needs you, reviews and started work in progress, the rest to do and finished news under Updates', () => {
    const g = inboxGroups(news1, pending)
    expect(g.map(x => x.id)).toEqual(['needs', 'progress', 'todo', 'updates'])
    expect(g.map(x => x.title)).toEqual(['Needs you', 'In progress', 'To do', 'Updates'])
    expect(g.map(x => x.entries.map(e => e.item.id))).toEqual([['ci', 'reply', 'open', 'failed'], ['rev', 'prog'], ['issue', 'todo'], ['done']])
  })

  it('leaves empty groups out and folds only To do by default', () => {
    const g = inboxGroups([], [pend({ id: 'a', started: true }), pend({ id: 'b' })])
    expect(g.map(x => x.id)).toEqual(['progress', 'todo'])
    expect(g.map(x => isGroupFolded(x, {}))).toEqual([false, true])
    expect(g.map(x => isGroupFolded(x, { progress: true, todo: false }))).toEqual([true, false])
  })

  it('lists the entries of unfolded groups, and all of them while searching', () => {
    const g = inboxGroups(news1, pending)
    expect(visibleEntries(g, {}, false).map(e => e.item.id)).toEqual(['ci', 'reply', 'open', 'failed', 'rev', 'prog', 'done'])
    expect(visibleEntries(g, { needs: true }, false).map(e => e.item.id)).toEqual(['rev', 'prog', 'done'])
    expect(visibleEntries(g, { needs: true }, true)).toHaveLength(9)
  })

  it('selects the first of Needs you, else the first listed', () => {
    const g = inboxGroups(news1, pending)
    expect(initialSelection(visibleEntries(g, {}, false))).toBe('ci')
    expect(initialSelection(visibleEntries(inboxGroups([], [pend({ id: 'x', started: true })]), {}, false))).toBe('x')
    expect(initialSelection([])).toBeNull()
  })
})

describe('selection and unread', () => {
  it('moves by one and stops at the ends', () => {
    const ids = ['a', 'b', 'c']
    expect(moveSelection(ids, 'a', 1)).toBe('b')
    expect(moveSelection(ids, 'c', 1)).toBe('c')
    expect(moveSelection(ids, 'a', -1)).toBe('a')
    expect(moveSelection(ids, 'gone', 1)).toBe('a')
    expect(moveSelection(ids, null, -1)).toBe('a')
    expect(moveSelection([], 'a', 1)).toBeNull()
  })

  it('an item is unread when it is newer than the last visit; the first visit marks nothing', () => {
    expect(isUnread('2026-11-16T10:00:00Z', Date.parse('2026-11-16T09:00:00Z'))).toBe(true)
    expect(isUnread('2026-11-16T08:00:00Z', Date.parse('2026-11-16T09:00:00Z'))).toBe(false)
    expect(isUnread('2026-11-16T10:00:00Z', null)).toBe(false)
    expect(isUnread('soon', 5)).toBe(false)
  })

  it('reads the stored visit time and survives garbage', () => {
    expect(parseLastSeen('1763280000000')).toBe(1763280000000)
    for (const bad of [null, undefined, '', 'x', '-4', 'NaN']) expect(parseLastSeen(bad)).toBeNull()
  })
})

describe('what an entry can do', () => {
  it('news: its verb, Retry when failed, Open session when done', () => {
    expect(moveFor(N({ kind: 'to-task', targetSession: { project: 'p', sessionDir: 's' } }))).toEqual({ label: 'Send', kind: 'op', ready: true })
    expect(moveFor(N({ kind: 'review', project: 'forge' }))?.label).toBe('Review')
    expect(moveFor(N({ kind: 'research' }))).toEqual({ label: 'Research', kind: 'op', ready: true })
    expect(moveFor(N({ kind: 'request', state: 'failed', project: 'forge' }))?.label).toBe('Retry')
    expect(moveFor(N({ state: 'done', startedSession: { project: 'p', sessionDir: 's' } }))).toEqual({ label: 'Open session', kind: 'session', ready: true })
    expect(moveFor(N({ state: 'done' }))).toBeNull()
  })

  it('a task that needs a project is not ready until one is picked', () => {
    expect(needsProject(N({ kind: 'request' }))).toBe(true)
    expect(moveFor(N({ kind: 'request' }))?.ready).toBe(false)
    expect(moveFor(N({ kind: 'request' }), 'forge')?.ready).toBe(true)
    expect(needsProject(N({ kind: 'request', project: 'forge' }))).toBe(false)
    expect(needsProject(N({ kind: 'research' }))).toBe(false)
    expect(needsProject(N({ kind: 'request', state: 'done' }))).toBe(false)
  })

  it('pending: Open task with a session, Review or Start with a project', () => {
    expect(moveFor(P({ targetSession: { project: 'p', sessionDir: 's' } }))).toEqual({ label: 'Open task', kind: 'task', ready: true })
    expect(moveFor(P({ kind: 'review', source: 'github', project: 'forge' }))).toEqual({ label: 'Review', kind: 'op', ready: true })
    expect(moveFor(P())).toEqual({ label: 'Start', kind: 'op', ready: false })
    expect(moveFor(P(), 'forge')?.ready).toBe(true)
    expect(needsProject(P())).toBe(true)
    expect(needsProject(P({ targetSession: { project: 'p', sessionDir: 's' } }))).toBe(false)
  })

  it('Research is for Slack messages with no task; Hide for open news and any pending item', () => {
    expect(canResearch(P({ source: 'slack', kind: 'reply' }))).toBe(true)
    expect(canResearch(P({ source: 'slack', kind: 'reply', targetSession: { project: 'p', sessionDir: 's' } }))).toBe(false)
    expect(canResearch(P())).toBe(false)
    expect(canResearch(N({ source: 'slack' }))).toBe(false)
    expect(canHide(N())).toBe(true)
    expect(canHide(N({ state: 'done' }))).toBe(false)
    expect(canHide(P())).toBe(true)
  })
})

describe('keys', () => {
  const k = (key: string, extra: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean }> = {}) => ({ key, metaKey: false, ctrlKey: false, altKey: false, ...extra })

  it('moves, opens, starts, hides, researches and searches in the inbox', () => {
    const map: [string, string][] = [['ArrowDown', 'next'], ['j', 'next'], ['ArrowUp', 'prev'], ['k', 'prev'], ['Enter', 'open'], ['s', 'start'], ['S', 'start'], ['h', 'hide'], ['r', 'research'], ['/', 'search'], ['Escape', 'clear']]
    for (const [key, cmd] of map) expect(keyCommand(k(key), 'inbox', false)).toBe(cmd)
    expect(keyCommand(k('f', { metaKey: true }), 'inbox', false)).toBe('search')
    expect(keyCommand(k('f', { ctrlKey: true }), 'inbox', true)).toBe('search')
    expect(keyCommand(k('x'), 'inbox', false)).toBeNull()
  })

  it('does nothing with a modifier, and only Escape while typing', () => {
    expect(keyCommand(k('s', { metaKey: true }), 'inbox', false)).toBeNull()
    expect(keyCommand(k('h', { altKey: true }), 'inbox', false)).toBeNull()
    for (const key of ['s', 'j', 'h', '/', 'Enter']) expect(keyCommand(k(key), 'inbox', true)).toBeNull()
    expect(keyCommand(k('Escape'), 'inbox', true)).toBe('clear')
  })

  it('triage takes S, O, L, H and Escape to close', () => {
    expect(['s', 'o', 'l', 'h', 'Escape'].map(key => keyCommand(k(key), 'triage', false))).toEqual(['start', 'open', 'later', 'hide', 'close'])
    expect(keyCommand(k('j'), 'triage', false)).toBeNull()
    expect(keyCommand(k('s'), 'triage', true)).toBeNull()
    expect(keyCommand(k('Escape'), 'triage', true)).toBe('close')
  })
})

describe('triage', () => {
  const groups = inboxGroups([news({ id: 'n1' }), news({ id: 'u', state: 'done' })], [pend({ id: 'ci', source: 'github', kind: 'ci' }), pend({ id: 'prog', started: true }), pend({ id: 't1' }), pend({ id: 't2' })])

  it('deals Needs you, then In progress, then To do only when asked; never Updates', () => {
    expect(triageDeck(groups, false).map(e => e.item.id)).toEqual(['ci', 'n1', 'prog'])
    expect(triageDeck(groups, true).map(e => e.item.id)).toEqual(['ci', 'n1', 'prog', 't1', 't2'])
  })

  it('skips what was decided and counts progress', () => {
    const deck = triageDeck(groups, false)
    expect(triageNext(deck, {})?.item.id).toBe('ci')
    expect(triageNext(deck, { ci: 'started', n1: 'later' })?.item.id).toBe('prog')
    expect(triageNext(deck, { ci: 'started', n1: 'later', prog: 'hidden' })).toBeNull()
    expect(triageProgress(deck, {})).toEqual({ sorted: 0, total: 3 })
    expect(triageProgress(deck, { ci: 'started' })).toEqual({ sorted: 1, total: 3 })
  })

  it('an item that left the list after a decision still counts', () => {
    expect(triageProgress(triageDeck(groups, false).slice(1), { ci: 'hidden' })).toEqual({ sorted: 1, total: 3 })
  })

  it('counts what is left per group and sums the decisions', () => {
    expect(triageCounts(groups, { ci: 'started', t1: 'later' }).map(c => [c.id, c.left])).toEqual([['needs', 1], ['progress', 1], ['todo', 1]])
    expect(triageSummary({ a: 'started', b: 'started', c: 'hidden', d: 'later' })).toEqual({ started: 2, hidden: 1, later: 1 })
  })

  it('reads the day\'s stored decisions only for that date', () => {
    const raw = JSON.stringify({ date: '2026-11-16', done: { a: 'started', b: 'nope', c: 'later' } })
    expect(parseTriage(raw, '2026-11-16')).toEqual({ a: 'started', c: 'later' })
    expect(parseTriage(raw, '2026-11-17')).toEqual({})
    expect(parseTriage('garbage', '2026-11-16')).toEqual({})
    expect(parseTriage(null, '2026-11-16')).toEqual({})
  })
})
