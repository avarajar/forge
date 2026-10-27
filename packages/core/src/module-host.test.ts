import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ForgeDB } from './db.js'
import { ActionRunner } from './runner.js'
import { CWReader } from './cw-reader.js'
import { ModuleHost, type HostOptions } from './module-host.js'

const FIXTURES = join(import.meta.dirname, '../test/fixtures/modules')

describe('ModuleHost', () => {
  let root: string
  let modulesDir: string
  let db: ForgeDB
  let host: ModuleHost

  const install = (fixture: string, dest = join(modulesDir, fixture)) => {
    cpSync(join(FIXTURES, fixture), dest, { recursive: true })
    return dest
  }
  const make = (opts: Partial<HostOptions> = {}) => {
    host = new ModuleHost({
      modulesDir,
      devFile: join(root, 'dev-modules.json'),
      localOnly: true,
      deps: { db, reader: new CWReader(join(root, 'cw')), runner: new ActionRunner() },
      ...opts,
    })
    return host
  }
  const status = (id: string) => host.list().find(s => s.id === id)

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'forge-host-'))
    modulesDir = join(root, 'modules')
    mkdirSync(modulesDir)
    db = new ForgeDB(join(root, 'forge.db'))
  })

  afterEach(async () => {
    await host?.close()
    db.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('loads a valid module with its view', async () => {
    install('valid')
    await make().scan()
    expect(status('valid')).toMatchObject({
      state: 'enabled', source: 'installed', name: '@test/mod-valid', version: '1.2.3', displayName: 'Valid',
      view: { url: '/api/modules/valid/view.js', title: 'Valid view' },
      settingsSchema: { port: { type: 'number', default: 5555 } },
    })
    expect(host.get('valid')?.server?.routes).toHaveLength(6)
  })

  it('lists each action with its effect', async () => {
    install('valid')
    await make().scan()
    expect(status('valid')?.actions).toEqual([
      { id: 'count', label: 'Count', effect: 'read' },
      { id: 'send', label: 'Send', effect: 'external' },
      { id: 'talk', label: 'Talk', effect: 'local' },
    ])
  })

  it('lists a legacy manifest under its folder name', async () => {
    install('legacy')
    await make().scan()
    expect(status('legacy')).toMatchObject({ state: 'legacy', displayName: 'Legacy' })
  })

  it.each([
    ['bad-json', 'bad-json', /JSON/],
    ['schema-error', 'schema-error', /\/permissions\/camera: unknown permission/],
    ['sdk-incompatible', 'sdk-incompatible', /needs SDK \^2.0.0, Forge has 1.0.0/],
    ['sdk-missing', 'sdk-missing', /declares v1 fields but no sdk range/],
    ['import-throws', 'import-throws', /cannot start: missing config/],
    ['shell-undeclared', 'shell-undeclared', /action status uses shell but the manifest does not declare it/],
    ['reserved-route', 'reserved-route', /route \/settings uses a reserved segment/],
  ])('disables %s with its reason', async (fixture, id, reason) => {
    install(fixture)
    await make().scan()
    expect(status(id)?.state).toBe('disabled')
    expect(status(id)?.reason).toMatch(reason)
  })

  it('explains an ES module server loaded as CommonJS', async () => {
    writeFileSync(join(modulesDir, 'package.json'), JSON.stringify({ type: 'commonjs' }))
    install('valid')
    await make().scan()
    expect(status('valid')?.reason).toMatch(/add "type": "module" to the module's package.json/)
  })

  it('disables a duplicate id, naming where the first came from', async () => {
    const first = install('duplicate-a', join(modulesDir, 'a'))
    install('duplicate-b', join(modulesDir, 'b'))
    await make().scan()
    const dups = host.list().filter(s => s.id === 'dup')
    expect(dups.map(d => d.state)).toEqual(['enabled', 'disabled'])
    expect(dups[1].reason).toBe(`duplicate id, already loaded from ${first}`)
  })

  it('prefers a folder under modules over a package in node_modules', async () => {
    install('valid')
    const pkg = join(modulesDir, 'node_modules/@test/mod-valid')
    install('valid', pkg)
    writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: '@test/mod-valid', forge: { manifest: 'forge-module.json' } }))
    await make().scan()
    expect(status('valid')?.source).toBe('installed')
    expect(host.list().filter(s => s.id === 'valid')[1]?.state).toBe('disabled')
  })

  it('finds packages installed by npm under node_modules', async () => {
    const pkg = join(modulesDir, 'node_modules/@test/mod-valid')
    install('valid', pkg)
    writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: '@test/mod-valid', forge: {} }))
    await make().scan()
    expect(status('valid')).toMatchObject({ state: 'enabled', source: 'node_modules' })
  })

  it('marks only what was installed into the modules folder as removable', async () => {
    install('valid')
    const own = join(root, 'forge-node-modules')
    const pkg = install('valid', join(own, '@forge-dev/mod-watcher'))
    writeFileSync(join(pkg, 'forge-module.json'), JSON.stringify({ ...JSON.parse(readFileSync(join(pkg, 'forge-module.json'), 'utf-8')), id: 'watcher' }))
    await make({ forgeNodeModules: own }).scan()
    expect(status('valid')?.removable).toBe(true)
    expect(status('watcher')?.removable).toBeUndefined()
    expect(host.locate('valid')).toEqual({ dir: join(modulesDir, 'valid'), removable: true })
    expect(host.locate('watcher')?.removable).toBe(false)
  })

  it('follows a package that npm linked from a folder', async () => {
    const src = install('valid', join(root, 'src-valid'))
    writeFileSync(join(src, 'package.json'), JSON.stringify({ name: '@test/mod-valid', forge: {} }))
    mkdirSync(join(modulesDir, 'node_modules/@test'), { recursive: true })
    symlinkSync(src, join(modulesDir, 'node_modules/@test/mod-valid'))
    await make().scan()
    expect(status('valid')).toMatchObject({ state: 'enabled', source: 'node_modules' })
  })

  it('loads dev modules first', async () => {
    install('valid')
    const dev = install('valid', join(root, 'dev-valid'))
    await make().addDev(dev)
    expect(status('valid')?.source).toBe('dev')
  })

  it('disables v1 modules outside local mode', async () => {
    install('valid')
    await make({ localOnly: false }).scan()
    expect(status('valid')).toMatchObject({ state: 'disabled', reason: 'modules run only in local mode' })
  })

  it('reload re-imports a changed server.js', async () => {
    const dir = install('valid')
    await make().scan()
    writeFileSync(join(dir, 'dist/server.js'), 'export default { routes: [] }')
    const later = new Date(Date.now() + 5000)
    utimesSync(join(dir, 'dist/server.js'), later, later)
    await host.reload('valid')
    expect(host.get('valid')?.server?.routes).toEqual([])
  })

  it('reload leaves the other modules running', async () => {
    install('valid')
    install('demo')
    await make().scan()
    const other = host.get('demo')!.abort.signal
    await host.reload('valid')
    expect(other.aborted).toBe(false)
    expect(host.list().map(s => [s.id, s.state])).toEqual([['demo', 'enabled'], ['valid', 'enabled']])
  })

  it('close aborts the module signal', async () => {
    install('valid')
    await make().scan()
    const signal = host.get('valid')!.abort.signal
    await host.close()
    expect(signal.aborted).toBe(true)
  })

  it('saves settings through the schema and recomputes grants', async () => {
    install('valid')
    await make().scan()
    expect(host.settings('valid')).toEqual({ port: 5555 })
    expect(host.get('valid')!.grants.network).toEqual(['http://localhost:5555'])
    expect(host.saveSettings('valid', { port: 7000 })).toEqual({ ok: true })
    expect(host.get('valid')!.grants.network).toEqual(['http://localhost:7000'])
    expect(host.saveSettings('valid', { port: 'x' })).toMatchObject({ ok: false, errors: [{ path: 'port' }] })
  })

  it('a cleared optional setting stays cleared after a rescan', async () => {
    const dir = install('valid')
    const manifest = JSON.parse(readFileSync(join(dir, 'forge-module.json'), 'utf-8'))
    manifest.settings.schema.label = { type: 'string' }
    writeFileSync(join(dir, 'forge-module.json'), JSON.stringify(manifest))
    await make().scan()
    host.saveSettings('valid', { port: 7000, label: 'x' })
    host.saveSettings('valid', { port: 7000 })
    await host.scan()
    expect(host.settings('valid')).toEqual({ port: 7000 })
  })

  it('two reloads at once leave one loaded copy of the module', async () => {
    install('valid')
    let live = 0
    await make({ hooks: { loaded: () => { live++ }, unloading: () => { live-- } } }).scan()
    await Promise.all([host.reload('valid'), host.reload('valid'), host.scan()])
    expect(live).toBe(1)
    expect(host.list().filter(s => s.id === 'valid')).toHaveLength(1)
  })

  it('records the last permission denial on the status', async () => {
    install('valid')
    await make().scan()
    await expect(host.get('valid')!.ctx.fetch('http://localhost:9/')).rejects.toThrow()
    expect(status('valid')?.lastDenial).toMatchObject({ permission: 'network', value: 'http://localhost:9/' })
  })
})
