import { describe, it, expect, vi, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { existsSync, mkdtempSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runAgent } from './agent-runner.js'

class FakeChild extends EventEmitter {
  stdout = new EventEmitter()
  stderr = new EventEmitter()
  kill = vi.fn(() => true)
  stdin = { on: vi.fn(), end: vi.fn() }
  finish(stdout: string, code = 0) {
    this.stdout.emit('data', Buffer.from(stdout))
    this.emit('close', code)
  }
}

describe('runAgent', () => {
  const dirs: string[] = []
  afterEach(() => {
    vi.useRealTimers()
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
  })
  const home = () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-agent-'))
    mkdirSync(join(d, 'accounts', 'mono'), { recursive: true })
    dirs.push(d)
    return d
  }
  const input = { account: 'mono', prompt: 'summarise', model: 'haiku', allowedTools: ['mcp__linear__get_issue', 'mcp__notion__search'] }

  it('spawns claude -p under the account config dir without CW_HARNESS', async () => {
    const cwHome = home()
    process.env.CW_HARNESS = 'codex'
    const child = new FakeChild()
    const spawn = vi.fn(() => child)
    const promise = runAgent(input, { cwHome, spawn: spawn as never })
    child.finish(JSON.stringify({ result: 'done', total_cost_usd: 0.02, num_turns: 3 }))
    expect(await promise).toEqual({ text: 'done', costUsd: 0.02, turns: 3 })
    delete process.env.CW_HARNESS
    const [cmd, args, opts] = spawn.mock.calls[0] as unknown as [string, string[], { env: Record<string, string> }]
    expect(cmd).toBe('claude')
    expect(args).toEqual(['-p', '--model', 'haiku', '--tools', '', '--allowedTools', 'mcp__linear__get_issue,mcp__notion__search', '--output-format', 'json'])
    expect(opts.env.CLAUDE_CONFIG_DIR).toBe(join(cwHome, 'accounts', 'mono'))
    expect(opts.env.CW_HARNESS).toBeUndefined()
    expect(opts.env.MCP_CONNECTION_NONBLOCKING).toBe('false')
    expect(opts.env.MCP_TIMEOUT).toBe('60000')
  })

  it('runs in a fresh empty folder that is removed afterwards', async () => {
    const child = new FakeChild()
    let seen: { cwd: string; empty: boolean } | undefined
    const spawn = vi.fn((_c: string, _a: string[], opts: { cwd: string }) => {
      seen = { cwd: opts.cwd, empty: readdirSync(opts.cwd).length === 0 }
      return child
    })
    const promise = runAgent(input, { cwHome: home(), spawn: spawn as never })
    child.finish(JSON.stringify({ result: 'x' }))
    await promise
    expect(seen?.empty).toBe(true)
    expect(seen?.cwd.startsWith(tmpdir())).toBe(true)
    expect(seen?.cwd).not.toBe(process.cwd())
    expect(existsSync(seen!.cwd)).toBe(false)
  })

  it('removes the folder when spawning fails', async () => {
    const child = new FakeChild()
    let cwd = ''
    const spawn = vi.fn((_c: string, _a: string[], opts: { cwd: string }) => { cwd = opts.cwd; return child })
    const promise = runAgent(input, { cwHome: home(), spawn: spawn as never })
    child.emit('error', new Error('ENOENT'))
    await expect(promise).rejects.toMatchObject({ code: 'unreachable' })
    expect(cwd).not.toBe('')
    expect(existsSync(cwd)).toBe(false)
  })

  it('prompt is written to stdin, not argv', async () => {
    const child = new FakeChild()
    const spawn = vi.fn(() => child)
    const promise = runAgent({ ...input, prompt: '--dangerously-skip-permissions' }, { cwHome: home(), spawn: spawn as never })
    child.finish(JSON.stringify({ result: 'x' }))
    await promise
    expect(child.stdin.end).toHaveBeenCalledWith('--dangerously-skip-permissions')
    expect((spawn.mock.calls[0] as unknown as [string, string[]])[1]).not.toContain('--dangerously-skip-permissions')
  })

  it('rejects a non-MCP allowed tool', async () => {
    const spawn = vi.fn()
    await expect(runAgent({ ...input, allowedTools: ['mcp__a__b', 'Bash'] }, { cwHome: home(), spawn: spawn as never })).rejects.toMatchObject({ code: 'bad_request' })
    expect(spawn).not.toHaveBeenCalled()
  })

  it('rejects an unknown account', async () => {
    const spawn = vi.fn()
    await expect(runAgent({ ...input, account: 'ghost' }, { cwHome: home(), spawn: spawn as never })).rejects.toMatchObject({ code: 'not_found' })
    await expect(runAgent({ ...input, account: '../x' }, { cwHome: home(), spawn: spawn as never })).rejects.toMatchObject({ code: 'bad_request' })
    expect(spawn).not.toHaveBeenCalled()
  })

  it('rejects non-JSON stdout', async () => {
    const child = new FakeChild()
    const promise = runAgent(input, { cwHome: home(), spawn: (() => child) as never })
    child.finish('not json')
    await expect(promise).rejects.toMatchObject({ code: 'upstream' })
  })

  it('kills the child after timeoutMs', async () => {
    vi.useFakeTimers()
    const child = new FakeChild()
    const promise = runAgent({ ...input, timeoutMs: 1000 }, { cwHome: home(), spawn: (() => child) as never })
    const assertion = expect(promise).rejects.toMatchObject({ code: 'unreachable' })
    await vi.advanceTimersByTimeAsync(1000)
    expect(child.kill).toHaveBeenCalled()
    await assertion
  })
})
