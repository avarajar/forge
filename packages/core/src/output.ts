const ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g

export const stripAnsi = (text: string): string => text.replace(ANSI_RE, '')

// the last non-empty lines of a command's output, without terminal escapes
export function tailOutput(text: string, max = 20): string {
  return stripAnsi(text).split('\n').map(line => line.trimEnd()).filter(line => line.length > 0).slice(-max).join('\n')
}
