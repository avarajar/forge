import { signal } from '@preact/signals'

export interface TerminalMetrics {
  context: number | null
  tokens: number | null
  cost: number | null
}

export const terminalMetrics = signal<Record<string, TerminalMetrics>>({})

// only the tail matters: the status line is redrawn at the bottom
const TAIL = 4000
const tails = new Map<string, string>()

const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-_]/g

const lastMatch = (text: string, re: RegExp): RegExpExecArray | null => {
  let found: RegExpExecArray | null = null
  for (const m of text.matchAll(re)) found = m as RegExpExecArray
  return found
}

export const parseCount = (raw: string): number => {
  const n = parseFloat(raw)
  const unit = raw.slice(-1).toLowerCase()
  return unit === 'k' ? n * 1e3 : unit === 'm' ? n * 1e6 : n
}

// reads the Claude Code status line formats in use: "ctx:18%", "▓▓░░ 18%", "18.8k↑ 751.7k↓", "(18.8k/1000k)", "$184.96"
export function parseMetrics(text: string): Partial<TerminalMetrics> {
  const out: Partial<TerminalMetrics> = {}
  const ctx = lastMatch(text, /(?:ctx|context)[:\s]*(\d{1,3}(?:\.\d+)?)\s*%/gi)
    ?? lastMatch(text, /[▓█▒░]+\s*(\d{1,3}(?:\.\d+)?)\s*%/g)
  if (ctx) out.context = Math.min(100, parseFloat(ctx[1]))
  const updown = lastMatch(text, /(\d+(?:\.\d+)?[kKmM]?)\s*↑\s*(\d+(?:\.\d+)?[kKmM]?)\s*↓/g)
  const used = lastMatch(text, /\((\d+(?:\.\d+)?[kKmM])\s*\/\s*\d+(?:\.\d+)?[kKmM]\)/g)
  if (updown) out.tokens = parseCount(updown[1]) + parseCount(updown[2])
  else if (used) out.tokens = parseCount(used[1])
  const cost = lastMatch(text, /\$(\d+\.\d{2})\b/g)
  if (cost) out.cost = parseFloat(cost[1])
  return out
}

export function recordOutput(key: string, chunk: string): void {
  const tail = ((tails.get(key) ?? '') + chunk.replace(ANSI, '')).slice(-TAIL)
  tails.set(key, tail)
  const found = parseMetrics(tail)
  if (found.context === undefined && found.tokens === undefined && found.cost === undefined) return
  const prev = terminalMetrics.value[key] ?? { context: null, tokens: null, cost: null }
  const next = { ...prev, ...found }
  if (next.context === prev.context && next.tokens === prev.tokens && next.cost === prev.cost) return
  terminalMetrics.value = { ...terminalMetrics.value, [key]: next }
}

export function forgetOutput(key: string): void {
  tails.delete(key)
  if (!(key in terminalMetrics.value)) return
  const { [key]: _gone, ...rest } = terminalMetrics.value
  terminalMetrics.value = rest
}

export const formatTokens = (n: number): string =>
  n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n)

export const formatCost = (n: number): string => `$${n.toFixed(2)}`
