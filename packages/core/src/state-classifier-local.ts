import type { Classification, ClassifyInput, SessionState } from './state-classifier.js'

// output this recent means the agent is still drawing
export const ACTIVE_MS = 1500

interface Marker { state: SessionState; confidence: number; re: RegExp }

// The screen is redrawn, not cleared, so an old dialog stays in the tail after it is answered.
// Whichever marker appears last wins. Texts come from Claude Code 2.1 captures in __fixtures__/terminal/claude.
// Spinner verbs can carry accents (Sautéed, Flambéing), so letters are matched as Unicode.
const CLAUDE_MARKERS: Marker[] = [
  { state: 'permission', confidence: 0.95, re: /Do you want to [^?\n]{1,80}\?[\s\S]{0,40}❯ ?1\. Yes/g },
  { state: 'permission', confidence: 0.95, re: /Esc to cancel · Tab to amend|Enter to confirm · Esc to cancel/g },
  { state: 'waiting', confidence: 0.9, re: /(?:^|[^(\p{L}\d_])\p{Lu}\p{Ll}+ed for (?:\d+[hm] )*\d+s\b/gmu },
  // a redraw can reuse the digits of the spinner above, leaving "Baked for  done 10:12 am"
  { state: 'waiting', confidence: 0.9, re: /\p{Lu}\p{Ll}+ed for [^\n…]{0,20}?\bdone \d{1,2}:\d{2}/gu },
  { state: 'waiting', confidence: 0.9, re: /Interrupted · What should Claude do instead\?/g },
  { state: 'waiting', confidence: 0.8, re: /Claude Code v\d+\.\d+/g },
  { state: 'error', confidence: 0.85, re: /API Error|usage limit reached|You've hit your (?:usage )?limit|Credit balance is too low|Please run \/login|OAuth token (?:has )?expired/gi },
  // a spinner that stopped moving: a stall or a slow redraw, so it is only a guess
  { state: 'working', confidence: 0.5, re: /\p{Lu}\p{Ll}+ing…|\(\d+s · |esc to interrupt/gu },
]

const lastIndex = (text: string, re: RegExp): number => {
  let at = -1
  for (const m of text.matchAll(re)) at = (m.index ?? 0) + m[0].length
  return at
}

function latestMarker(text: string, markers: Marker[]): Marker | null {
  let best: Marker | null = null
  let bestAt = -1
  for (const marker of markers) {
    const at = lastIndex(text, marker.re)
    if (at > bestAt) { best = marker; bestAt = at }
  }
  return best
}

const result = (state: SessionState, confidence: number): Classification => ({ state, confidence, source: 'local' })

export function classifyLocal(input: ClassifyInput): Classification {
  if (input.exitCode !== null) return result('exited', 1)
  if (input.quietMs < ACTIVE_MS) return result('working', input.harness === 'claude' ? 0.95 : 0.6)
  if (input.harness !== 'claude') return result('idle', 0.5)
  const marker = latestMarker(input.text, CLAUDE_MARKERS)
  return marker ? result(marker.state, marker.confidence) : result('idle', 0.3)
}
