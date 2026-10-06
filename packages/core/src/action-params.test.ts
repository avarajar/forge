import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ActionDef } from '@forge-dev/sdk'
import { validateParams } from './action-params.js'
import { createForgeServer } from './server.js'

const prAction: ActionDef = {
  id: 'get',
  label: 'Get',
  icon: 'search',
  command: 'echo "$FORGE_PARAM_PR"',
  params: { PR: { pattern: '\\d+' } },
}

describe('validateParams', () => {
  it('turns valid params into FORGE_PARAM_ env vars', () => {
    expect(validateParams(prAction, { PR: '42' })).toEqual({ env: { FORGE_PARAM_PR: '42' } })
  })

  it('upper-cases the env var name', () => {
    const def: ActionDef = { ...prAction, params: { prNumber: { pattern: '\\d+' } } }
    expect(validateParams(def, { prNumber: '7' })).toEqual({ env: { FORGE_PARAM_PRNUMBER: '7' } })
  })

  it('rejects a missing param', () => {
    const result = validateParams(prAction, {})
    expect(result).toEqual({ error: expect.stringContaining('PR') })
  })

  it('treats an absent params body as empty', () => {
    expect(validateParams(prAction, undefined)).toHaveProperty('error')
    expect(validateParams({ ...prAction, params: undefined }, undefined)).toEqual({ env: {} })
  })

  it('rejects a value that does not match the pattern', () => {
    expect(validateParams(prAction, { PR: 'abc' })).toEqual({ error: expect.stringContaining('PR') })
  })

  it('anchors the pattern to the whole value', () => {
    expect(validateParams(prAction, { PR: '42abc' })).toHaveProperty('error')
    expect(validateParams(prAction, { PR: 'x42' })).toHaveProperty('error')
  })

  it('anchors alternations too', () => {
    const def: ActionDef = { ...prAction, params: { MODE: { pattern: 'a|b' } } }
    expect(validateParams(def, { MODE: 'a' })).toHaveProperty('env')
    expect(validateParams(def, { MODE: 'ab' })).toHaveProperty('error')
  })

  it('rejects an injection-like value', () => {
    expect(validateParams(prAction, { PR: '1; rm -rf /' })).toHaveProperty('error')
  })

  it('rejects params the action does not declare', () => {
    const result = validateParams(prAction, { PR: '1', EXTRA: 'x' })
    expect(result).toEqual({ error: expect.stringContaining('EXTRA') })
  })

  it('rejects params on an action that declares none', () => {
    expect(validateParams({ ...prAction, params: undefined }, { PR: '1' })).toHaveProperty('error')
  })

  it('rejects non-string values', () => {
    expect(validateParams(prAction, { PR: 42 })).toHaveProperty('error')
    expect(validateParams(prAction, { PR: ['1'] })).toHaveProperty('error')
  })

  it('rejects a params body that is not an object', () => {
    expect(validateParams(prAction, '42')).toHaveProperty('error')
    expect(validateParams(prAction, ['42'])).toHaveProperty('error')
  })

  it('rejects a manifest param name that is not a valid env var name', () => {
    const def: ActionDef = { ...prAction, params: { 'P-R': { pattern: '\\d+' } } }
    expect(validateParams(def, { 'P-R': '1' })).toHaveProperty('error')
  })

  it('reports an invalid pattern in the manifest instead of throwing', () => {
    const def: ActionDef = { ...prAction, params: { PR: { pattern: '(' } } }
    expect(validateParams(def, { PR: '1' })).toHaveProperty('error')
  })
})

describe('action params over HTTP', () => {
  const TEST_DIR = join(import.meta.dirname, '../.test-action-params')
  let server: ReturnType<typeof createForgeServer>

  beforeAll(() => {
    const modDir = join(TEST_DIR, 'modules', 'mod-params')
    mkdirSync(modDir, { recursive: true })
    writeFileSync(join(modDir, 'forge-module.json'), JSON.stringify({
      name: '@forge-dev/mod-params',
      version: '0.0.0',
      displayName: 'Params',
      description: 'test',
      icon: 'x',
      color: '#000',
      panels: [],
      actions: [prAction, { id: 'plain', label: 'Plain', icon: 'x', command: 'echo plain' }, { id: 'where', label: 'Where', icon: 'x', command: 'pwd' }],
    }))
    // un proyecto de CW: la consola nombra proyectos de CW, no los de la base de Forge
    mkdirSync(join(TEST_DIR, 'cw'), { recursive: true })
    mkdirSync(join(TEST_DIR, 'app'), { recursive: true })
    writeFileSync(join(TEST_DIR, 'cw', 'projects.json'), JSON.stringify({ app: { path: join(TEST_DIR, 'app'), account: 'default' } }))
    server = createForgeServer({ dataDir: TEST_DIR, port: 0, cwDir: join(TEST_DIR, 'cw') })
  })

  afterAll(() => {
    server.close()
    rmSync(TEST_DIR, { recursive: true, force: true })
  })

  const post = (path: string, body: unknown) => server.fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  it('passes a valid param to the command as an env var', async () => {
    const res = await post('/api/actions/mod-params/get', { projectId: null, params: { PR: '42' } })
    expect(res.status).toBe(200)
    const body = await res.json() as { exitCode: number; output: string }
    expect(body.exitCode).toBe(0)
    expect(body.output.trim()).toBe('42')
  })

  it('answers 400 with a message for an injection-like value', async () => {
    const res = await post('/api/actions/mod-params/get', { projectId: null, params: { PR: '1; echo pwned' } })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toMatch(/PR/)
  })

  it('answers 400 for a missing param', async () => {
    const res = await post('/api/actions/mod-params/get', { projectId: null })
    expect(res.status).toBe(400)
  })

  it('answers 400 on the stream endpoint too', async () => {
    const res = await post('/api/actions/mod-params/get/stream', { projectId: null, params: { PR: 'x' } })
    expect(res.status).toBe(400)
  })

  it('streams a valid param as an env var', async () => {
    const res = await post('/api/actions/mod-params/get/stream', { projectId: null, params: { PR: '7' } })
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('"chunk":"7\\n"')
  })

  it('keeps actions without params working', async () => {
    const res = await post('/api/actions/mod-params/plain', { projectId: null })
    expect(res.status).toBe(200)
    const body = await res.json() as { output: string }
    expect(body.output.trim()).toBe('plain')
  })

  it('runs in the folder of a CW project when the console names one', async () => {
    const res = await post('/api/actions/mod-params/where', { projectId: null, cwProject: 'app' })
    expect(res.status).toBe(200)
    const body = await res.json() as { output: string }
    expect(realpathSync(body.output.trim())).toBe(realpathSync(join(TEST_DIR, 'app')))
  })

  it('answers 400 for a CW project that does not exist', async () => {
    const res = await post('/api/actions/mod-params/where', { projectId: null, cwProject: 'nope' })
    expect(res.status).toBe(400)
    expect((await res.json() as { error: string }).error).toMatch(/nope/)
  })

  it('does not leak a FORGE_PARAM_ from one call into another', async () => {
    await post('/api/actions/mod-params/get', { projectId: null, params: { PR: '42' } })
    const res = await post('/api/actions/mod-params/plain', { projectId: null })
    expect(res.status).toBe(200)
    expect(process.env.FORGE_PARAM_PR).toBeUndefined()
  })
})
