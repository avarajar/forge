import { describe, it, expect } from 'vitest'
import { extractDecision, latestDecision, weekStats, isStale, type Decision } from './decision.js'

const decision: Decision = {
  version: 1,
  decision: 'escalate',
  sha: 'abc123',
  gates: [{ id: 'G1', reason: 'supabase/migrations/2026_x.sql' }],
  diff: { files: 3, added: 52, removed: 12 },
  checks: { e2e: 'pass', unit: 'pass', semgrep: 'warn' },
  findings: [{ check: 'e2e', kind: 'visual-diff', message: 'J3 changed', journey: 'J3', artifact: 'artifacts/j3.png' }],
}

const comment = (d: unknown) => `## qa-pilot · escala\n\nResumen legible.\n\n<!-- qa-pilot:decision\n${JSON.stringify(d, null, 2)}\n-->\n`

describe('extractDecision', () => {
  it('reads the JSON between the markers', () => {
    expect(extractDecision(comment(decision))).toEqual(decision)
  })

  it('returns null without the marker', () => {
    expect(extractDecision('LGTM')).toBeNull()
    expect(extractDecision('')).toBeNull()
  })

  it('returns null when the closing marker is missing', () => {
    expect(extractDecision(`<!-- qa-pilot:decision\n${JSON.stringify(decision)}`)).toBeNull()
  })

  it('returns null for invalid JSON (a comment edited by hand)', () => {
    expect(extractDecision('<!-- qa-pilot:decision\n{"version":1, nope\n-->')).toBeNull()
  })

  it('returns null for JSON with the wrong shape', () => {
    expect(extractDecision(comment({ ...decision, version: 2 }))).toBeNull()
    expect(extractDecision(comment({ ...decision, decision: 'merge' }))).toBeNull()
    expect(extractDecision(comment({ ...decision, sha: 1 }))).toBeNull()
    expect(extractDecision(comment({ ...decision, gates: 'G1' }))).toBeNull()
    expect(extractDecision(comment({ ...decision, gates: [{ id: 'G1' }] }))).toBeNull()
    expect(extractDecision(comment({ ...decision, diff: { files: 1 } }))).toBeNull()
    expect(extractDecision(comment({ ...decision, checks: { e2e: 'ok' } }))).toBeNull()
    expect(extractDecision(comment({ ...decision, findings: [{ check: 'e2e' }] }))).toBeNull()
    expect(extractDecision(comment(null))).toBeNull()
    expect(extractDecision(comment([decision]))).toBeNull()
  })

  it('accepts a decision with no gates, checks or findings', () => {
    const auto: Decision = { ...decision, decision: 'auto', gates: [], checks: {}, findings: [] }
    expect(extractDecision(comment(auto))).toEqual(auto)
  })

  it('tolerates CRLF line endings', () => {
    expect(extractDecision(comment(decision).replace(/\n/g, '\r\n'))).toEqual(decision)
  })
})

describe('latestDecision', () => {
  const bot = (body: string) => ({ author: { login: 'github-actions[bot]' }, body })

  it('returns null when no comment carries a decision', () => {
    expect(latestDecision([])).toBeNull()
    expect(latestDecision([bot('hola')])).toBeNull()
  })

  it('takes the last bot comment with a valid decision', () => {
    const older = { ...decision, sha: 'old' }
    const result = latestDecision([
      bot(comment(older)),
      bot(comment(decision)),
      { author: { login: 'dev' }, body: 'Pedí cambios' },
      bot('<!-- qa-pilot:decision\n{broken\n-->'),
    ])
    expect(result).toEqual(decision)
  })

  it('accepts the bot login without the [bot] suffix, as gh sometimes reports it', () => {
    expect(latestDecision([{ author: { login: 'github-actions' }, body: comment(decision) }])).toEqual(decision)
  })

  it('ignores a decision posted by anyone else, even when it is newer', () => {
    const forged = { ...decision, decision: 'auto', sha: 'forged' }
    expect(latestDecision([
      bot(comment(decision)),
      { author: { login: 'mallory' }, body: comment(forged) },
    ])).toEqual(decision)
    expect(latestDecision([{ author: { login: 'mallory' }, body: comment(decision) }])).toBeNull()
    expect(latestDecision([{ author: { login: 'github-actions-bot' }, body: comment(decision) }])).toBeNull()
    expect(latestDecision([{ author: { login: 'GITHUB-ACTIONS' }, body: comment(decision) }])).toBeNull()
    expect(latestDecision([{ body: comment(decision) }])).toBeNull()
    expect(latestDecision([{ author: null, body: comment(decision) }])).toBeNull()
  })
})

describe('weekStats', () => {
  const pr = (...labels: string[]) => ({ number: 1, labels: labels.map((name) => ({ name })) })

  it('counts by qa labels', () => {
    expect(weekStats([
      pr('qa:auto'),
      pr('qa:auto', 'dependencies'),
      pr('qa:needs-human'),
      pr('qa:needs-human', 'qa:approved'),
      pr('qa:blocked'),
      pr('bug'),
      pr(),
    ])).toEqual({ total: 7, auto: 2, escalated: 2, blocked: 1 })
  })

  it('is all zeros for no PRs', () => {
    expect(weekStats([])).toEqual({ total: 0, auto: 0, escalated: 0, blocked: 0 })
  })

  it('tolerates a PR without labels', () => {
    expect(weekStats([{ number: 2 }])).toEqual({ total: 1, auto: 0, escalated: 0, blocked: 0 })
  })
})

describe('isStale', () => {
  it('is fresh when the decision was made on the PR head', () => {
    expect(isStale(decision, 'abc123')).toBe(false)
  })

  it('is stale when the head moved', () => {
    expect(isStale(decision, 'def456')).toBe(true)
  })
})
