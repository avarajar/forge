import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SettingDef } from '@forge-dev/sdk'
import { checkManifest, checkSdk, validateSettings } from './module-manifest.js'

const v1 = (extra: Record<string, unknown> = {}) => ({
  id: 'harvey', name: '@forge-dev/mod-harvey', version: '0.1.0', sdk: '^1.0.0', displayName: 'Harvey', ...extra,
})

describe('checkManifest', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'forge-manifest-')) })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('accepts a valid v1 manifest', () => {
    const result = checkManifest(v1({ server: './dist/server.js', view: { entry: './dist/view.js' } }), dir)
    expect(result.kind).toBe('v1')
  })

  it('treats a manifest without sdk or v1 fields as legacy', () => {
    const result = checkManifest({ name: '@forge-dev/mod-qa', version: '0.1.0', displayName: 'QA', description: '', icon: '', color: '', panels: [], actions: [] }, dir)
    expect(result.kind).toBe('legacy')
  })

  it('refuses v1 fields without an sdk range', () => {
    const { sdk: _sdk, ...rest } = v1({ server: './dist/server.js' })
    const result = checkManifest(rest, dir)
    expect(result).toEqual({ kind: 'invalid', reason: 'declares v1 fields but no sdk range' })
  })

  it('reports a bad id with its JSON path', () => {
    const result = checkManifest(v1({ id: 'Harvey!' }), dir)
    expect(result.kind).toBe('invalid')
    if (result.kind === 'invalid') expect(result.reason).toContain('/id')
  })

  it('reports a missing required field', () => {
    const { displayName: _d, ...rest } = v1()
    const result = checkManifest(rest, dir)
    expect(result.kind === 'invalid' && result.reason).toContain('displayName')
  })

  it('refuses a server path outside the module folder', () => {
    const result = checkManifest(v1({ server: '../x.js' }), dir)
    expect(result.kind === 'invalid' && result.reason).toContain('outside the module folder')
  })

  it('refuses an unknown permission', () => {
    const result = checkManifest(v1({ permissions: { camera: true } }), dir)
    expect(result.kind === 'invalid' && result.reason).toContain('/permissions/camera')
  })

  it('refuses a non-object manifest', () => {
    expect(checkManifest('nope', dir).kind).toBe('invalid')
  })
})

describe('checkSdk', () => {
  it('names the range and the version when incompatible', () => {
    expect(checkSdk('^2.0.0')).toBe('needs SDK ^2.0.0, Forge has 1.0.0')
  })

  it('accepts a compatible range', () => {
    expect(checkSdk('^1.0.0')).toBeNull()
  })

  it('reports an invalid range', () => {
    expect(checkSdk('banana')).toBe('sdk range "banana" is not valid semver')
  })
})

describe('validateSettings', () => {
  const schema: Record<string, SettingDef> = {
    instances: {
      type: 'list',
      item: {
        name: { type: 'string', required: true, pattern: '^[a-z0-9-]+$' },
        path: { type: 'string', required: true, format: 'path' },
        port: { type: 'number', default: 5555, min: 1, max: 65535 },
        provider: { type: 'enum', values: ['claude', 'codex'], default: 'claude' },
      },
    },
    verbose: { type: 'boolean', default: false },
  }

  it('applies defaults, including inside list items', () => {
    const result = validateSettings(schema, { instances: [{ name: 'saludbot', path: '/tmp/h' }] })
    expect(result).toEqual({ ok: true, value: { instances: [{ name: 'saludbot', path: '/tmp/h', port: 5555, provider: 'claude' }], verbose: false } })
  })

  it('defaults a missing list to empty', () => {
    const result = validateSettings(schema, {})
    expect(result.ok && result.value.instances).toEqual([])
  })

  it('reports a missing required field by path', () => {
    const result = validateSettings(schema, { instances: [{ name: 'a' }] })
    expect(result).toEqual({ ok: false, errors: [{ path: 'instances[0].path', message: 'required' }] })
  })

  it('rejects an enum value outside its values', () => {
    const result = validateSettings(schema, { instances: [{ name: 'a', path: '/x', provider: 'gpt' }] })
    expect(!result.ok && result.errors[0].path).toBe('instances[0].provider')
  })

  it('rejects a pattern mismatch and a number out of range', () => {
    const result = validateSettings(schema, { instances: [{ name: 'Bad Name', path: '/x', port: 0 }] })
    expect(!result.ok && result.errors.map(e => e.path)).toEqual(['instances[0].name', 'instances[0].port'])
  })

  it('rejects a wrong type', () => {
    const result = validateSettings(schema, { verbose: 'yes' })
    expect(!result.ok && result.errors[0]).toEqual({ path: 'verbose', message: 'must be a boolean' })
  })

  it('drops keys the schema does not declare', () => {
    const result = validateSettings(schema, { other: 1 })
    expect(result.ok && 'other' in result.value).toBe(false)
  })
})
