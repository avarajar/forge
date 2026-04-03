import { describe, it, expect } from 'vitest'
import { ActionRunner } from './runner.js'

describe('ActionRunner', () => {
  it('executes a simple command and returns output', async () => {
    const runner = new ActionRunner()
    const result = await runner.exec('echo hello world', { cwd: '/tmp' })
    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('hello world')
  })

  it('captures non-zero exit codes', async () => {
    const runner = new ActionRunner()
    const result = await runner.exec('exit 1', { cwd: '/tmp' })
    expect(result.exitCode).toBe(1)
  })

  it('streams output via callback', async () => {
    const runner = new ActionRunner()
    const chunks: string[] = []
    await runner.exec('echo line1 && echo line2', {
      cwd: '/tmp',
      onData: (data) => chunks.push(data)
    })
    const combined = chunks.join('')
    expect(combined).toContain('line1')
    expect(combined).toContain('line2')
  })

  it('can be aborted', async () => {
    const runner = new ActionRunner()
    const abort = new AbortController()
    setTimeout(() => abort.abort(), 100)
    const result = await runner.exec('sleep 10', {
      cwd: '/tmp',
      signal: abort.signal
    })
    expect(result.exitCode).not.toBe(0)
  })

  it('respects timeout', async () => {
    const runner = new ActionRunner()
    const result = await runner.exec('sleep 10', {
      cwd: '/tmp',
      timeout: 200
    })
    expect(result.exitCode).not.toBe(0)
    expect(result.timedOut).toBe(true)
  })
})
