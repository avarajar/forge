import { describe, it, expect, vi } from 'vitest'
import { createJevClassifier, jevScreen } from './state-classifier-jev.js'

const input = { text: 'line one\n\n  ✻ Brewed for 3s\n❯ ', quietMs: 4000, harness: 'claude', exitCode: null }

const answer = (choice: string, confidence: number) => new Response(JSON.stringify({
  model: 'jev-1.13.0',
  answers: { state: { type: 'choice', choice, probabilities: { [choice]: confidence }, confidence } },
  usage: { input_tokens: 300, output_tokens: 20 },
}), { status: 200, headers: { 'content-type': 'application/json' } })

describe('jevScreen', () => {
  it('keeps the last non-empty lines, trimmed, newest last', () => {
    expect(jevScreen('a\n\n b \nc', 2)).toBe('b\nc')
  })

  it('caps the screen length from the end', () => {
    expect(jevScreen('x'.repeat(10_000)).length).toBe(4000)
  })
})

describe('createJevClassifier', () => {
  it('asks one Choice over the session states with the key as a bearer token', async () => {
    const fetch = vi.fn().mockResolvedValue(answer('waiting', 0.91))
    const jev = createJevClassifier({ apiKey: 'ts-key', fetch })
    const result = await jev.classify(input)

    expect(result).toEqual({ state: 'waiting', confidence: 0.91, source: 'jev' })
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('https://api.typesafe.ai/v1/systemone')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer ts-key')
    const body = JSON.parse(init.body)
    expect(body.model).toBe('jev-latest')
    expect(body.state).toEqual({ harness: 'claude', seconds_since_last_output: 4, screen: 'line one\n✻ Brewed for 3s\n❯' })
    expect(body.questions.state.type).toBe('choice')
    expect(Object.keys(body.questions.state.criteria).sort()).toEqual(['error', 'idle', 'permission', 'waiting', 'working'])
  })

  it('sends the configured model', async () => {
    const fetch = vi.fn().mockResolvedValue(answer('working', 0.7))
    await createJevClassifier({ apiKey: 'k', model: 'jev-1.13.0', fetch }).classify(input)
    expect(JSON.parse(fetch.mock.calls[0][1].body).model).toBe('jev-1.13.0')
  })

  it('rejects on an HTTP error, so the caller keeps the local answer', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"detail":"bad key"}', { status: 401 }))
    await expect(createJevClassifier({ apiKey: 'k', fetch }).classify(input)).rejects.toThrow(/401/)
  })

  it('rejects an answer outside the states it asked about', async () => {
    const fetch = vi.fn().mockResolvedValue(answer('exited', 0.99))
    await expect(createJevClassifier({ apiKey: 'k', fetch }).classify(input)).rejects.toThrow(/unexpected/i)
  })

  it('gives up after its timeout', async () => {
    const fetch = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new Error('aborted')))
    }))
    await expect(createJevClassifier({ apiKey: 'k', fetch, timeoutMs: 20 }).classify(input)).rejects.toThrow()
  })

  it('never asks about an exited terminal', async () => {
    const fetch = vi.fn()
    const result = await createJevClassifier({ apiKey: 'k', fetch }).classify({ ...input, exitCode: 1 })
    expect(result.state).toBe('exited')
    expect(fetch).not.toHaveBeenCalled()
  })
})
