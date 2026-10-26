import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  SDK_VERSION, defineModule, defineAction, defineRoute, defineJob, defineDetector, definePanel, onEvent, shell,
  ModuleError, PermissionError, ModuleRequestError,
} from './index.js'

describe('define helpers', () => {
  it('return their input', () => {
    const action = defineAction({ id: 'a', label: 'A', effect: 'read', run: async () => 1 })
    const route = defineRoute({ method: 'GET', path: '/x', handler: () => ({}) })
    const job = defineJob({ id: 'j', every: '2m', run: async () => {} })
    const detector = defineDetector({ tool: 't', files: ['x'], suggestion: 's' })
    const mod = { actions: [action], routes: [route], jobs: [job], detectors: [detector] }
    const panel = { id: 'p', title: 'P', component: () => null }
    expect(defineModule(mod)).toBe(mod)
    expect(defineAction(action)).toBe(action)
    expect(defineRoute(route)).toBe(route)
    expect(defineJob(job)).toBe(job)
    expect(defineDetector(detector)).toBe(detector)
    expect(definePanel(panel)).toBe(panel)
  })

  it('onEvent pairs the event with its handler', () => {
    const handler = () => {}
    expect(onEvent('session.started', handler)).toEqual({ event: 'session.started', handler })
  })

  it('shell builds an args-array executor', () => {
    expect(shell('harvey', ['status'])).toEqual({ kind: 'shell', command: 'harvey', args: ['status'] })
  })
})

describe('errors', () => {
  it('ModuleError carries its code', () => {
    const err = new ModuleError('unreachable', 'x')
    expect(err).toBeInstanceOf(Error)
    expect(err.code).toBe('unreachable')
    expect(err.name).toBe('ModuleError')
  })

  it('PermissionError names the permission and value', () => {
    const err = new PermissionError('network', 'http://evil:1')
    expect(err.permission).toBe('network')
    expect(err.value).toBe('http://evil:1')
    expect(err.message).toContain('network')
  })

  it('ModuleRequestError carries the server code', () => {
    expect(new ModuleRequestError('module_removed', 'gone').code).toBe('module_removed')
  })
})

describe('version and schema', () => {
  it('SDK_VERSION is 1.0.0', () => {
    expect(SDK_VERSION).toBe('1.0.0')
  })

  it('schema requires the v1 identity fields', () => {
    const schema = JSON.parse(readFileSync(join(import.meta.dirname, '../forge-module.schema.json'), 'utf-8'))
    expect(schema.required).toEqual(expect.arrayContaining(['id', 'name', 'version', 'sdk', 'displayName']))
  })
})
