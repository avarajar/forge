import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ClaudeHooks, HOOK_EVENTS_HTTP, cwSkipPermissionsDefault, hookSettings, hookUrl } from './claude-hooks.js'

interface HookEntry { matcher?: string; hooks: Array<Record<string, unknown>> }

describe('hookUrl', () => {
  it('uses the bound loopback, or the one specific address Forge listens on', () => {
    expect(hookUrl(3000)).toBe('http://127.0.0.1:3000/api/cw/hook-events')
    expect(hookUrl(3000, '127.0.0.1')).toBe('http://127.0.0.1:3000/api/cw/hook-events')
    expect(hookUrl(3000, 'localhost')).toBe('http://127.0.0.1:3000/api/cw/hook-events')
    expect(hookUrl(3000, '0.0.0.0')).toBe('http://127.0.0.1:3000/api/cw/hook-events')
    expect(hookUrl(3000, '::')).toBe('http://127.0.0.1:3000/api/cw/hook-events')
    expect(hookUrl(4100, '192.168.1.5')).toBe('http://192.168.1.5:4100/api/cw/hook-events')
    expect(hookUrl(4100, 'fd00::5')).toBe('http://[fd00::5]:4100/api/cw/hook-events')
    expect(hookUrl(3000, '::1')).toBe('http://[::1]:3000/api/cw/hook-events')
    expect(hookUrl(3000, '[::1]')).toBe('http://[::1]:3000/api/cw/hook-events')
    expect(hookUrl(3000, '127.0.0.2')).toBe('http://127.0.0.2:3000/api/cw/hook-events')
  })
})

describe('hookSettings', () => {
  const url = 'http://127.0.0.1:3000/api/cw/hook-events'
  const hooks = (hookSettings(url) as { hooks: Record<string, HookEntry[]> }).hooks

  it('registers an http hook with both headers for every event but SessionStart', () => {
    for (const event of HOOK_EVENTS_HTTP) {
      expect(hooks[event]).toHaveLength(1)
      expect(hooks[event][0].matcher).toBeUndefined()
      expect(hooks[event][0].hooks[0]).toEqual({
        type: 'http', url, timeout: 2,
        headers: { 'X-Forge-Hook-Token': '$FORGE_HOOK_TOKEN', 'X-Forge-Hook-Session': '$FORGE_HOOK_SESSION' },
        allowedEnvVars: ['FORGE_HOOK_TOKEN', 'FORGE_HOOK_SESSION'],
      })
    }
  })

  it('sends SessionStart through a silent curl that always exits 0', () => {
    const hook = hooks.SessionStart[0].hooks[0]
    expect(hook.type).toBe('command')
    const command = String(hook.command)
    expect(command).toContain(`'${url}'`)
    expect(command).toContain('test -z "$FORGE_HOOK_TOKEN" ||')
    expect(command).toContain('-o /dev/null')
    expect(command).toMatch(/exit 0$/)
  })
})

describe('cwSkipPermissionsDefault', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'forge-cwcfg-')) })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('reads skip_permissions from config.yaml', () => {
    expect(cwSkipPermissionsDefault(dir)).toBe(false)
    writeFileSync(join(dir, 'config.yaml'), 'default_account: work\nskip_permissions: true\n')
    expect(cwSkipPermissionsDefault(dir)).toBe(true)
    writeFileSync(join(dir, 'config.yaml'), 'skip_permissions: false\n')
    expect(cwSkipPermissionsDefault(dir)).toBe(false)
  })
})

describe('ClaudeHooks', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'forge-hooks-')) })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('injects nothing before Forge listens', () => {
    const hooks = new ClaudeHooks({ dir: join(dir, 'hooks'), cwHome: dir })
    expect(hooks.enabled).toBe(false)
    expect(hooks.launch('app::fix')).toBeNull()
  })

  it('writes one settings file per port with that port in the URL', () => {
    const hooks = new ClaudeHooks({ dir: join(dir, 'hooks'), cwHome: dir })
    const path = hooks.listen(4321)
    expect(path).toBe(join(dir, 'hooks', 'claude-4321.json'))
    expect(readFileSync(path!, 'utf-8')).toContain('http://127.0.0.1:4321/api/cw/hook-events')
    expect(hooks.enabled).toBe(true)
  })

  it('refuses a settings path with whitespace, which CW would split', () => {
    const warnings: string[] = []
    const hooks = new ClaudeHooks({ dir: join(dir, 'with space'), cwHome: dir, warn: (m) => warnings.push(m) })
    expect(hooks.listen(3000)).toBeNull()
    expect(hooks.launch('app::fix')).toBeNull()
    expect(warnings[0]).toContain('whitespace')
  })

  it('gives each launch its own token and refuses the previous one', () => {
    const hooks = new ClaudeHooks({ dir, cwHome: dir })
    hooks.listen(3000)
    const first = hooks.launch('app::fix')!
    const second = hooks.launch('app::fix')!
    expect(first.token).toMatch(/^[0-9a-f]{48}$/)
    expect(second.token).not.toBe(first.token)
    expect(hooks.verify('app::fix', first.token)).toBe(false)
    expect(hooks.verify('app::fix', second.token)).toBe(true)
  })

  it('accepts a token only for its own session and not after revoke', () => {
    const hooks = new ClaudeHooks({ dir, cwHome: dir })
    hooks.listen(3000)
    const a = hooks.launch('app::a')!
    hooks.launch('app::b')
    expect(hooks.verify('app::b', a.token)).toBe(false)
    expect(hooks.verify('app::unknown', a.token)).toBe(false)
    expect(hooks.verify('app::a', undefined)).toBe(false)
    hooks.revoke('app::a')
    expect(hooks.verify('app::a', a.token)).toBe(false)
  })

  it('carries the CW skip_permissions default into the launch', () => {
    writeFileSync(join(dir, 'config.yaml'), 'skip_permissions: true\n')
    const hooks = new ClaudeHooks({ dir, cwHome: dir })
    hooks.listen(3000)
    expect(hooks.launch('app::fix')!.skipPermissionsDefault).toBe(true)
  })
})
