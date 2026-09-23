import { describe, it, expect } from 'vitest'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  compareVersions, decideCwInstall, ensureCw, findOnPath, pathWithCw, readCwBundle, readCwVersion,
  type CwBundle, type InstallRunner,
} from './cw-install.js'

const script = (version: string) => `#!/usr/bin/env bash\nset -euo pipefail\n\nCW_VERSION="${version}"\n`

function makeBundle(root: string, version: string, ref: string): string {
  const dir = join(root, 'bundle')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'cw'), script(version))
  writeFileSync(join(dir, 'install.sh'), '#!/usr/bin/env bash\n')
  writeFileSync(join(dir, '.bundle.json'), JSON.stringify({ ref, version }))
  return dir
}

// stands in for install.sh: copies the bundled script to $CW_HOME/bin/cw
const copyingRunner = (calls: Array<{ script: string; args: string[]; cwHome: string | undefined }>): InstallRunner =>
  async (installScript, args, env) => {
    calls.push({ script: installScript, args, cwHome: env.CW_HOME })
    const bin = join(env.CW_HOME ?? '', 'bin')
    mkdirSync(bin, { recursive: true })
    writeFileSync(join(bin, 'cw'), readFileSync(join(installScript, '..', 'cw')))
    return { code: 0, output: 'Installation complete!' }
  }

const bundle: CwBundle = { dir: '/b', version: '0.4.0', ref: 'abc' }

describe('readCwVersion', () => {
  it('reads CW_VERSION from the script', () => {
    const root = mkdtempSync(join(tmpdir(), 'forge-cw-'))
    writeFileSync(join(root, 'cw'), script('0.3.0'))
    expect(readCwVersion(join(root, 'cw'))).toBe('0.3.0')
  })

  it('returns null for a missing file or a script without a version', () => {
    const root = mkdtempSync(join(tmpdir(), 'forge-cw-'))
    writeFileSync(join(root, 'cw'), '#!/usr/bin/env bash\necho hi\n')
    expect(readCwVersion(join(root, 'cw'))).toBeNull()
    expect(readCwVersion(join(root, 'missing'))).toBeNull()
  })
})

describe('compareVersions', () => {
  it('compares each part as a number', () => {
    expect(compareVersions('0.10.0', '0.9.1')).toBeGreaterThan(0)
    expect(compareVersions('0.3.0', '0.3.0')).toBe(0)
    expect(compareVersions('0.3', '0.3.1')).toBeLessThan(0)
    expect(compareVersions('1.0.0', '0.99.99')).toBeGreaterThan(0)
  })
})

describe('readCwBundle', () => {
  it('reads the ref and the version of the bundled script', () => {
    const root = mkdtempSync(join(tmpdir(), 'forge-cw-'))
    const dir = makeBundle(root, '0.4.0', 'abc123')
    expect(readCwBundle(dir)).toEqual({ dir, version: '0.4.0', ref: 'abc123' })
  })

  it('is null when there is no bundle, as in a checkout of the repo', () => {
    expect(readCwBundle(join(mkdtempSync(join(tmpdir(), 'forge-cw-')), 'cw'))).toBeNull()
  })
})

describe('decideCwInstall', () => {
  const base = { bundle, installed: null, marker: null, cwOnPath: false, skip: false }

  it('installs when CW is missing', () => {
    expect(decideCwInstall(base).action).toBe('install')
  })

  it('leaves a cw found elsewhere on PATH alone', () => {
    expect(decideCwInstall({ ...base, cwOnPath: true }).action).toBe('skip')
  })

  it('skips when told to, or when this Forge carries no CW', () => {
    expect(decideCwInstall({ ...base, skip: true }).action).toBe('skip')
    expect(decideCwInstall({ ...base, bundle: null }).action).toBe('skip')
  })

  it('updates a CW it installed when the bundle comes from another commit', () => {
    const decision = decideCwInstall({
      ...base,
      installed: { version: '0.4.0', sha256: 'h1' },
      marker: { version: '0.4.0', ref: 'old', sha256: 'h1' },
    })
    expect(decision.action).toBe('update')
  })

  it('keeps a CW it installed from the same commit', () => {
    const decision = decideCwInstall({
      ...base,
      installed: { version: '0.4.0', sha256: 'h1' },
      marker: { version: '0.4.0', ref: 'abc', sha256: 'h1' },
    })
    expect(decision.action).toBe('skip')
  })

  it('never downgrades', () => {
    const decision = decideCwInstall({
      ...base,
      installed: { version: '0.5.0', sha256: 'h1' },
      marker: { version: '0.5.0', ref: 'newer', sha256: 'h1' },
    })
    expect(decision.action).toBe('skip')
  })

  it('treats a CW changed since Forge installed it as installed by hand', () => {
    // same version, the script was replaced by ./install.sh from a checkout
    const decision = decideCwInstall({
      ...base,
      installed: { version: '0.4.0', sha256: 'h2' },
      marker: { version: '0.4.0', ref: 'old', sha256: 'h1' },
    })
    expect(decision.action).toBe('skip')
  })

  it('updates a CW installed by hand only to a newer version', () => {
    expect(decideCwInstall({ ...base, installed: { version: '0.3.0', sha256: 'h' } }).action).toBe('update')
    expect(decideCwInstall({ ...base, installed: { version: '0.4.0', sha256: 'h' } }).action).toBe('skip')
  })

  it('leaves a CW whose version it cannot read alone', () => {
    expect(decideCwInstall({ ...base, installed: { version: null, sha256: 'h' } }).action).toBe('skip')
  })
})

describe('findOnPath', () => {
  it('finds an executable and ignores the excluded directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'forge-cw-'))
    const a = join(root, 'a'), b = join(root, 'b')
    mkdirSync(a); mkdirSync(b)
    writeFileSync(join(b, 'cw'), '#!/bin/sh\n'); chmodSync(join(b, 'cw'), 0o755)
    expect(findOnPath('cw', `${a}:${b}`)).toBe(join(b, 'cw'))
    expect(findOnPath('cw', `${a}:${b}`, b)).toBeNull()
  })

  it('ignores a file that is not executable', () => {
    const root = mkdtempSync(join(tmpdir(), 'forge-cw-'))
    writeFileSync(join(root, 'cw'), 'x'); chmodSync(join(root, 'cw'), 0o644)
    expect(findOnPath('cw', root)).toBeNull()
  })
})

describe('pathWithCw', () => {
  it('puts CW first, once', () => {
    expect(pathWithCw('/h/.cw', '/usr/bin:/bin')).toBe('/h/.cw/bin:/usr/bin:/bin')
    expect(pathWithCw('/h/.cw', '/h/.cw/bin:/usr/bin')).toBe('/h/.cw/bin:/usr/bin')
    expect(pathWithCw('/h/.cw', undefined)).toBe('/h/.cw/bin')
  })
})

describe('ensureCw', () => {
  it('installs the bundled CW without shell integration and records what it installed', async () => {
    const root = mkdtempSync(join(tmpdir(), 'forge-cw-'))
    const cwHome = join(root, 'home', '.cw')
    const dir = makeBundle(root, '0.4.0', 'abc')
    const calls: Array<{ script: string; args: string[]; cwHome: string | undefined }> = []

    const result = await ensureCw({ cwHome, bundleDir: dir, env: { PATH: '' }, run: copyingRunner(calls) })

    expect(result).toMatchObject({ action: 'installed', version: '0.4.0' })
    expect(calls).toEqual([{ script: join(dir, 'install.sh'), args: ['--no-shell'], cwHome }])
    const marker = JSON.parse(readFileSync(join(cwHome, '.forge-cw.json'), 'utf-8'))
    expect(marker).toMatchObject({ version: '0.4.0', ref: 'abc' })
    expect(marker.sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('updates what it installed when the bundle changes, and then leaves it', async () => {
    const root = mkdtempSync(join(tmpdir(), 'forge-cw-'))
    const cwHome = join(root, '.cw')
    const calls: Array<{ script: string; args: string[]; cwHome: string | undefined }> = []
    await ensureCw({ cwHome, bundleDir: makeBundle(join(root, 'v1'), '0.4.0', 'one'), env: { PATH: '' }, run: copyingRunner(calls) })

    const next = makeBundle(join(root, 'v2'), '0.4.1', 'two')
    expect(await ensureCw({ cwHome, bundleDir: next, env: { PATH: '' }, run: copyingRunner(calls) }))
      .toMatchObject({ action: 'updated', version: '0.4.1' })
    expect(await ensureCw({ cwHome, bundleDir: next, env: { PATH: '' }, run: copyingRunner(calls) }))
      .toMatchObject({ action: 'skipped' })
    expect(calls).toHaveLength(2)
  })

  it('reports the installer output when it fails, and writes no marker', async () => {
    const root = mkdtempSync(join(tmpdir(), 'forge-cw-'))
    const cwHome = join(root, '.cw')
    const failing: InstallRunner = async () => ({
      code: 1,
      output: '\u001b[31m[✗]\u001b[0m cw requires bash >= 4, but `env bash` resolves to bash 3 on this system.\n',
    })

    const result = await ensureCw({ cwHome, bundleDir: makeBundle(root, '0.4.0', 'abc'), env: { PATH: '' }, run: failing })

    expect(result.action).toBe('failed')
    expect(result.message).toContain('cw requires bash >= 4')
    expect(result.message).not.toContain('\u001b')
    expect(existsSync(join(cwHome, '.forge-cw.json'))).toBe(false)
  })

  it('does nothing when FORGE_SKIP_CW_INSTALL is set', async () => {
    const root = mkdtempSync(join(tmpdir(), 'forge-cw-'))
    const calls: Array<{ script: string; args: string[]; cwHome: string | undefined }> = []
    const result = await ensureCw({
      cwHome: join(root, '.cw'), bundleDir: makeBundle(root, '0.4.0', 'abc'),
      env: { PATH: '', FORGE_SKIP_CW_INSTALL: '1' }, run: copyingRunner(calls),
    })
    expect(result.action).toBe('skipped')
    expect(calls).toHaveLength(0)
  })
})
