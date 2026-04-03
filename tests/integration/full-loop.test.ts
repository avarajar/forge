import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createForgeServer } from '@forge-dev/core'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const TEST_DIR = join(import.meta.dirname, '../.test-integration')
const MODULES_DIR = join(TEST_DIR, 'modules')

describe('Forge Full Loop', () => {
  let server: ReturnType<typeof createForgeServer>

  beforeAll(() => {
    mkdirSync(MODULES_DIR, { recursive: true })

    // Create test module
    const modDir = join(MODULES_DIR, 'mod-test')
    mkdirSync(modDir, { recursive: true })
    writeFileSync(join(modDir, 'forge-module.json'), JSON.stringify({
      name: '@forge-dev/mod-test',
      version: '1.0.0',
      displayName: 'Test',
      description: 'Test module',
      icon: 'test',
      color: '#10b981',
      panels: [{ id: 'main', title: 'Test', component: './Main', default: true }],
      actions: [
        { id: 'echo', label: 'Echo', icon: 'megaphone', command: 'echo forge-works', streaming: false },
        { id: 'fail', label: 'Fail', icon: 'x', command: 'exit 42', streaming: false }
      ]
    }))

    server = createForgeServer({ dataDir: TEST_DIR })
  })

  afterAll(() => {
    server.close()
    rmSync(TEST_DIR, { recursive: true, force: true })
  })

  it('full workflow: register project -> discover module -> run action', async () => {
    // 1. Register a project
    let res = await server.fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'my-app', path: '/tmp' })
    })
    expect(res.status).toBe(201)
    const project = await res.json() as { id: string; name: string }

    // 2. Discover modules
    res = await server.fetch('/api/modules/available')
    expect(res.status).toBe(200)
    const modules = await res.json() as { displayName: string }[]
    expect(modules).toHaveLength(1)
    expect(modules[0].displayName).toBe('Test')

    // 3. Run successful action
    res = await server.fetch('/api/actions/mod-test/echo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: project.id })
    })
    expect(res.status).toBe(200)
    const result = await res.json() as { exitCode: number; output: string }
    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('forge-works')

    // 4. Run failing action
    res = await server.fetch('/api/actions/mod-test/fail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: project.id })
    })
    const failResult = await res.json() as { exitCode: number }
    expect(failResult.exitCode).toBe(42)
  })
})
