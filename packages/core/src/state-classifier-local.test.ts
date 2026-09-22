import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { classifyLocal } from './state-classifier-local.js'
import { terminalText } from './state-classifier.js'

const FIXTURES = join(import.meta.dirname, '__fixtures__/terminal/claude')
const fixture = (name: string) => terminalText(readFileSync(join(FIXTURES, `${name}.ansi`), 'utf8'))
const quiet = { quietMs: 2000, harness: 'claude', exitCode: null }

describe('terminalText', () => {
  it('turns cursor column moves into spaces, so words stay apart', () => {
    expect(terminalText('Quick\x1b[8Gsafety\x1b[15Gcheck')).toBe('Quick safety check')
  })

  it('drops colours, OSC titles and carriage returns', () => {
    expect(terminalText('\x1b]0;title\x07\x1b[38;2;1;2;3mhi\x1b[39m\r\n')).toBe('hi\n')
  })
})

describe('classifyLocal on real Claude Code output', () => {
  it('reads the folder trust dialog as a permission prompt', () => {
    expect(classifyLocal({ text: fixture('trust-prompt'), ...quiet }).state).toBe('permission')
  })

  it('reads the fresh prompt after the trust dialog as waiting', () => {
    expect(classifyLocal({ text: fixture('fresh-prompt'), ...quiet }).state).toBe('waiting')
  })

  it('reads a tool approval as a permission prompt with high confidence', () => {
    const result = classifyLocal({ text: fixture('permission'), ...quiet })
    expect(result.state).toBe('permission')
    expect(result.confidence).toBeGreaterThanOrEqual(0.9)
  })

  it('reads an interrupted turn as waiting, even though the old approval is still in the tail', () => {
    expect(classifyLocal({ text: fixture('interrupted'), ...quiet }).state).toBe('waiting')
  })

  it('reads a finished turn as waiting', () => {
    const result = classifyLocal({ text: fixture('turn-done'), ...quiet })
    expect(result.state).toBe('waiting')
    expect(result.confidence).toBeGreaterThanOrEqual(0.8)
  })

  it('reads a spinner that went quiet as working, with low confidence', () => {
    const result = classifyLocal({ text: fixture('working'), ...quiet })
    expect(result.state).toBe('working')
    expect(result.confidence).toBeLessThan(0.8)
  })

  it('treats recent output as working whatever the text says', () => {
    expect(classifyLocal({ text: fixture('permission'), ...quiet, quietMs: 200 }).state).toBe('working')
  })
})

describe('classifyLocal edge cases', () => {
  it('reads an API error after the last turn as an error', () => {
    const text = `${fixture('turn-done')}\n⎿ API Error: 529 {"type":"error","error":{"type":"overloaded_error"}}\n❯ `
    expect(classifyLocal({ text, ...quiet }).state).toBe('error')
  })

  it('reads a usage limit as an error', () => {
    expect(classifyLocal({ text: 'Claude usage limit reached. Your limit will reset at 5pm', ...quiet }).state).toBe('error')
  })

  it('does not take a question Claude asks in its reply for a permission prompt', () => {
    const text = '⏺ Do you want to keep the old API around?\n✻ Brewed for 12s\n❯ '
    expect(classifyLocal({ text, ...quiet }).state).toBe('waiting')
  })

  it('does not read "thought for 3s" inside the spinner as a finished turn', () => {
    const text = '✻ Finagling… (4s · thought for 3s)'
    expect(classifyLocal({ text, ...quiet }).state).toBe('working')
  })

  it('says idle with low confidence when nothing matches', () => {
    const result = classifyLocal({ text: '', ...quiet })
    expect(result.state).toBe('idle')
    expect(result.confidence).toBeLessThan(0.5)
  })

  it('reports an exited terminal with its exit code', () => {
    expect(classifyLocal({ text: fixture('turn-done'), ...quiet, exitCode: 0 })).toMatchObject({ state: 'exited', confidence: 1 })
  })

  it('only knows activity for harnesses without their own rules', () => {
    expect(classifyLocal({ text: fixture('permission'), ...quiet, harness: 'codex' }).state).toBe('idle')
    expect(classifyLocal({ text: '', ...quiet, harness: 'codex', quietMs: 100 }).state).toBe('working')
  })
})
