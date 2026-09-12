import { describe, it, expect, vi, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync, chmodSync } from 'node:fs'
import { join } from 'node:path'
import { LoginManager, type SpawnLogin } from './login-manager.js'

const fakeProcess = () => {
  let onData: (data: string) => void = () => {}
  let onExit: (e: { exitCode: number; signal?: number }) => void = () => {}
  return {
    onData: (cb: (data: string) => void) => { onData = cb; return { dispose() {} } },
    onExit: (cb: (e: { exitCode: number; signal?: number }) => void) => { onExit = cb; return { dispose() {} } },
    kill: vi.fn(),
    emit: (data: string) => onData(data),
    exit: (exitCode: number) => onExit({ exitCode }),
  }
}

const setup = () => {
  const proc = fakeProcess()
  const spawn = vi.fn(() => proc) as unknown as SpawnLogin & ReturnType<typeof vi.fn>
  const manager = new LoginManager('/fake/cw', spawn)
  return { proc, spawn, manager }
}

describe('LoginManager', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('runs cw account login with --no-browser and without CW_HARNESS', () => {
    const previous = process.env.CW_HARNESS
    process.env.CW_HARNESS = 'pi'
    try {
      const { spawn, manager } = setup()
      manager.start('work', 'codex')
      const [file, args, options] = spawn.mock.calls[0] as Parameters<SpawnLogin>
      expect(file).toBe('/fake/cw')
      expect(args).toEqual(['account', 'login', 'work', '--harness', 'codex', '--no-browser'])
      expect(options.env.CW_HARNESS).toBeUndefined()
      manager.dispose()
    } finally {
      if (previous === undefined) delete process.env.CW_HARNESS
      else process.env.CW_HARNESS = previous
    }
  })

  it('parses the login URL and code from coloured output split across chunks', () => {
    const { proc, manager } = setup()
    manager.start('work', 'codex')
    proc.emit('Starting device login\r\n\x1b[1mCW_LOGIN_UR')
    proc.emit('L=https://auth.openai.com/codex/device\x1b[0m\r\nCW_LOGIN_CODE=WXYZ-4821\r\n')
    const state = manager.get('work', 'codex')!
    expect(state.url).toBe('https://auth.openai.com/codex/device')
    expect(state.code).toBe('WXYZ-4821')
    expect(state.output).toContain('Starting device login')
    manager.dispose()
  })

  it('ignores a login URL that is not http or https', () => {
    const { proc, manager } = setup()
    manager.start('work', 'codex')
    proc.emit('CW_LOGIN_URL=javascript:alert(1)\n')
    expect(manager.get('work', 'codex')!.url).toBeNull()
    manager.dispose()
  })

  it('keeps only the last 50 output lines', () => {
    const { proc, manager } = setup()
    manager.start('work', 'codex')
    proc.emit(Array.from({ length: 60 }, (_, i) => `line ${i}`).join('\n') + '\n')
    const { output } = manager.get('work', 'codex')!
    expect(output).toHaveLength(50)
    expect(output[0]).toBe('line 10')
    manager.dispose()
  })

  it('returns the running login instead of starting a second one', () => {
    const { spawn, manager } = setup()
    const first = manager.start('work', 'codex')
    expect(manager.start('work', 'codex')).toBe(first)
    expect(spawn).toHaveBeenCalledTimes(1)
    manager.dispose()
  })

  it('records the exit and drops the state 5 minutes later', () => {
    vi.useFakeTimers()
    const { proc, manager } = setup()
    manager.start('work', 'codex')
    proc.exit(0)
    expect(manager.get('work', 'codex')).toMatchObject({ status: 'exited', exitCode: 0 })
    vi.advanceTimersByTime(5 * 60 * 1000 + 1)
    expect(manager.get('work', 'codex')).toBeUndefined()
  })

  it('kills a login still running after 15 minutes', () => {
    vi.useFakeTimers()
    const { proc, manager } = setup()
    manager.start('work', 'codex')
    vi.advanceTimersByTime(15 * 60 * 1000 + 1)
    expect(proc.kill).toHaveBeenCalled()
    expect(manager.get('work', 'codex')).toMatchObject({ status: 'exited', exitCode: null })
    manager.dispose()
  })

  it('stop kills the process and dispose kills everything', () => {
    const { proc, manager } = setup()
    manager.start('work', 'codex')
    manager.stop('work', 'codex')
    expect(proc.kill).toHaveBeenCalledTimes(1)
    expect(manager.get('work', 'codex')?.status).toBe('exited')
    manager.dispose()
    expect(manager.get('work', 'codex')).toBeUndefined()
  })
})

describe('LoginManager with a real PTY', () => {
  const DIR = join(import.meta.dirname, '../.test-login-manager')

  afterEach(() => rmSync(DIR, { recursive: true, force: true }))

  it('reads the URL and code a fake cw prints', async () => {
    mkdirSync(DIR, { recursive: true })
    const cw = join(DIR, 'cw')
    writeFileSync(cw, "#!/bin/sh\nprintf 'Visit the page\\n\\033[1mCW_LOGIN_URL=https://auth.openai.com/codex/device\\033[0m\\nCW_LOGIN_CODE=WXYZ-4821\\n'\n")
    chmodSync(cw, 0o755)
    const manager = new LoginManager(cw)
    manager.start('work', 'codex')
    await vi.waitFor(() => expect(manager.get('work', 'codex')?.status).toBe('exited'), { timeout: 5000 })
    expect(manager.get('work', 'codex')).toMatchObject({
      url: 'https://auth.openai.com/codex/device', code: 'WXYZ-4821', exitCode: 0,
    })
    manager.dispose()
  })
})
