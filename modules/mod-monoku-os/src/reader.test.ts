import { describe, it, expect, beforeEach } from 'vitest'
import { readNow, READER_TOOLS, stateOf, timing } from './reader'
import { answer, stub } from './stub.test-util'

beforeEach(() => { timing.retryMs = 0 })

const t42 = { id: 42, titulo: 'Login con Google', proyecto: 'acme/web' }
const s12 = { id: 12, ticket: 42, tipo_de_solicitud: 'pregunta', que_se_pide: '¿Sí?', destinatario_persona: { usuario: 'jose' } }

describe('readNow', () => {
  it('asks the account in settings with only the reader tools', async () => {
    const s = stub({ account: 'monoku', model: 'haiku' })
    await readNow(s.ctx)
    expect(s.run).toHaveBeenCalledWith(expect.objectContaining({ account: 'monoku', model: 'haiku', allowedTools: READER_TOOLS }))
    expect(READER_TOOLS).toEqual(['mcp__claude_ai_Monoku_OS__quien_soy', 'mcp__claude_ai_Monoku_OS__lo_que_me_toca', 'mcp__claude_ai_Monoku_OS__clientes'])
  })

  it('stores the reading and clears a previous error', async () => {
    const s = stub()
    s.store.set('lastError', { at: 'x', message: 'old' })
    s.run.mockResolvedValue(answer({ tickets: [t42], solicitudes: [s12] }))
    await readNow(s.ctx)
    const state = await stateOf(s.ctx)
    expect(state.lastError).toBeNull()
    expect(state.reading).toMatchObject({ tickets: [{ numero: 42 }], solicitudes: [{ id: 12, paraMi: true }] })
    expect(s.store.get('lastAttemptAt')).toEqual(expect.any(String))
  })

  it('joins a reading already running', async () => {
    const s = stub()
    let release = () => {}
    s.run.mockImplementation(async () => { await new Promise<void>(r => { release = r }); return answer({}) })
    const a = readNow(s.ctx)
    const b = readNow(s.ctx)
    expect((await stateOf(s.ctx)).inFlight).toBe(true)
    await new Promise(r => setTimeout(r, 0))
    release()
    expect(await a).toBe(await b)
    expect(s.run).toHaveBeenCalledTimes(1)
    expect((await stateOf(s.ctx)).inFlight).toBe(false)
  })

  it('retries once on a problem, then records it and keeps the last good reading', async () => {
    const s = stub()
    s.run.mockResolvedValue(answer({ tickets: [t42] }))
    await readNow(s.ctx)
    s.run.mockResolvedValue({ text: '{"problem":"tools not available"}' })
    await expect(readNow(s.ctx)).rejects.toThrow(/tools not available/)
    expect(s.run).toHaveBeenCalledTimes(3)
    const state = await stateOf(s.ctx)
    expect(state.reading?.tickets[0].numero).toBe(42)
    expect(state.lastError?.message).toMatch(/tools not available/)
  })

  it('records an answer that is not JSON', async () => {
    const s = stub()
    s.run.mockResolvedValue({ text: 'Lo siento, no puedo' })
    await expect(readNow(s.ctx)).rejects.toThrow()
    expect((await stateOf(s.ctx)).lastError?.message).toMatch(/JSON/)
  })

  it('badges the count and alerts only for new items', async () => {
    const s = stub()
    s.run.mockResolvedValue(answer({ tickets: [t42] }))
    await readNow(s.ctx)
    expect(s.badge).toHaveBeenLastCalledWith('pending', 1, 'pendientes')
    expect(s.attention).toHaveBeenLastCalledWith({ key: 'new', title: 'Monoku OS: un pendiente nuevo', body: '#42 Login con Google', version: 't42' })

    s.attention.mockClear()
    await readNow(s.ctx)
    expect(s.attention).not.toHaveBeenCalled()

    s.run.mockResolvedValue(answer({ tickets: [t42], solicitudes: [s12] }))
    await readNow(s.ctx)
    expect(s.badge).toHaveBeenLastCalledWith('pending', 2, 'pendientes')
    expect(s.attention).toHaveBeenCalledWith(expect.objectContaining({ version: 's12' }))

    s.run.mockResolvedValue(answer({}))
    await readNow(s.ctx)
    expect(s.clear).toHaveBeenCalledWith('pending')
  })
})
