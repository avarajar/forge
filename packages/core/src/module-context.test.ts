import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, symlinkSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PermissionError, type ModuleSettings } from '@forge-dev/sdk'
import { ForgeDB } from './db.js'
import { ActionRunner } from './runner.js'
import { CWReader } from './cw-reader.js'
import { createForgeContext, type ContextDeps } from './module-context.js'
import { expandGrants, type Grants } from './module-permissions.js'

describe('createForgeContext', () => {
  let root: string
  let db: ForgeDB
  let deps: ContextDeps
  let denials: Array<[string, string]>
  let fetchMock: ReturnType<typeof vi.fn>

  const ctxFor = (id: string, grants: Grants, settings: ModuleSettings = {}) =>
    createForgeContext(deps, { id, version: '0.1.0' }, () => settings, () => grants, (p, v) => denials.push([p, v]))

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'forge-ctx-'))
    mkdirSync(join(root, 'granted'))
    mkdirSync(join(root, 'secret'))
    writeFileSync(join(root, 'granted/token'), 'tok-1\n')
    writeFileSync(join(root, 'secret/key'), 'k')
    db = new ForgeDB(join(root, 'forge.db'))
    fetchMock = vi.fn(async () => new Response('ok'))
    deps = { db, reader: new CWReader(join(root, 'cw')), runner: new ActionRunner(), fetch: fetchMock as unknown as typeof fetch }
    denials = []
  })

  afterEach(() => {
    db.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('fetch to an undeclared origin throws PermissionError and reports the denial', async () => {
    const ctx = ctxFor('m', expandGrants({ network: ['http://localhost:5555'] }, {}))
    await expect(ctx.fetch('http://localhost:6666/x')).rejects.toBeInstanceOf(PermissionError)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(denials).toEqual([['network', 'http://localhost:6666/x']])
  })

  it('fetch to a granted origin calls the injected fetch', async () => {
    const ctx = ctxFor('m', expandGrants({ network: ['http://localhost:5555'] }, {}))
    const res = await ctx.fetch('http://localhost:5555/api/today')
    expect(await res.text()).toBe('ok')
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:5555/api/today', undefined)
  })

  it('grants follow the settings at call time', async () => {
    let settings: ModuleSettings = { port: 5555 }
    const ctx = createForgeContext(deps, { id: 'm', version: '1' }, () => settings, () => expandGrants({ network: ['http://localhost:{port}'] }, settings), () => {})
    await ctx.fetch('http://localhost:5555/')
    settings = { port: 7777 }
    await expect(ctx.fetch('http://localhost:5555/')).rejects.toBeInstanceOf(PermissionError)
    expect(ctx.settings).toEqual({ port: 7777 })
  })

  it('fs.read inside a granted file returns its text', async () => {
    const ctx = ctxFor('m', expandGrants({ 'fs:read': [join(root, 'granted/token')] }, {}))
    expect(await ctx.fs.read(join(root, 'granted/token'))).toBe('tok-1\n')
  })

  it('rejects a path that escapes through a symlink', async () => {
    symlinkSync(join(root, 'secret'), join(root, 'granted/link'))
    const ctx = ctxFor('m', expandGrants({ 'fs:read': [join(root, 'granted') + '/'] }, {}))
    await expect(ctx.fs.read(join(root, 'granted/link/key'))).rejects.toBeInstanceOf(PermissionError)
  })

  it('fs.write needs fs:write, not fs:read', async () => {
    const ctx = ctxFor('m', expandGrants({ 'fs:read': [join(root, 'granted') + '/'] }, {}))
    await expect(ctx.fs.write(join(root, 'granted/out'), 'x')).rejects.toBeInstanceOf(PermissionError)
    const writer = ctxFor('m', expandGrants({ 'fs:write': [join(root, 'granted') + '/'] }, {}))
    await writer.fs.write(join(root, 'granted/out'), 'x')
    expect(readFileSync(join(root, 'granted/out'), 'utf-8')).toBe('x')
  })

  it('shell.exec without a grant throws', async () => {
    const ctx = ctxFor('m', expandGrants({}, {}))
    await expect(ctx.shell.exec('echo', ['hi'])).rejects.toBeInstanceOf(PermissionError)
  })

  it('shell.exec granted runs the command with its args array', async () => {
    const ctx = ctxFor('m', expandGrants({ shell: [process.execPath] }, {}))
    const result = await ctx.shell.exec(process.execPath, ['-e', 'process.stdout.write(process.argv[1])', '$(touch pwned); ok'])
    expect(result.exitCode).toBe(0)
    expect(result.output).toBe('$(touch pwned); ok')
  })

  it('pty.spawn without the pty permission throws', async () => {
    const ctx = ctxFor('m', expandGrants({}, {}))
    await expect(ctx.pty.spawn('bash', [], { cwd: root, name: 'x' })).rejects.toBeInstanceOf(PermissionError)
  })

  it('storage round-trips JSON per module and never leaks between modules', async () => {
    const a = ctxFor('a', expandGrants({}, {}))
    const b = ctxFor('b', expandGrants({}, {}))
    await a.storage.set('reading:x', { up: true, n: 2 })
    expect(await a.storage.get('reading:x')).toEqual({ up: true, n: 2 })
    expect(await b.storage.get('reading:x')).toBeUndefined()
    expect(await a.storage.list('reading:')).toEqual(['reading:x'])
    await a.storage.delete('reading:x')
    expect(await a.storage.get('reading:x')).toBeUndefined()
  })

  it('notify.attention twice with the same version stores one row', async () => {
    const ctx = ctxFor('m', expandGrants({}, {}))
    await ctx.notify.attention({ key: 'needs-human:s', title: 'A reply needs you', version: '1' })
    await ctx.notify.attention({ key: 'needs-human:s', title: 'A reply needs you', version: '1' })
    expect(db.listNotifications().filter(n => n.moduleId === 'm')).toHaveLength(1)
  })

  it('notify.badge with 0 removes it', async () => {
    const ctx = ctxFor('m', expandGrants({}, {}))
    await ctx.notify.badge('outbox:s', 3, 'to approve')
    expect(db.listNotifications()[0]).toMatchObject({ kind: 'badge', count: 3, label: 'to approve' })
    await ctx.notify.badge('outbox:s', 0)
    expect(db.listNotifications()).toEqual([])
  })

  it('notify.clear deletes the item', async () => {
    const ctx = ctxFor('m', expandGrants({}, {}))
    await ctx.notify.attention({ key: 'down:s', title: 'Harvey stopped' })
    await ctx.notify.clear('down:s')
    expect(db.listNotifications()).toEqual([])
  })
})

describe('ForgeDB notifications', () => {
  let root: string
  let db: ForgeDB
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'forge-notif-'))
    db = new ForgeDB(join(root, 'forge.db'))
  })
  afterEach(() => { db.close(); rmSync(root, { recursive: true, force: true }) })

  it('upsertNotification reports new, unchanged and changed versions', () => {
    const row = { moduleId: 'm', key: 'k', kind: 'attention' as const, title: 't', version: '1' }
    expect(db.upsertNotification(row)).toBe(true)
    expect(db.upsertNotification(row)).toBe(false)
    expect(db.upsertNotification({ ...row, version: '2' })).toBe(true)
  })

  it('a changed version is unseen again', () => {
    const row = { moduleId: 'm', key: 'k', kind: 'attention' as const, title: 't', version: '1' }
    db.upsertNotification(row)
    db.markNotificationsSeen('m')
    expect(db.listNotifications()[0].seenAt).not.toBeNull()
    db.upsertNotification({ ...row, version: '2' })
    expect(db.listNotifications()[0].seenAt).toBeNull()
  })
})
