import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { SandboxManager } from './sandbox-manager.js'
import type { SandboxInput } from './sandbox-types.js'

const TEST_DIR = join(import.meta.dirname, '../.test-sandbox')
const TEMPLATE_DIR = join(import.meta.dirname, '../sandbox-template')

const defaultInput: SandboxInput = { type: 'description', text: 'A landing page' }

describe('SandboxManager', () => {
  let manager: SandboxManager

  beforeAll(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true })
    }
    mkdirSync(TEST_DIR, { recursive: true })

    manager = new SandboxManager({
      templateDir: TEMPLATE_DIR,
      sandboxBaseDir: TEST_DIR,
      portRangeStart: 61000,
    })
  })

  afterAll(() => {
    manager.dispose()
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true })
    }
  })

  it('creates a sandbox directory from template', () => {
    const sandbox = manager.create({ name: 'test-proto', input: defaultInput })

    expect(sandbox.id).toBeDefined()
    expect(sandbox.id.length).toBe(8)
    expect(sandbox.state).toBe('creating')
    expect(existsSync(sandbox.dir)).toBe(true)
    expect(existsSync(join(sandbox.dir, 'package.json'))).toBe(true)
    expect(existsSync(join(sandbox.dir, 'src', 'App.tsx'))).toBe(true)
  })

  it('assigns unique ports', () => {
    const s1 = manager.create({ name: 'proto-a', input: defaultInput })
    const s2 = manager.create({ name: 'proto-b', input: defaultInput })

    expect(s1.port).not.toBe(s2.port)
  })

  it('lists sandboxes', () => {
    // Previous tests already created 3 sandboxes
    const list = manager.list()
    expect(list.length).toBeGreaterThanOrEqual(3)
  })

  it('gets a sandbox by id', () => {
    const created = manager.create({ name: 'find-me', input: defaultInput })
    const found = manager.get(created.id)

    expect(found).toBeDefined()
    expect(found!.name).toBe('find-me')
  })

  it('archives a sandbox', () => {
    const sandbox = manager.create({ name: 'to-archive', input: defaultInput })
    manager.archive(sandbox.id)

    const archived = manager.get(sandbox.id)
    expect(archived).toBeDefined()
    expect(archived!.state).toBe('archived')
  })

  it('deletes a sandbox and cleans up directory', () => {
    const sandbox = manager.create({ name: 'to-delete', input: defaultInput })
    const dir = sandbox.dir

    expect(existsSync(dir)).toBe(true)

    manager.remove(sandbox.id)

    expect(manager.get(sandbox.id)).toBeUndefined()
    expect(existsSync(dir)).toBe(false)
  })
})
