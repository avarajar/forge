import { describe, it, expect, beforeEach } from 'vitest'
import type { ActionContext } from '@forge-dev/sdk'
import { ANSWER_TOOL, answerPrompt, confirmAnswer, runAnswer } from './answer'
import { timing } from './reader'
import { answer, stub } from './stub.test-util'

beforeEach(() => { timing.retryMs = 0 })

const mine = { id: 12, ticket: 57, tipo: 'pregunta', queSePide: '¿El CSV incluye los borrados?', autor: 'Ana', paraMi: true, bloquea: true }
const carried = { ...mine, id: 13, paraMi: false }
const decision = { ...mine, id: 14, tipo: 'desacuerdo' }

function withReading() {
  const s = stub()
  s.store.set('reading', { at: 'x', tickets: [], solicitudes: [mine, carried, decision], dropped: 0 })
  return s
}

const actx = (s: ReturnType<typeof stub>, confirmed?: unknown) => ({ ...s.ctx, confirmed, output: () => {}, signal: new AbortController().signal }) as unknown as ActionContext

describe('confirmAnswer', () => {
  it('shows the request and the exact text, and plans those arguments', async () => {
    const c = await confirmAnswer({ solicitud: 12, respuesta: '  No, solo los activos. ' }, withReading().ctx)
    expect(c.confirmLabel).toBe('Responder en Monoku OS')
    expect(c.items).toEqual([
      { label: 'Solicitud #12 · ticket #57 · de Ana', detail: '¿El CSV incluye los borrados?' },
      { label: 'Tu respuesta', detail: 'No, solo los activos.' },
    ])
    expect(c.plan).toEqual({ solicitud_id: 12, respuesta_textual: 'No, solo los activos.' })
  })

  it('refuses unknown, carried, decision and empty answers', async () => {
    const ctx = withReading().ctx
    await expect(confirmAnswer({ solicitud: 99, respuesta: 'x' }, ctx)).rejects.toMatchObject({ code: 'not_found' })
    await expect(confirmAnswer({ solicitud: 13, respuesta: 'x' }, ctx)).rejects.toThrow(/not addressed to you/)
    await expect(confirmAnswer({ solicitud: 14, respuesta: 'x' }, ctx)).rejects.toThrow(/needs a decision/)
    await expect(confirmAnswer({ solicitud: 12, respuesta: '   ' }, ctx)).rejects.toThrow(/write an answer/)
  })
})

describe('runAnswer', () => {
  it('writes the confirmed plan with only responder_solicitud, then reads again', async () => {
    const s = withReading()
    s.run.mockResolvedValueOnce({ text: '{"ok":true}' }).mockResolvedValue(answer({}))
    const plan = { solicitud_id: 12, respuesta_textual: 'No.' }
    expect(await runAnswer({ solicitud: 12, respuesta: 'otra cosa' }, actx(s, plan))).toEqual({ answered: 12, result: { ok: true } })
    expect(s.run.mock.calls[0][0]).toMatchObject({ allowedTools: [ANSWER_TOOL], prompt: answerPrompt(plan) })
    expect(answerPrompt(plan)).toContain('{"testigo":"","solicitud_id":12,"respuesta_textual":"No."}')
    expect(s.run).toHaveBeenCalledTimes(2)
  })

  it('refuses without a matching confirmation', async () => {
    const s = withReading()
    await expect(runAnswer({ solicitud: 12, respuesta: 'x' }, actx(s))).rejects.toThrow(/without a confirmation/)
    await expect(runAnswer({ solicitud: 12, respuesta: 'x' }, actx(s, { solicitud_id: 13, respuesta_textual: 'x' }))).rejects.toThrow(/without a confirmation/)
    expect(s.run).not.toHaveBeenCalled()
  })

  it('reports a tool problem and does not retry', async () => {
    const s = withReading()
    s.run.mockResolvedValue({ text: '{"problem":"la solicitud ya tiene respuesta"}' })
    await expect(runAnswer({ solicitud: 12, respuesta: 'x' }, actx(s, { solicitud_id: 12, respuesta_textual: 'x' }))).rejects.toThrow(/ya tiene respuesta/)
    expect(s.run).toHaveBeenCalledTimes(1)
  })
})
