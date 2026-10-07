import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ModuleLoader } from './modules.js'
import { createForgeServer } from './server.js'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const TEST_DIR = join(import.meta.dirname, '../.test-modules')
const BUNDLED_DIR = join(import.meta.dirname, '../.test-modules-bundled')
// los módulos del repo: lo que pack.mjs copia al paquete
const REPO_MODULES = join(import.meta.dirname, '../../../modules')

function createTestModule(name: string, root = TEST_DIR, command = 'echo hello', version = '1.0.0') {
  const dir = join(root, name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'forge-module.json'), JSON.stringify({
    name: `@forge-dev/${name}`,
    version,
    displayName: 'Test Module',
    description: 'A test module',
    icon: 'zap',
    color: '#000',
    panels: [{ id: 'main', title: 'Main', component: './panels/Main', default: true }],
    actions: [
      { id: 'test-action', label: 'Test', icon: 'play', command, streaming: false }
    ]
  }))
}

describe('ModuleLoader', () => {
  let loader: ModuleLoader

  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true })
    loader = new ModuleLoader(TEST_DIR)
  })

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true })
  })

  it('discovers modules from directory', () => {
    createTestModule('mod-test')
    const modules = loader.discover()
    expect(modules).toHaveLength(1)
    expect(modules[0].name).toBe('@forge-dev/mod-test')
  })

  it('returns empty array for empty directory', () => {
    const modules = loader.discover()
    expect(modules).toHaveLength(0)
  })

  it('loads a specific module manifest', () => {
    createTestModule('mod-test')
    const manifest = loader.load('mod-test')
    expect(manifest).toBeDefined()
    expect(manifest!.actions).toHaveLength(1)
    expect(manifest!.actions[0].command).toBe('echo hello')
  })

  it('returns undefined for non-existent module', () => {
    const manifest = loader.load('non-existent')
    expect(manifest).toBeUndefined()
  })

  it('gets action by module and action id', () => {
    createTestModule('mod-test')
    loader.discover()
    const action = loader.getAction('mod-test', 'test-action')
    expect(action).toBeDefined()
    expect(action!.command).toBe('echo hello')
  })
})

describe('ModuleLoader with bundled modules', () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true })
  })

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true })
    rmSync(BUNDLED_DIR, { recursive: true, force: true })
  })

  it('loads the bundled mod-qa with nothing installed', () => {
    const loader = new ModuleLoader(join(TEST_DIR, 'missing'), REPO_MODULES)
    const modules = loader.discover()
    expect(modules.map(m => m.name)).toEqual(['@forge-dev/mod-qa'])
    expect(loader.getAction('mod-qa', 'list-escalations')).toBeDefined()
  })

  it('reads only the bundled modules from the bundled folder', () => {
    createTestModule('mod-qa', BUNDLED_DIR)
    createTestModule('mod-other', BUNDLED_DIR)
    const loader = new ModuleLoader(TEST_DIR, BUNDLED_DIR)
    expect(loader.discover().map(m => m.name)).toEqual(['@forge-dev/mod-qa'])
  })

  it('prefers the bundled module over an installed one with the same folder', () => {
    createTestModule('mod-qa', BUNDLED_DIR, 'echo bundled', '9.0.0')
    createTestModule('mod-qa', TEST_DIR, 'echo installed')
    createTestModule('mod-test')
    const loader = new ModuleLoader(TEST_DIR, BUNDLED_DIR)
    const modules = loader.discover()
    expect(modules.map(m => `${m.name}@${m.version}`).sort()).toEqual(['@forge-dev/mod-qa@9.0.0', '@forge-dev/mod-test@1.0.0'])
    expect(loader.getAction('mod-qa', 'test-action')!.command).toBe('echo bundled')
  })

  it('falls back to the installed one when the bundled manifest is missing', () => {
    mkdirSync(BUNDLED_DIR, { recursive: true })
    createTestModule('mod-qa', TEST_DIR, 'echo installed')
    const loader = new ModuleLoader(TEST_DIR, BUNDLED_DIR)
    loader.discover()
    expect(loader.getAction('mod-qa', 'test-action')!.command).toBe('echo installed')
  })
})

describe('bundled module actions over HTTP', () => {
  const DATA_DIR = join(import.meta.dirname, '../.test-modules-server')
  let server: ReturnType<typeof createForgeServer> | undefined

  beforeEach(() => {
    mkdirSync(DATA_DIR, { recursive: true })
  })

  afterEach(() => {
    server?.close()
    server = undefined
    rmSync(DATA_DIR, { recursive: true, force: true })
    rmSync(BUNDLED_DIR, { recursive: true, force: true })
  })

  const post = (path: string, body: unknown) => server!.fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  it('answers mod-qa actions with an empty ~/.forge/modules', async () => {
    server = createForgeServer({ dataDir: DATA_DIR, port: 0, cwDir: join(DATA_DIR, 'cw'), bundledModulesDir: REPO_MODULES })
    // un PR inválido se rechaza al validar: la acción existe y no hace falta gh
    const res = await post('/api/actions/mod-qa/get-decision', { projectId: null, params: { PR: 'x' } })
    expect(res.status).toBe(400)
    expect((await res.json() as { error: string }).error).toMatch(/PR/)
  })

  it('answers 404 for mod-qa without the bundled folder', async () => {
    server = createForgeServer({ dataDir: DATA_DIR, port: 0, cwDir: join(DATA_DIR, 'cw') })
    const res = await post('/api/actions/mod-qa/get-decision', { projectId: null, params: { PR: '1' } })
    expect(res.status).toBe(404)
  })

  it('runs the bundled command when one is also installed', async () => {
    createTestModule('mod-qa', BUNDLED_DIR, 'echo bundled')
    createTestModule('mod-qa', join(DATA_DIR, 'modules'), 'echo installed')
    server = createForgeServer({ dataDir: DATA_DIR, port: 0, cwDir: join(DATA_DIR, 'cw'), bundledModulesDir: BUNDLED_DIR })
    const res = await post('/api/actions/mod-qa/test-action', { projectId: null })
    expect(res.status).toBe(200)
    expect((await res.json() as { output: string }).output.trim()).toBe('bundled')
  })
})
