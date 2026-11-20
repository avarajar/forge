import { ModuleError, type ActionContext, type Confirmation, type ForgeContext } from '@forge-dev/sdk'
import { extractJson, type Solicitud } from './parse'
import { accountOf, modelOf, readNow, TOOL, type Reading } from './reader'

export const ANSWER_TOOL = TOOL('responder_solicitud')
// requests whose answer is plain text; the others carry decisions this form does not ask for
export const ANSWERABLE = ['pregunta', 'revision_pedida']
export const MAX_ANSWER = 4000

export interface AnswerInput { solicitud: number; respuesta: string }
export interface AnswerPlan { solicitud_id: number; respuesta_textual: string }

export const canAnswer = (s: Solicitud) => s.paraMi && ANSWERABLE.includes(s.tipo ?? '')

async function answerable(ctx: ForgeContext, id: number): Promise<Solicitud> {
  const reading = await ctx.storage.get<Reading>('reading')
  const s = reading?.solicitudes.find(x => x.id === id)
  if (!s) throw new ModuleError('not_found', `request ${id} is not in the last reading`)
  if (!s.paraMi) throw new ModuleError('bad_request', 'this request is not addressed to you; answer it on the ticket page')
  if (!ANSWERABLE.includes(s.tipo ?? '')) throw new ModuleError('bad_request', 'this kind of request needs a decision; answer it on the ticket page')
  return s
}

function text(input: AnswerInput): string {
  const t = typeof input.respuesta === 'string' ? input.respuesta.trim() : ''
  if (!t) throw new ModuleError('bad_request', 'write an answer')
  if (t.length > MAX_ANSWER) throw new ModuleError('bad_request', `the answer is longer than ${MAX_ANSWER} characters`)
  return t
}

export async function confirmAnswer(input: AnswerInput, ctx: ForgeContext): Promise<Confirmation> {
  const s = await answerable(ctx, input.solicitud)
  const respuesta = text(input)
  return {
    title: 'Responder en Monoku OS',
    body: 'Queda a tu nombre, marcada como escrita por tu agente.',
    items: [
      { label: `Solicitud #${s.id}${s.ticket ? ` · ticket #${s.ticket}` : ''}${s.autor ? ` · de ${s.autor}` : ''}`, detail: s.queSePide },
      { label: 'Tu respuesta', detail: respuesta },
    ],
    confirmLabel: 'Responder en Monoku OS',
    plan: { solicitud_id: s.id, respuesta_textual: respuesta } satisfies AnswerPlan,
  }
}

export function answerPrompt(plan: AnswerPlan): string {
  const args = { testigo: '', solicitud_id: plan.solicitud_id, respuesta_textual: plan.respuesta_textual }
  return [
    `Call ${ANSWER_TOOL} exactly once, with exactly these arguments (JSON), changing nothing:`,
    JSON.stringify(args),
    'Then print only the tool result as one JSON object and nothing else.',
    'If the tool is missing or fails, print only {"problem": "<what happened, one line>"}.',
  ].join('\n')
}

function planOf(confirmed: unknown, input: AnswerInput): AnswerPlan {
  const p = confirmed as Partial<AnswerPlan> | undefined
  if (!p || typeof p.solicitud_id !== 'number' || typeof p.respuesta_textual !== 'string' || p.solicitud_id !== input.solicitud) {
    throw new ModuleError('bad_request', 'answer without a confirmation')
  }
  return { solicitud_id: p.solicitud_id, respuesta_textual: p.respuesta_textual }
}

// writes what the person confirmed, once; a failed write is never retried, since it may have landed
export async function runAnswer(input: AnswerInput, ctx: ActionContext): Promise<{ answered: number; result: unknown }> {
  const plan = planOf(ctx.confirmed, input)
  await answerable(ctx, plan.solicitud_id)
  const out = await ctx.agent.run({ account: accountOf(ctx), model: modelOf(ctx), prompt: answerPrompt(plan), allowedTools: [ANSWER_TOOL], timeoutMs: 3 * 60_000 })
  let result: unknown
  try {
    result = extractJson(out.text)
  } catch {
    throw new ModuleError('upstream', `Monoku OS did not confirm the answer; check the ticket page before trying again: ${out.text.slice(0, 200)}`)
  }
  const r = result as { problem?: unknown; error?: unknown }
  if (typeof r.problem === 'string' || typeof r.error === 'string') {
    throw new ModuleError('upstream', `Monoku OS: ${String(r.problem ?? r.error).slice(0, 300)}`)
  }
  await readNow(ctx).catch(() => {})
  return { answered: plan.solicitud_id, result }
}
