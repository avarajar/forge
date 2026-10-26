import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { cpSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { describePermissions, installArgs, previewManifest, TRUST_NOTE } from './module-install.js'
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
