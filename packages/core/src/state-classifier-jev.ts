import type { Classification, ClassifyInput, SessionState, StateClassifier } from './state-classifier.js'

export const JEV_URL = 'https://api.typesafe.ai/v1/systemone'

const SCREEN_LINES = 30
const SCREEN_CHARS = 4000

type AskedState = Exclude<SessionState, 'exited'>

// Jev reads criteria literally, so each option names what is on screen, not what it means for Forge
const CRITERIA: Record<AskedState, string> = {
  working: 'The agent is still busy: a spinner, a progress line or a running tool is the newest thing above the prompt. Status bars and notices below the prompt are not progress.',
  waiting: 'The agent finished its turn or was interrupted and is waiting at an empty prompt for the next message.',
  permission: 'The agent shows a question with options the user must pick, such as approving a command or edit, trusting a folder, or answering yes or no.',
  error: 'The agent stopped on an error: an API error, a usage or rate limit, a failed login or a crash.',
  idle: 'Nothing on screen shows which of the other options applies.',
}

// Claude Code's footer notices, redrawn for hours under an idle prompt; Jev took them for progress
const FOOTER_NOISE = /Checking for updates|new task\? \/clear to save [\d.]+k? tokens/g

// only the bottom of the screen matters, and Jev loses accuracy on unrelated text
export function jevScreen(text: string, lines = SCREEN_LINES): string {
  const kept = text.split('\n')
    .map(l => l.replace(FOOTER_NOISE, '').trim())
    .filter(Boolean)
    .filter((l, i, all) => l !== all[i - 1])
    .slice(-lines).join('\n')
  return kept.slice(-SCREEN_CHARS)
}

export interface JevOptions {
  apiKey: string
  model?: string
  timeoutMs?: number
  fetch?: (url: string, init: RequestInit & { headers: Record<string, string> }) => Promise<Response>
}

interface ChoiceAnswer { type: 'choice'; choice: string; confidence: number }

export function createJevClassifier({ apiKey, model = 'jev-latest', timeoutMs = 3000, fetch = globalThis.fetch }: JevOptions): StateClassifier {
  return {
    name: 'jev',
    async classify(input: ClassifyInput): Promise<Classification> {
      if (input.exitCode !== null) return { state: 'exited', confidence: 1, source: 'jev' }
      const body = {
        model,
        state: { harness: input.harness, seconds_since_last_output: Math.round(input.quietMs / 1000), screen: jevScreen(input.screen ?? input.text) },
        questions: {
          state: {
            type: 'choice',
            instructions: 'What is the coding agent in `screen` doing right now? `screen` is the bottom of its terminal with the newest line last; older lines can be leftovers of a redraw.',
            criteria: CRITERIA,
          },
        },
      }
      const res = await fetch(JEV_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!res.ok) throw new Error(`Jev answered ${res.status}`)
      const data = await res.json() as { answers?: { state?: ChoiceAnswer } }
      const answer = data.answers?.state
      if (!answer || !(answer.choice in CRITERIA) || typeof answer.confidence !== 'number') {
        throw new Error(`Unexpected Jev answer: ${JSON.stringify(answer)}`)
      }
      return { state: answer.choice as AskedState, confidence: answer.confidence, source: 'jev' }
    },
  }
}
