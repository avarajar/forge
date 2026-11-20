import { describe, it, expect, beforeEach } from 'vitest'
import { readerPrompt, readNow, READER_TOOLS, stateOf, timing } from './reader'
import { answer, stub } from './stub.test-util'

beforeEach(() => { timing.retryMs = 0 })

const t42 = { id: 42, titulo: 'Login con Google', proyecto: 'acme/web' }
const s12 = { id: 12, ticket: 42, tipo_de_solicitud: 'pregunta', que_se_pide: '¿Sí?', destinatario_persona: { usuario: 'jose' } }

describe('readNow', () => {
  it('asks the account in settings with only the reader tools', async () => {
    const s = stub({ account: 'monoku', model: 'haiku' })
    await readNow(s.ctx)
    expect(s.run).toHaveBeenCalledWith(expect.objectContaining({ account: 'monoku', model: 'haiku', allowedTools: READER_TOOLS }))
    expect(READER_TOOLS).toEqual(['mcp__claude_ai_Monoku_OS__quien_soy', 'mcp__claude_ai_Monoku_OS__lo_que_me_toca', 'mcp__claude_ai_Monoku_OS__clientes', 'mcp__claude_ai_Monoku_OS__ticket'])
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

describe('followed tickets', () => {
  const ficha42 = { numero: 42, titulo: 'Login con Google', cliente: { id: 1, nombre: 'acme' }, proyecto: { id: 1, nombre: 'web' }, casilla: { valor: 'definicion', frase: 'definición' }, siguiente_paso: { valor: 'revisar_la_definicion', frase: 'revisar la definición' }, le_toca_a_nombre: 'Luis' }

  it('asks for the ficha of each followed ticket only when there are some', () => {
    expect(readerPrompt()).not.toContain('ticket once')
    const p = readerPrompt([42, 7])
    expect(p).toContain('mcp__claude_ai_Monoku_OS__ticket once for each of these ticket numbers that lo_que_me_toca did not return: 42, 7')
    expect(p).toContain('"seguidos"')
  })

  it('starts from the last reading, follows what was yours, and shows it in progress once it is not your turn', async () => {
    const s = stub()
    s.store.set('reading', { at: 'x', tickets: [{ numero: 42, titulo: 'Login con Google' }], solicitudes: [], dropped: 0 })
    s.run.mockResolvedValue(answer({}, null, [ficha42]))
    await readNow(s.ctx)
    expect(s.run.mock.calls[0][0].prompt).toContain('did not return: 42.')
    const r = (await stateOf(s.ctx)).reading
    expect(r?.tickets).toEqual([])
    expect(r?.enCurso).toEqual([expect.objectContaining({ numero: 42, casilla: 'definición', leTocaA: 'Luis', cliente: 'acme', proyecto: 'acme/web' })])
    expect(s.store.get('followed')).toEqual([42])
    expect(s.badge).not.toHaveBeenCalled()
  })

  it('adds tickets that become yours and drops closed ones', async () => {
    const s = stub()
    s.store.set('followed', [42, 9])
    s.run.mockResolvedValue(answer({ tickets: [{ id: 50, titulo: 'Nuevo' }] }, null, [{ ...ficha42, casilla: { valor: 'listo', frase: 'listo' } }]))
    await readNow(s.ctx)
    expect(s.store.get('followed')).toEqual([50, 9])
    expect((await stateOf(s.ctx)).reading?.enCurso).toEqual([])
  })

  it("follows a request's ticket and every ticket started here", async () => {
    const s = stub()
    s.store.set('followed', [])
    s.store.set('started/42', { project: 'p', sessionDir: 'd' })
    s.run.mockResolvedValue(answer({ solicitudes: [{ ...s12, ticket: 7 }] }))
    await readNow(s.ctx)
    expect(s.run.mock.calls[0][0].prompt).toContain('did not return: 42.')
    expect(s.store.get('followed')).toEqual([7, 42])
  })
})
