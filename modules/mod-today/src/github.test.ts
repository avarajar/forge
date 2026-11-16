import { describe, it, expect, vi } from 'vitest'
import type { ForgeContext } from '@forge-dev/sdk'
import { fetchGithub } from './github'

const SINCE = '2026-11-14T08:00:00Z'
const PR = 'https://github.com/o/r/pull/7'
const ok = (v: unknown) => ({ exitCode: 0, output: JSON.stringify(v), timedOut: false })
const repo = { nameWithOwner: 'o/r' }

function stub(over: Record<string, unknown> = {}) {
  const calls: string[][] = []
  const exec = vi.fn(async (_cmd: string, args: string[], _opts?: { timeoutMs?: number }) => {
    calls.push(args)
    const key = args.slice(0, 2).join(' ')
    if (over[key] instanceof Error) throw over[key]
    if (key in over) return over[key] as ReturnType<typeof ok>
    if (key === 'api user') return ok({ login: 'me' })
    if (key === 'search prs') {
      return args.includes('user-review-requested:@me')
        ? ok([{ number: 9, title: 'Add cache', url: 'https://github.com/o/r/pull/9', repository: repo, updatedAt: '2026-11-15T07:00:00Z', author: { login: 'ana' } }, { number: 3, title: 'Old', url: 'https://github.com/o/r/pull/3', repository: repo, updatedAt: '2026-11-10T07:00:00Z', author: { login: 'bo' } }])
        : ok([{ number: 7, title: 'Fix login', url: PR, repository: repo, updatedAt: '2026-11-15T07:00:00Z' }])
    }
    if (key === 'pr view') {
      return ok({
        headRefName: 'fix/login',
        comments: [
          { author: { login: 'ana' }, body: 'Please add a test', createdAt: '2026-11-15T06:00:00Z', url: `${PR}#issuecomment-1` },
          { author: { login: 'me' }, body: 'done', createdAt: '2026-11-15T06:30:00Z', url: `${PR}#issuecomment-2` },
          { author: { login: 'ana' }, body: 'old', createdAt: '2026-11-01T06:00:00Z', url: `${PR}#issuecomment-0` },
        ],
        reviews: [{ author: { login: 'bo' }, body: 'Needs work', state: 'CHANGES_REQUESTED', submittedAt: '2026-11-15T05:00:00Z' }],
        statusCheckRollup: [
          { __typename: 'CheckRun', name: 'lint', conclusion: 'FAILURE', status: 'COMPLETED', completedAt: '2026-11-15T04:00:00Z', detailsUrl: 'https://x.test/lint' },
          { __typename: 'CheckRun', name: 'unit', conclusion: 'SUCCESS', status: 'COMPLETED', completedAt: '2026-11-15T04:00:00Z' },
        ],
      })
    }
    if (key === 'search issues') return ok([{ number: 4, title: 'Crash on start', url: 'https://github.com/o/r/issues/4', repository: repo, updatedAt: '2026-11-15T03:00:00Z', author: { login: 'cy' } }])
    if (args[1]?.startsWith('notifications')) {
      return ok([
        { reason: 'mention', updated_at: '2026-11-15T02:00:00Z', subject: { title: 'Ping me', type: 'PullRequest', url: 'https://api.github.com/repos/o/r/pulls/5' }, repository: { full_name: 'o/r' } },
        { reason: 'assign', updated_at: '2026-11-15T02:00:00Z', subject: { title: 'x', type: 'Issue', url: 'https://api.github.com/repos/o/r/issues/6' }, repository: { full_name: 'o/r' } },
      ])
    }
    throw new Error(`unexpected gh ${args.join(' ')}`)
  })
  return { ctx: { shell: { exec } } as unknown as ForgeContext, exec, calls }
}

describe('fetchGithub', () => {
  it('maps review requests, comments, reviews, mentions, assigned issues and failing checks since a time', async () => {
    const { ctx } = stub()
    const { items, error } = await fetchGithub(ctx, SINCE)
    expect(error).toBeUndefined()
    const by = (t: string) => items.filter(i => i.type === t)
    expect(by('review-request')).toEqual([expect.objectContaining({ repo: 'o/r', number: 9, who: 'ana', url: 'https://github.com/o/r/pull/9' })])
    expect(by('comment')).toEqual([expect.objectContaining({ number: 7, who: 'ana', text: 'Please add a test', headRef: 'fix/login', url: `${PR}#issuecomment-1`, pr: PR })])
    expect(by('review')).toEqual([expect.objectContaining({ who: 'bo', text: 'Needs work', url: PR, pr: PR })])
    expect(by('ci-failure')).toEqual([expect.objectContaining({ url: PR, checks: ['lint'], headRef: 'fix/login', when: '2026-11-15T04:00:00Z' })])
    expect(by('assigned')).toEqual([expect.objectContaining({ number: 4, who: 'cy' })])
    expect(by('mention')).toEqual([expect.objectContaining({ number: 5, title: 'Ping me', url: 'https://github.com/o/r/pull/5' })])
  })

  it('lists every open review request, updated since the last reading or not', async () => {
    const { ctx } = stub()
    expect((await fetchGithub(ctx, SINCE)).requested).toEqual(['https://github.com/o/r/pull/9', 'https://github.com/o/r/pull/3'])
  })

  it('gh missing gives an error and no items', async () => {
    const { ctx } = stub({ 'api user': new Error('spawn gh ENOENT') })
    const r = await fetchGithub(ctx, SINCE)
    expect(r.items).toEqual([])
    expect(r.error).toMatch(/gh/)
  })

  it('a signed out gh gives an error and no items', async () => {
    const { ctx } = stub({ 'api user': { exitCode: 1, output: 'To get started with GitHub CLI, please run: gh auth login', timedOut: false } })
    const r = await fetchGithub(ctx, SINCE)
    expect(r.items).toEqual([])
    expect(r.error).toContain('gh auth login')
  })

  it('a failing PR view skips that PR and is counted', async () => {
    const { ctx } = stub({ 'pr view': { exitCode: 1, output: 'boom', timedOut: false } })
    const r = await fetchGithub(ctx, SINCE)
    expect(r.error).toBe('1 pull request could not be read')
    expect(r.items.some(i => i.type === 'review-request')).toBe(true)
    expect(r.items.some(i => i.type === 'comment')).toBe(false)
  })

  it('only read-only gh commands are run', async () => {
    const { ctx, calls, exec } = stub()
    await fetchGithub(ctx, SINCE)
    expect(calls.length).toBeGreaterThan(4)
    for (const [cmd] of exec.mock.calls) expect(cmd).toBe('gh')
    for (const args of calls) {
      expect(args.join(' ')).not.toMatch(/\bpr (merge|comment|review|edit|close|ready|create)\b|\bissue (comment|edit|close|create)\b/)
      expect(args.join(' ')).not.toMatch(/-X|--method|(^| )-f |--field|--input/)
      expect(['api', 'search', 'pr']).toContain(args[0])
    }
  })

  it('reads every page of notifications', async () => {
    const { ctx, calls } = stub()
    await fetchGithub(ctx, SINCE)
    const call = calls.find(a => a[1]?.startsWith('notifications'))
    expect(call).toContain('--paginate')
  })

  it('every call has a timeout', async () => {
    const { ctx, exec } = stub()
    await fetchGithub(ctx, SINCE)
    for (const call of exec.mock.calls) expect(call[2]?.timeoutMs).toBeGreaterThan(0)
  })

  it('reports a commit status failure dated by when it started', async () => {
    const view = { headRefName: 'h', comments: [], reviews: [], statusCheckRollup: [{ __typename: 'StatusContext', context: 'ci/legacy', state: 'FAILURE', startedAt: '2026-11-15T04:30:00Z' }] }
    const { ctx } = stub({ 'pr view': ok(view) })
    const r = await fetchGithub(ctx, SINCE)
    expect(r.items.filter(i => i.type === 'ci-failure')).toEqual([expect.objectContaining({ checks: ['ci/legacy'], when: '2026-11-15T04:30:00Z' })])
  })

  it('views PRs four at a time and counts the ones past the deadline as unread', async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ number: i + 1, title: 't', url: `https://github.com/o/r/pull/${i + 1}`, repository: repo, updatedAt: '2026-11-15T07:00:00Z' }))
    const { ctx, exec } = stub({ 'search prs': ok(many) })
    const inner = exec.getMockImplementation()!
    let running = 0
    let peak = 0
    exec.mockImplementation(async (cmd, args, opts) => {
      if (args[0] !== 'pr') return inner(cmd, args, opts)
      running++
      peak = Math.max(peak, running)
      await new Promise(r => setTimeout(r, 40))
      running--
      return inner(cmd, args, opts)
    })
    const r = await fetchGithub(ctx, SINCE, 60)
    expect(peak).toBe(4)
    // 4 start at once, 4 more before 60 ms, the last 4 are past the deadline
    expect(r.error).toBe('4 pull requests could not be read')
  })

  it('looks at no more than 20 of my PRs', async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ number: i + 1, title: 't', url: `https://github.com/o/r/pull/${i + 1}`, repository: repo, updatedAt: '2026-11-15T07:00:00Z' }))
    const { ctx, calls } = stub({ 'search prs': ok(many) })
    await fetchGithub(ctx, SINCE)
    expect(calls.filter(a => a[0] === 'pr').length).toBeLessThanOrEqual(20)
  })
})
