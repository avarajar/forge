import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ModuleLoader } from './modules.js'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const TEST_DIR = join(import.meta.dirname, '../.test-modules')

function createTestModule(name: string) {
  const dir = join(TEST_DIR, name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'forge-module.json'), JSON.stringify({
    name: `@forge-dev/${name}`,
    version: '1.0.0',
    displayName: 'Test Module',
    description: 'A test module',
    icon: 'zap',
    color: '#000',
    panels: [{ id: 'main', title: 'Main', component: './panels/Main', default: true }],
    actions: [
      { id: 'test-action', label: 'Test', icon: 'play', command: 'echo hello', streaming: false }
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
