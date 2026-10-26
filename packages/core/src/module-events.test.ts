import { describe, it, expect, vi, afterEach } from 'vitest'
import type { ForgeContext } from '@forge-dev/sdk'
import { onEvent } from '@forge-dev/sdk'
import { ModuleEvents } from './module-events.js'

const ctx = { module: { id: 'm', version: '1' } } as unknown as ForgeContext
const flush = () => new Promise(r => setTimeout(r, 0))
const started = { project: 'saludbot', sessionDir: 'task-x', type: 'task', account: 'monoku', harness: 'codex', provider: 'openai', model: 'gpt-5' }

describe('ModuleEvents', () => {
  afterEach(() => vi.useRealTimers())

  it('handlers get harness, provider and model in session.started', async () => {
    const events = new ModuleEvents({ onError: () => {} })
    const handler = vi.fn()
    events.subscribe('m', onEvent('session.started', handler), ctx)
    events.emit('session.started', started)
    await flush()
    expect(handler).toHaveBeenCalledWith(started, ctx)
  })

  it('runs after emit returns', () => {
    const events = new ModuleEvents({ onError: () => {} })
    const handler = vi.fn()
    events.subscribe('m', onEvent('project.registered', handler), ctx)
    events.emit('project.registered', { project: 'p', path: '/p' })
    expect(handler).not.toHaveBeenCalled()
  })

  it('a throwing handler does not reach the emitter', async () => {
    const onError = vi.fn()
    const events = new ModuleEvents({ onError })
    const after = vi.fn()
    events.subscribe('m', onEvent('session.ended', () => { throw new Error('nope') }), ctx)
    events.subscribe('n', onEvent('session.ended', after), ctx)
    expect(() => events.emit('session.ended', started)).not.toThrow()
    await flush()
    expect(onError).toHaveBeenCalledWith('m', 'session.ended: nope')
    expect(after).toHaveBeenCalled()
  })

  it('a handler that hangs is cut off after 10 s', async () => {
    vi.useFakeTimers()
    const onError = vi.fn()
    const events = new ModuleEvents({ onError })
    events.subscribe('m', onEvent('session.ended', () => new Promise(() => {})), ctx)
    events.emit('session.ended', started)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(onError).toHaveBeenCalledWith('m', 'session.ended: timed out after 10s')
  })

  it('unsubscribeModule drops only that module', async () => {
    const events = new ModuleEvents({ onError: () => {} })
    const a = vi.fn()
    const b = vi.fn()
    events.subscribe('a', onEvent('task.done', a), ctx)
    events.subscribe('b', onEvent('task.done', b), ctx)
    events.unsubscribeModule('a')
    events.emit('task.done', { ...started, command: 'work' })
    await flush()
    expect(a).not.toHaveBeenCalled()
    expect(b).toHaveBeenCalled()
  })

  it('emitTo reaches only the owner', async () => {
    const events = new ModuleEvents({ onError: () => {} })
    const a = vi.fn()
    const b = vi.fn()
    events.subscribe('a', onEvent('module.settings.changed', a), ctx)
    events.subscribe('b', onEvent('module.settings.changed', b), ctx)
    events.emitTo('a', 'module.settings.changed', { moduleId: 'a' })
    await flush()
    expect(a).toHaveBeenCalledWith({ moduleId: 'a' }, ctx)
    expect(b).not.toHaveBeenCalled()
  })
})
