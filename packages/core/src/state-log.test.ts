import { describe, it, expect, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import type { RemoteCall } from './session-state.js'
import { createStateLog, expandHome, stateLogLine } from './state-log.js'

const call = (over: Partial<RemoteCall> = {}): RemoteCall => ({
  at: Date.UTC(2026, 8, 21, 12), key: 'forge::a', harness: 'claude', text: 'hello\n❯ ',
  local: { state: 'waiting', confidence: 0.95, source: 'local' },
  remote: { state: 'waiting', confidence: 0.9, source: 'jev' },
  error: null, latencyMs: 420, outcome: 'shadow',
  ...over,
})

describe('stateLogLine', () => {
  it('writes one JSON line with both answers and the screen', () => {
    const line = stateLogLine(call())
    expect(line.endsWith('\n')).toBe(true)
    expect(JSON.parse(line)).toEqual({
      at: '2026-09-21T12:00:00.000Z', key: 'forge::a', harness: 'claude', outcome: 'shadow',
      local: { state: 'waiting', confidence: 0.95 }, remote: { state: 'waiting', confidence: 0.9 },
      error: null, latencyMs: 420, screen: 'hello\n❯',
    })
  })

  it('keeps only the bottom of the screen, as the remote classifier saw it', () => {
    const text = Array.from({ length: 50 }, (_, i) => `line ${i}`).join('\n')
    const { screen } = JSON.parse(stateLogLine(call({ text })))
    expect(screen.split('\n')).toHaveLength(30)
    expect(screen.endsWith('line 49')).toBe(true)
  })

  it('records a failed call without a remote answer', () => {
    expect(JSON.parse(stateLogLine(call({ remote: null, error: 'Jev answered 401', outcome: 'failed' })))).toMatchObject({ remote: null, error: 'Jev answered 401' })
  })
})

describe('createStateLog', () => {
  it('appends to the file, creating its folder', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'forge-state-log-')), 'nested', 'log.jsonl')
    const log = createStateLog(file)
    log(call())
    log(call({ outcome: 'applied' }))
    await vi.waitFor(() => {
      const lines = existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').map(l => JSON.parse(l)) : []
      expect(lines.map(l => l.outcome)).toEqual(['shadow', 'applied'])
    })
  })

  it('expands a leading ~', () => {
    expect(expandHome('~/.forge/log.jsonl')).toBe(join(homedir(), '.forge/log.jsonl'))
    expect(expandHome('/tmp/~x')).toBe('/tmp/~x')
  })
})
