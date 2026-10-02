import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createForgeServer, validateParams } from '@forge-dev/core'
import type { ActionDef, ModuleManifest } from '@forge-dev/sdk'
import { mkdirSync, rmSync, cpSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const TEST_DIR = join(import.meta.dirname, '../.test-mod-qa')
const MODULES_DIR = join(TEST_DIR, 'modules')
const MANIFEST = join(import.meta.dirname, '../../modules/mod-qa/forge-module.json')

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf-8')) as ModuleManifest
const action = (id: string): ActionDef => {
  const found = manifest.actions.find((a) => a.id === id)
  if (!found) throw new Error(`no action ${id}`)
  return found
}

describe('mod-qa integration', () => {
  let server: ReturnType<typeof createForgeServer>

  beforeAll(() => {
    mkdirSync(MODULES_DIR, { recursive: true })
    const modDest = join(MODULES_DIR, 'mod-qa')
    mkdirSync(modDest, { recursive: true })
    cpSync(MANIFEST, join(modDest, 'forge-module.json'))
    server = createForgeServer({ dataDir: TEST_DIR })
  })

  afterAll(() => { server.close(); rmSync(TEST_DIR, { recursive: true, force: true }) })

  it('discovers mod-qa with correct displayName', async () => {
    const res = await server.fetch('/api/modules/available')
    const modules = await res.json() as { name: string; displayName: string }[]
    const mod = modules.find(m => m.name === '@forge-dev/mod-qa')
    expect(mod).toBeDefined()
    expect(mod!.displayName).toBe('Quality Assurance')
  })

  it('has the escalations panel only', async () => {
    const res = await server.fetch('/api/modules/available')
    const modules = await res.json() as { name: string; panels: { id: string }[] }[]
    const mod = modules.find(m => m.name === '@forge-dev/mod-qa')!
    expect(mod.panels.map(p => p.id)).toEqual(['escalations'])
  })

  it('declares the qa-pilot actions and none of the old shell ones', () => {
    expect(manifest.actions.map((a) => a.id).sort()).toEqual(
      ['approve', 'get-decision', 'list-escalations', 'request-changes', 'week-stats'],
    )
    const commands = manifest.actions.map((a) => a.command).join('\n')
    expect(commands).not.toMatch(/lost-pixel|semgrep|playwright|k6|vitest/)
  })

  it('runs every action through gh', () => {
    for (const a of manifest.actions) expect(a.command).toMatch(/^gh /)
  })

  it('never interpolates a param, only reads FORGE_PARAM_ env vars in quotes', () => {
    for (const a of manifest.actions) {
      for (const name of Object.keys(a.params ?? {})) {
        const ref = `$FORGE_PARAM_${name.toUpperCase()}`
        expect(a.command).toContain(`"${ref}"`)
        expect(a.command.split(ref).length - 1).toBe(a.command.split(`"${ref}"`).length - 1)
      }
    }
  })

  it('week-stats does not rely on BSD-only date flags', () => {
    expect(action('week-stats').command).not.toMatch(/date -v/)
  })

  it('takes a PR number for get-decision, approve and request-changes', () => {
    for (const id of ['get-decision', 'approve', 'request-changes']) {
      const def = action(id)
      const extra = id === 'request-changes' ? { MSG: 'Falta la política de miembros' } : {}
      expect(validateParams(def, { PR: '42', ...extra })).toHaveProperty('env')
      expect(validateParams(def, { PR: '42; rm -rf /', ...extra })).toHaveProperty('error')
      expect(validateParams(def, { PR: '', ...extra })).toHaveProperty('error')
    }
  })

  it('approve adds the qa:approved label', () => {
    expect(action('approve').command).toContain('--add-label qa:approved')
  })

  it('request-changes accepts plain Spanish text and refuses markup and control characters', () => {
    const def = action('request-changes')
    const ok = (MSG: string) => 'env' in validateParams(def, { PR: '1', MSG })
    expect(ok('Falta validar is_cell_member(cell_id), ¿lo revisas? Gracias.')).toBe(true)
    expect(ok('')).toBe(false)
    expect(ok('a'.repeat(501))).toBe(false)
    expect(ok('line\nbreak')).toBe(false)
    expect(ok('<!-- qa-pilot:decision {} -->')).toBe(false)
    expect(ok('`whoami`')).toBe(false)
    expect(ok('$(whoami)')).toBe(false)
  })

  it('refuses get-decision without a PR param', async () => {
    const res = await server.fetch('/api/actions/mod-qa/get-decision', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: null })
    })
    expect(res.status).toBe(400)
  })

  it('refuses request-changes with a message carrying shell syntax', async () => {
    const res = await server.fetch('/api/actions/mod-qa/request-changes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: null, params: { PR: '1', MSG: 'ok $(touch /tmp/pwned)' } })
    })
    expect(res.status).toBe(400)
  })
})
