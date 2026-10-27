import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { cpSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Hono } from 'hono'
import { ForgeDB } from './db.js'
import { ActionRunner } from './runner.js'
import { CWReader } from './cw-reader.js'
import { ModuleHost } from './module-host.js'
import { moduleRoutes } from './module-routes.js'
import { Confirmations } from './module-confirmations.js'
import { InstallError, type ModuleInstaller } from './module-install.js'

const FIXTURES = join(import.meta.dirname, '../test/fixtures/modules')

describe('moduleRoutes', () => {
  let root: string
  let modulesDir: string
  let db: ForgeDB
  let host: ModuleHost
  let app: Hono
  let now: number

  const post = (path: string, body: unknown) =>
    app.request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const put = (path: string, body: unknown) =>
    app.request(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'forge-routes-'))
    modulesDir = join(root, 'modules')
    mkdirSync(modulesDir)
    for (const f of ['valid', 'legacy']) cpSync(join(FIXTURES, f), join(modulesDir, f), { recursive: true })
    db = new ForgeDB(join(root, 'forge.db'))
    host = new ModuleHost({ modulesDir, devFile: join(root, 'dev.json'), localOnly: true, deps: { db, reader: new CWReader(join(root, 'cw')), runner: new ActionRunner() } })
    await host.scan()
    now = 0
    app = new Hono()
    app.route('/api/modules', moduleRoutes(host, { db, confirmations: new Confirmations(() => now) }))
  })

  afterEach(async () => {
    await host.close()
    db.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('lists module statuses', async () => {
    const list = await (await app.request('/api/modules')).json() as Array<{ id: string; state: string }>
    expect(list.map(m => [m.id, m.state])).toEqual([['legacy', 'legacy'], ['valid', 'enabled']])
  })

  describe('routes', () => {
    it('passes query, params and body to the handler', async () => {
      expect(await (await app.request('/api/modules/valid/hello?name=ana')).json()).toEqual({ hello: 'ana' })
      expect(await (await app.request('/api/modules/valid/items/42')).json()).toEqual({ id: '42' })
      expect(await (await post('/api/modules/valid/echo', { a: 1 })).json()).toEqual({ body: { a: 1 } })
    })

    it('maps ModuleError unreachable to 502 with its code', async () => {
      const res = await app.request('/api/modules/valid/down')
      expect(res.status).toBe(502)
      expect(await res.json()).toEqual({ code: 'unreachable', message: 'Harvey is not running on :5555' })
    })

    it('maps any other throw to 500 module_error and keeps answering', async () => {
      const res = await app.request('/api/modules/valid/boom')
      expect(res.status).toBe(500)
      expect(await res.json()).toEqual({ code: 'module_error', message: 'kaput' })
      expect((await app.request('/api/modules/valid/hello')).status).toBe(200)
    })

    it('maps PermissionError to 403', async () => {
      const res = await app.request('/api/modules/valid/denied')
      expect(res.status).toBe(403)
      expect(await res.json()).toMatchObject({ code: 'permission', permission: 'network', value: 'http://localhost:9/' })
    })

    it('answers 404 not_found for an unknown route of a loaded module', async () => {
      const res = await app.request('/api/modules/valid/nope')
      expect(res.status).toBe(404)
      expect(await res.json()).toMatchObject({ code: 'not_found' })
    })

    it('answers 404 module_removed for a module that is gone', async () => {
      rmSync(join(modulesDir, 'valid'), { recursive: true })
      await host.scan()
      const res = await app.request('/api/modules/valid/hello')
      expect(res.status).toBe(404)
      expect(await res.json()).toMatchObject({ code: 'module_removed' })
    })
  })

  describe('actions', () => {
    it('runs a read action directly', async () => {
      const res = await post('/api/modules/valid/actions/count', { input: { n: 2 } })
      expect(await res.json()).toEqual({ result: { n: 3 } })
    })

    it('external action without token answers 409 and does not run', async () => {
      const res = await post('/api/modules/valid/actions/send', { input: { to: 'a@b.co' } })
      expect(res.status).toBe(409)
      expect(await res.json()).toMatchObject({ code: 'confirmation_required' })
      expect(db.listActionLogs({ moduleId: 'valid' })).toEqual([])
    })

    it('prepare then run hands run the confirmed plan', async () => {
      const prep = await (await post('/api/modules/valid/actions/send/prepare', { input: { to: 'a@b.co' } })).json() as { token: string; confirmation: { title: string; items: unknown[]; plan?: unknown } }
      expect(prep.confirmation).toEqual({ title: 'Send', confirmLabel: 'Send', items: [{ label: 'a@b.co' }] })
      const run = await post('/api/modules/valid/actions/send', { input: { to: 'a@b.co' }, token: prep.token })
      expect(await run.json()).toEqual({ result: { sent: { ids: ['a@b.co'] } } })
    })

    it('a token is single-use', async () => {
      const { token } = await (await post('/api/modules/valid/actions/send/prepare', { input: { to: 'x' } })).json() as { token: string }
      await post('/api/modules/valid/actions/send', { input: { to: 'x' }, token })
      expect((await post('/api/modules/valid/actions/send', { input: { to: 'x' }, token })).status).toBe(409)
    })

    it('a token for another input answers 409', async () => {
      const { token } = await (await post('/api/modules/valid/actions/send/prepare', { input: { to: 'x' } })).json() as { token: string }
      expect((await post('/api/modules/valid/actions/send', { input: { to: 'y' }, token })).status).toBe(409)
    })

    it('an expired token answers 409', async () => {
      const { token } = await (await post('/api/modules/valid/actions/send/prepare', { input: { to: 'x' } })).json() as { token: string }
      now = 121_000
      expect((await post('/api/modules/valid/actions/send', { input: { to: 'x' }, token })).status).toBe(409)
    })

    it('stream emits start, output and done', async () => {
      const text = await (await post('/api/modules/valid/actions/talk/stream', {})).text()
      expect(text).toContain('event: start')
      expect(text).toContain('event: output\ndata: {"chunk":"one\\n"}')
      expect(text).toContain('event: done\ndata: {"result":{"done":true}}')
    })

    it('logs the run without the input', async () => {
      await post('/api/modules/valid/actions/count', { input: { n: 41 } })
      const [log] = db.listActionLogs({ moduleId: 'valid' })
      expect(log).toMatchObject({ actionId: 'count', exitCode: 0 })
      expect(log.command).not.toContain('41')
    })

    it('unknown action answers 404', async () => {
      expect((await post('/api/modules/valid/actions/nope', {})).status).toBe(404)
    })
  })

  describe('settings', () => {
    it('v1 settings come back parsed with defaults', async () => {
      expect(await (await app.request('/api/modules/valid/settings')).json()).toEqual({ port: 5555 })
    })

    it('a bad value answers 400 with its path', async () => {
      const res = await put('/api/modules/valid/settings', { port: 'x' })
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ errors: [{ path: 'port', message: 'must be a number' }] })
    })

    it('legacy modules keep raw string settings', async () => {
      await put('/api/modules/legacy/settings', { apiKey: 'abc', n: 3 })
      expect(await (await app.request('/api/modules/legacy/settings')).json()).toEqual({ apiKey: 'abc', n: '3' })
    })
  })

  describe('view and notifications', () => {
    it('serves view.js as javascript', async () => {
      const res = await app.request('/api/modules/valid/view.js')
      expect(res.headers.get('content-type')).toMatch(/javascript/)
      expect(await res.text()).toContain('component')
    })

    it('lists notifications and marks only one module seen', async () => {
      await host.get('valid')!.ctx.notify.attention({ key: 'k', title: 'A reply needs you' })
      db.upsertNotification({ moduleId: 'other', key: 'k', kind: 'attention', title: 'x' })
      await post('/api/modules/valid/notifications/seen', {})
      const { items } = await (await app.request('/api/modules/notifications')).json() as { items: Array<{ moduleId: string; seen: boolean }> }
      expect(items.map(i => [i.moduleId, i.seen])).toEqual([['valid', true], ['other', false]])
    })
  })

  it('rescan picks up a newly installed module', async () => {
    rmSync(join(modulesDir, 'legacy'), { recursive: true })
    const list = await (await post('/api/modules/rescan', {})).json() as Array<{ id: string }>
    expect(list.map(m => m.id)).toEqual(['valid'])
  })

  describe('install and remove', () => {
    const calls: string[] = []
    const installer = {
      preview: async (spec: string) => {
        calls.push(`preview ${spec}`)
        if (spec === 'bad') throw new InstallError('bad_request', 'no forge-module.json')
        return { token: 't1', kind: 'v1', name: '@test/mod-x', version: '1.0.0', displayName: 'X', spec: '@test/mod-x@1.0.0', permissions: [], trustNote: 'trust' }
      },
      install: async (token: string) => {
        calls.push(`install ${token}`)
        if (token !== 't1') throw new InstallError('confirmation_required', 'Preview the module again before installing it')
        return { id: 'x', state: 'enabled' }
      },
      remove: async (id: string) => {
        calls.push(`remove ${id}`)
        if (id === 'bundled') throw new InstallError('bad_request', 'bundled comes with Forge and cannot be removed')
      },
    } as unknown as ModuleInstaller

    const withInstaller = (i?: ModuleInstaller) => {
      app = new Hono()
      app.route('/api/modules', moduleRoutes(host, { db, installer: i }))
    }
    const del = (path: string) => app.request(path, { method: 'DELETE' })

    beforeEach(() => { calls.length = 0; withInstaller(installer) })

    it('previews a spec', async () => {
      const res = await post('/api/modules/install/preview', { spec: '@test/mod-x' })
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ token: 't1', spec: '@test/mod-x@1.0.0' })
    })

    it('answers 400 with the reason a spec cannot be installed', async () => {
      const res = await post('/api/modules/install/preview', { spec: 'bad' })
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ code: 'bad_request', message: 'no forge-module.json' })
    })

    it('installs with the preview token and lists the modules', async () => {
      const res = await post('/api/modules/install', { token: 't1' })
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ status: { id: 'x' }, modules: expect.any(Array) })
    })

    it('answers 409 without a valid preview token', async () => {
      const res = await post('/api/modules/install', { token: 'other' })
      expect(res.status).toBe(409)
      expect(await res.json()).toMatchObject({ code: 'confirmation_required' })
    })

    it('removes a module and refuses one that came with Forge', async () => {
      expect((await del('/api/modules/valid')).status).toBe(200)
      const refused = await del('/api/modules/bundled')
      expect(refused.status).toBe(400)
      expect(calls).toEqual(['remove valid', 'remove bundled'])
    })

    it('answers 403 when this Forge does not install modules', async () => {
      withInstaller(undefined)
      expect((await post('/api/modules/install/preview', { spec: '@test/mod-x' })).status).toBe(403)
      expect((await post('/api/modules/install', { token: 't1' })).status).toBe(403)
      expect((await del('/api/modules/valid')).status).toBe(403)
      expect(calls).toEqual([])
    })
  })
})
