import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { cpSync, existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { describePermissions, installArgs, ModuleInstaller, previewManifest, TRUST_NOTE } from './module-install.js'
import { ForgeDB } from './db.js'
import { ActionRunner } from './runner.js'
import { CWReader } from './cw-reader.js'
import { ModuleHost } from './module-host.js'
import type { Runner } from './task-review.js'

const FIXTURES = join(import.meta.dirname, '../test/fixtures/modules')

describe('previewManifest', () => {
  let root: string
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'forge-install-')) })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('reads a path without running npm', async () => {
    const calls: string[][] = []
    const run: Runner = async (bin, args) => { calls.push([bin, ...args]); return { code: 0, stdout: '', stderr: '' } }
    const preview = await previewManifest(join(FIXTURES, 'valid'), { cwd: root, run })
    expect(preview.manifest.name).toBe('@test/mod-valid')
    expect(calls).toEqual([])
  })

  it('reads an npm spec from the packed tarball with an args array', async () => {
    const pkg = join(root, 'pkg/package')
    cpSync(join(FIXTURES, 'valid'), pkg, { recursive: true })
    writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: '@test/mod-valid', version: '1.2.3', forge: {} }))
    const calls: string[][] = []
    const run: Runner = async (bin, args) => {
      calls.push([bin, ...args])
      if (args[0] === 'pack') {
        const dest = args[args.indexOf('--pack-destination') + 1]
        execFileSync('tar', ['-czf', join(dest, 'test-mod-valid-1.2.3.tgz'), '-C', join(root, 'pkg'), 'package'])
        return { code: 0, stdout: JSON.stringify([{ filename: 'test-mod-valid-1.2.3.tgz' }]), stderr: '' }
      }
      execFileSync(bin, args)
      return { code: 0, stdout: '', stderr: '' }
    }
    const preview = await previewManifest('@test/mod-valid@1.2.3', { cwd: root, run })
    expect(preview.manifest.name).toBe('@test/mod-valid')
    expect(calls[0].slice(0, 3)).toEqual(['npm', 'pack', '@test/mod-valid@1.2.3'])
    expect(calls[0]).toContain('--ignore-scripts')
  })

  it('refuses an invalid manifest with its reason', async () => {
    await expect(previewManifest(join(FIXTURES, 'sdk-incompatible'), { cwd: root, run: async () => ({ code: 0, stdout: '', stderr: '' }) }))
      .rejects.toThrow('needs SDK ^2.0.0, Forge has 1.0.0')
  })

  it('reports npm pack failing', async () => {
    const run: Runner = async () => ({ code: 1, stdout: '', stderr: 'npm error 404 Not Found' })
    await expect(previewManifest('@nope/mod-x', { cwd: root, run })).rejects.toThrow('404 Not Found')
  })

  it('says a package npm cannot find is not on npm, without the log path', async () => {
    const stderr = 'npm error code E404\nnpm error 404 Not Found - GET https://registry.npmjs.org/@nope%2fmod-x - Not found\nnpm error A complete log of this run can be found in: /x/debug-0.log'
    const run: Runner = async () => ({ code: 1, stdout: '', stderr })
    await expect(previewManifest('@nope/mod-x', { cwd: root, run })).rejects.toThrow(/^@nope\/mod-x is not on npm$/)
    const other: Runner = async () => ({ code: 1, stdout: '', stderr: 'npm error code ETIMEDOUT\nnpm error A complete log of this run can be found in: /x/debug-0.log' })
    await expect(previewManifest('@nope/mod-x', { cwd: root, run: other })).rejects.toThrow(/^npm pack @nope\/mod-x failed: npm error code ETIMEDOUT$/)
  })

  it('reports a folder with no manifest', async () => {
    mkdirSync(join(root, 'empty'))
    await expect(previewManifest(join(root, 'empty'), { cwd: root, run: async () => ({ code: 0, stdout: '', stderr: '' }) })).rejects.toThrow('no forge-module.json')
  })
})

describe('describePermissions', () => {
  it('lists each permission and the trust note', () => {
    const text = describePermissions({ id: 'h', name: 'h', version: '1', sdk: '^1.0.0', displayName: 'H', permissions: { network: ['http://localhost:{instances[].port}'], 'fs:read': ['{instances[].path}/data/dashboard-token'], pty: true } })
    expect(text).toContain('network   http://localhost:{instances[].port}')
    expect(text).toContain('fs:read   {instances[].path}/data/dashboard-token')
    expect(text).toContain('pty       yes')
    expect(text).toContain(TRUST_NOTE)
  })

  it('says when a module asks for nothing', () => {
    expect(describePermissions({ id: 'h', name: 'h', version: '1', sdk: '^1.0.0', displayName: 'H' })).toContain('no permissions')
  })
})

describe('installArgs', () => {
  it('puts --ignore-scripts before the spec', () => {
    expect(installArgs('@forge-dev/mod-harvey', '/home/u/.forge/modules')).toEqual(['install', '--ignore-scripts', '--prefix', '/home/u/.forge/modules', '@forge-dev/mod-harvey'])
  })
})

describe('ModuleInstaller', () => {
  let root: string
  let modulesDir: string
  let db: ForgeDB
  let host: ModuleHost
  let calls: string[][]
  let installFails: string | null
  let now: number
  let installer: ModuleInstaller

  const installed = (name: string) => join(modulesDir, 'node_modules', name)
  const fakeNpm: Runner = async (bin, args) => {
    calls.push([bin, ...args])
    if (bin !== 'npm') {
      execFileSync(bin, args)
      return { code: 0, stdout: '', stderr: '' }
    }
    if (args[0] === 'pack') {
      const dest = args[args.indexOf('--pack-destination') + 1]
      const pkg = join(root, 'pack/package')
      cpSync(join(FIXTURES, 'valid'), pkg, { recursive: true })
      writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: '@test/mod-valid', version: '1.2.3', forge: {} }))
      execFileSync('tar', ['-czf', join(dest, 'test-mod-valid-1.2.3.tgz'), '-C', join(root, 'pack'), 'package'])
      return { code: 0, stdout: JSON.stringify([{ name: '@test/mod-valid', version: '1.2.3', filename: 'test-mod-valid-1.2.3.tgz' }]), stderr: '' }
    }
    if (args[0] === 'install') {
      if (installFails) return { code: 1, stdout: '', stderr: installFails }
      cpSync(join(FIXTURES, 'valid'), installed('@test/mod-valid'), { recursive: true })
      writeFileSync(join(installed('@test/mod-valid'), 'package.json'), JSON.stringify({ name: '@test/mod-valid', version: '1.2.3', forge: {} }))
      return { code: 0, stdout: '', stderr: '' }
    }
    if (args[0] === 'uninstall') {
      rmSync(installed(args.at(-1)!), { recursive: true, force: true })
      return { code: 0, stdout: '', stderr: '' }
    }
    return { code: 0, stdout: '', stderr: '' }
  }
  const npmCalls = (verb: string) => calls.filter(c => c[0] === 'npm' && c[1] === verb)

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'forge-installer-'))
    modulesDir = join(root, 'modules')
    db = new ForgeDB(join(root, 'forge.db'))
    host = new ModuleHost({ modulesDir, devFile: join(root, 'dev.json'), localOnly: true, deps: { db, reader: new CWReader(join(root, 'cw')), runner: new ActionRunner() } })
    await host.scan()
    calls = []
    installFails = null
    now = 0
    installer = new ModuleInstaller({ modulesDir, host, run: fakeNpm, cwd: root, now: () => now })
  })

  afterEach(() => {
    host.close()
    db.close()
    rmSync(root, { recursive: true, force: true })
  })

  it('previews an npm package with its permissions, pinned to the version it read', async () => {
    const preview = await installer.preview('@test/mod-valid')
    expect(preview).toMatchObject({ kind: 'v1', name: '@test/mod-valid', version: '1.2.3', displayName: 'Valid', spec: '@test/mod-valid@1.2.3', trustNote: TRUST_NOTE })
    expect(preview.permissions).toEqual([{ kind: 'network', value: 'http://localhost:{port}' }])
    expect(preview.token).toMatch(/.{20,}/)
    expect(npmCalls('install')).toEqual([])
  })

  it('installs exactly the previewed version with scripts off, then loads it', async () => {
    const { token } = await installer.preview('@test/mod-valid')
    const status = await installer.install(token)
    expect(npmCalls('install')).toEqual([['npm', ...installArgs('@test/mod-valid@1.2.3', modulesDir)]])
    expect(status).toMatchObject({ id: 'valid', state: 'enabled', source: 'node_modules' })
    expect(host.get('valid')).toBeDefined()
  })

  it('a preview token installs once', async () => {
    const { token } = await installer.preview('@test/mod-valid')
    await installer.install(token)
    await expect(installer.install(token)).rejects.toMatchObject({ code: 'confirmation_required' })
    expect(npmCalls('install')).toHaveLength(1)
  })

  it('an expired preview installs nothing', async () => {
    const { token } = await installer.preview('@test/mod-valid')
    now += 11 * 60_000
    await expect(installer.install(token)).rejects.toMatchObject({ code: 'confirmation_required' })
    expect(npmCalls('install')).toEqual([])
  })

  it('reports npm failing and loads nothing', async () => {
    installFails = 'npm error code E403'
    const { token } = await installer.preview('@test/mod-valid')
    await expect(installer.install(token)).rejects.toMatchObject({ code: 'install_failed', message: expect.stringContaining('E403') })
    expect(host.list()).toEqual([])
  })

  it('pins a folder to its absolute path and a git url as given', async () => {
    const folder = join(root, 'src/mod-valid')
    cpSync(join(FIXTURES, 'valid'), folder, { recursive: true })
    expect((await installer.preview(folder)).spec).toBe(folder)
    expect((await installer.preview('github:someone/mod-valid')).spec).toBe('github:someone/mod-valid')
  })

  it('refuses a spec that is not a module', async () => {
    mkdirSync(join(root, 'empty'))
    await expect(installer.preview(join(root, 'empty'))).rejects.toMatchObject({ code: 'bad_request', message: expect.stringContaining('no forge-module.json') })
  })

  it('removes a package npm installed', async () => {
    await installer.install((await installer.preview('@test/mod-valid')).token)
    await installer.remove('valid')
    expect(npmCalls('uninstall')).toEqual([['npm', 'uninstall', '--prefix', modulesDir, '@test/mod-valid']])
    expect(host.list()).toEqual([])
  })

  it('removes a module copied into the modules folder', async () => {
    cpSync(join(FIXTURES, 'valid'), join(modulesDir, 'valid'), { recursive: true })
    await host.scan()
    await installer.remove('valid')
    expect(existsSync(join(modulesDir, 'valid'))).toBe(false)
    expect(host.list()).toEqual([])
  })

  it('does not remove a dev folder or an unknown module', async () => {
    const folder = join(root, 'src/mod-valid')
    cpSync(join(FIXTURES, 'valid'), folder, { recursive: true })
    await host.addDev(folder)
    await expect(installer.remove('valid')).rejects.toMatchObject({ code: 'bad_request' })
    expect(existsSync(folder)).toBe(true)
    await expect(installer.remove('nope')).rejects.toMatchObject({ code: 'not_found' })
  })
})
