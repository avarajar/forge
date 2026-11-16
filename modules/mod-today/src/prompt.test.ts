import { describe, it, expect } from 'vitest'
import { buildPrompt, READER_TOOLS } from './prompt'

describe('buildPrompt', () => {
  it('lists open sessions and the since window', () => {
    const p = buildPrompt({
      since: '2026-11-14T08:00:00Z',
      sessions: [{ project: 'forge', sessionDir: 'task-1', type: 'work', task: 'Fix login' }],
      projects: ['forge', 'cw'],
    })
    expect(p).toContain('since 2026-11-14T08:00:00Z')
    expect(p).toContain('forge::task-1')
    expect(p).toContain('Fix login')
    expect(p).toContain('forge, cw')
    expect(p).toContain('permalink')
    expect(p).toContain('every page')
    expect(p).toContain('to-task | issue | request | research')
  })
})

describe('READER_TOOLS', () => {
  it('holds no write tool', () => {
    expect(READER_TOOLS.length).toBeGreaterThan(0)
    expect(READER_TOOLS.filter(t => /send|create|save|update|delete|schedule/.test(t))).toEqual([])
  })
})
