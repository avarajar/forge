import { describe, it, expect } from 'vitest'
import { acceptable, isSlackLink, ageShort, bannerSummary, countFor, filterNews, filterPending, groupPending, isGroupFolded, matchesQuery, newsList, NO_FILTERS, parseFilters, safeHref, summaryText, urgentRows } from './ops'
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

describe('pending groups', () => {
  const all = [
    pend({ id: 'todo' }),
    pend({ id: 'prog', started: true }),
    pend({ id: 'issue', source: 'github' }),
    pend({ id: 'rev', source: 'github', kind: 'review' }),
    pend({ id: 'slack', source: 'slack', kind: 'reply' }),
    pend({ id: 'ci', source: 'github', kind: 'ci' }),
  ]

  it('orders CI, Slack, reviews, in progress, issues, to do', () => {
    expect(groupPending(all).map(g => g.id)).toEqual(['ci', 'slack', 'review', 'progress', 'issues', 'todo'])
    expect(groupPending(all).map(g => g.title)).toEqual(['CI failing', 'Slack waiting on you', 'Review requests', 'Linear in progress', 'Issues assigned', 'Linear to do'])
  })

  it('leaves empty groups out and folds only to do by default', () => {
    const groups = groupPending([pend({ id: 'a' }), pend({ id: 'b', started: true })])
    expect(groups.map(g => g.id)).toEqual(['progress', 'todo'])
    expect(groups.map(g => isGroupFolded(g, {}))).toEqual([false, true])
    expect(groups.map(g => isGroupFolded(g, { progress: true, todo: false }))).toEqual([true, false])
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
