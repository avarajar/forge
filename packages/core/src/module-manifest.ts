import { readFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import semver from 'semver'
import { MODULE_ID_RE, SDK_VERSION } from '@forge-dev/sdk'
import { realOrParent } from './module-permissions.js'
import type { LegacyManifest, ModuleManifestV1, ModuleSettings, ScalarSettingDef, SettingDef } from '@forge-dev/sdk'

export type ManifestCheck =
  | { kind: 'v1'; manifest: ModuleManifestV1 }
  | { kind: 'legacy'; manifest: LegacyManifest }
  | { kind: 'invalid'; reason: string }

export type SettingsResult =
  | { ok: true; value: ModuleSettings }
  | { ok: false; errors: Array<{ path: string; message: string }> }

const V1_FIELDS = ['server', 'view', 'permissions', 'id']
const TOP_LEVEL = new Set(['$schema', 'id', 'name', 'version', 'sdk', 'displayName', 'description', 'icon', 'color', 'server', 'view', 'permissions', 'settings', 'actions', 'detectors', 'panels', 'claude'])
const PERMISSIONS = new Set(['network', 'fs:read', 'fs:write', 'shell', 'pty'])
const SCALAR_TYPES = new Set(['string', 'number', 'boolean', 'enum'])
const FORMATS = new Set(['path', 'cw-project', 'url'])

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string')

export function checkSdk(range: string, version: string = SDK_VERSION): string | null {
  if (!semver.validRange(range)) return `sdk range "${range}" is not valid semver`
  return semver.satisfies(version, range) ? null : `needs SDK ${range}, Forge has ${version}`
}

export function checkManifest(raw: unknown, moduleDir: string): ManifestCheck {
  if (!isObject(raw)) return { kind: 'invalid', reason: '/: must be an object' }
  if (raw.sdk === undefined) {
    if (V1_FIELDS.some(f => raw[f] !== undefined)) return { kind: 'invalid', reason: 'declares v1 fields but no sdk range' }
    return { kind: 'legacy', manifest: raw as unknown as LegacyManifest }
  }

  const errors: string[] = []
  const err = (path: string, message: string) => errors.push(`${path}: ${message}`)

  for (const key of Object.keys(raw)) if (!TOP_LEVEL.has(key)) err(`/${key}`, 'unknown field')
  for (const key of ['id', 'name', 'version', 'sdk', 'displayName']) {
    if (typeof raw[key] !== 'string' || raw[key] === '') err(`/${key}`, 'required string')
  }
  if (typeof raw.id === 'string' && !MODULE_ID_RE.test(raw.id)) err('/id', `must match ${MODULE_ID_RE.source}`)
  for (const key of ['description', 'icon', 'color', 'server']) {
    if (raw[key] !== undefined && typeof raw[key] !== 'string') err(`/${key}`, 'must be a string')
  }

  if (raw.view !== undefined) {
    if (!isObject(raw.view) || typeof raw.view.entry !== 'string' || raw.view.entry === '') err('/view/entry', 'required string')
    else if (raw.view.title !== undefined && typeof raw.view.title !== 'string') err('/view/title', 'must be a string')
  }

  if (raw.permissions !== undefined) {
    if (!isObject(raw.permissions)) err('/permissions', 'must be an object')
    else {
      for (const [key, value] of Object.entries(raw.permissions)) {
        if (!PERMISSIONS.has(key)) err(`/permissions/${key}`, 'unknown permission')
        else if (key === 'pty' ? typeof value !== 'boolean' : !isStringArray(value)) {
          err(`/permissions/${key}`, key === 'pty' ? 'must be a boolean' : 'must be a list of strings')
        }
      }
    }
  }

  if (raw.settings !== undefined) {
    if (!isObject(raw.settings) || !isObject(raw.settings.schema)) err('/settings/schema', 'required object')
    else for (const [key, def] of Object.entries(raw.settings.schema)) checkSettingDef(def, `/settings/schema/${key}`, true, err)
  }

  for (const key of ['actions', 'detectors', 'panels']) {
    if (raw[key] !== undefined && !Array.isArray(raw[key])) err(`/${key}`, 'must be a list')
  }

  if (typeof raw.sdk === 'string' && errors.length === 0) {
    const sdkReason = checkSdk(raw.sdk)
    if (sdkReason) return { kind: 'invalid', reason: sdkReason }
  }

  if (errors.length === 0) {
    const entries: Array<[string, unknown]> = [['/server', raw.server], ['/view/entry', isObject(raw.view) ? raw.view.entry : undefined]]
    for (const [path, value] of entries) {
      if (typeof value === 'string' && !insideFolder(moduleDir, value)) err(path, 'points outside the module folder')
    }
  }

  if (errors.length > 0) return { kind: 'invalid', reason: errors.join('; ') }
  return { kind: 'v1', manifest: raw as unknown as ModuleManifestV1 }
}

function checkSettingDef(def: unknown, path: string, allowList: boolean, err: (path: string, message: string) => void): void {
  if (!isObject(def)) return err(path, 'must be an object')
  if (def.type === 'list') {
    if (!allowList) return err(`${path}/type`, 'lists do not nest')
    if (!isObject(def.item)) return err(`${path}/item`, 'required object')
    for (const [key, sub] of Object.entries(def.item)) checkSettingDef(sub, `${path}/item/${key}`, false, err)
    return
  }
  if (typeof def.type !== 'string' || !SCALAR_TYPES.has(def.type)) return err(`${path}/type`, 'must be string, number, boolean, enum or list')
  if (def.type === 'enum' && !isStringArray(def.values)) err(`${path}/values`, 'required list of strings')
  if (def.format !== undefined && !FORMATS.has(def.format as string)) err(`${path}/format`, 'must be path, cw-project or url')
  if (def.pattern !== undefined) {
    try { new RegExp(def.pattern as string) } catch { err(`${path}/pattern`, 'is not a valid regular expression') }
  }
}

function insideFolder(dir: string, relative: string): boolean {
  const root = realOrParent(resolve(dir))
  const target = realOrParent(resolve(dir, relative))
  return target === root || target.startsWith(root + sep)
}

// the manifest a package points at with "forge": { "manifest" }, else forge-module.json
export function manifestFileFor(dir: string): { file: string; hasForgeField: boolean } {
  try {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8')) as { forge?: { manifest?: unknown } }
    const manifest = typeof pkg.forge?.manifest === 'string' ? pkg.forge.manifest : 'forge-module.json'
    return { file: join(dir, manifest), hasForgeField: pkg.forge !== undefined }
  } catch {
    return { file: join(dir, 'forge-module.json'), hasForgeField: false }
  }
}

export function validateSettings(schema: Record<string, SettingDef>, values: unknown): SettingsResult {
  const input = isObject(values) ? values : {}
  const errors: Array<{ path: string; message: string }> = []
  const value: ModuleSettings = {}

  for (const [key, def] of Object.entries(schema)) {
    if (def.type === 'list') {
      const raw = input[key] ?? def.default ?? []
      if (!Array.isArray(raw)) { errors.push({ path: key, message: 'must be a list' }); continue }
      value[key] = raw.map((item, i) => {
        const obj = isObject(item) ? item : {}
        if (!isObject(item)) errors.push({ path: `${key}[${i}]`, message: 'must be an object' })
        const out: Record<string, unknown> = {}
        for (const [field, sub] of Object.entries(def.item)) {
          const v = scalar(sub, obj[field], `${key}[${i}].${field}`, errors)
          if (v !== undefined) out[field] = v
        }
        return out
      })
    } else {
      const v = scalar(def, input[key], key, errors)
      if (v !== undefined) value[key] = v
    }
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, value }
}

function scalar(def: ScalarSettingDef, raw: unknown, path: string, errors: Array<{ path: string; message: string }>): unknown {
  const v = raw === undefined || raw === '' ? def.default : raw
  if (v === undefined) {
    if (def.required) errors.push({ path, message: 'required' })
    return undefined
  }
  const fail = (message: string) => { errors.push({ path, message }); return undefined }
  switch (def.type) {
    case 'string':
      if (typeof v !== 'string') return fail('must be a string')
      if (def.pattern && !new RegExp(def.pattern).test(v)) return fail(`must match ${def.pattern}`)
      return v
    case 'number':
      if (typeof v !== 'number' || !Number.isFinite(v)) return fail('must be a number')
      if (def.min !== undefined && v < def.min) return fail(`must be at least ${def.min}`)
      if (def.max !== undefined && v > def.max) return fail(`must be at most ${def.max}`)
      return v
    case 'boolean':
      return typeof v === 'boolean' ? v : fail('must be a boolean')
    case 'enum':
      return typeof v === 'string' && def.values.includes(v) ? v : fail(`must be one of ${def.values.join(', ')}`)
  }
}
