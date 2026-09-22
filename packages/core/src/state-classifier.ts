// What a terminal session is doing, read from the bottom of its output
export type SessionState = 'working' | 'waiting' | 'permission' | 'error' | 'exited' | 'idle'

export const SESSION_STATES: readonly SessionState[] = ['working', 'waiting', 'permission', 'error', 'exited', 'idle']

export interface ClassifyInput {
  // terminalText() of the tail, oldest first
  text: string
  // time since the last output chunk
  quietMs: number
  harness: string
  exitCode: number | null
}

export interface Classification {
  state: SessionState
  confidence: number
  source: string
}

export interface StateClassifier {
  name: string
  classify: (input: ClassifyInput) => Promise<Classification>
}

// Claude Code places every word with a cursor column move and redraws rows by moving the cursor
// between them, so stripping ANSI alone glues words and rows together
export function terminalText(raw: string): string {
  return raw
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[\d*[GC]/g, ' ')
    .replace(/\x1b\[[\d;]*[ABEFHfd]/g, '\n')
    .replace(/\x1b\[[0-9;?<>=]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[()][0-9A-Za-z]/g, '')
    .replace(/\x1b[@-_]/g, '')
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '')
}
