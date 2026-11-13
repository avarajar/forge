import { spawn } from 'node:child_process'

const MARK = '__FORGE_PATH__'

// An app opened from Finder gets launchd's PATH (/usr/bin:/bin:...), not the one the person's
// shell builds, so cw, claude, gh, kioku and lf would not be found. Ask the login shell for it.
export function loginShellPath(shell = process.env.SHELL || '/bin/zsh', timeoutMs = 5000): Promise<string | null> {
  return new Promise((resolve) => {
    let out = ''
    let done = false
    const finish = (value: string | null) => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve(value)
    }
    const child = spawn(shell, ['-ilc', `printf '${MARK}%s${MARK}' "$PATH"`], {
      stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, DISABLE_AUTO_UPDATE: 'true' }
    })
    const timer = setTimeout(() => { child.kill(); finish(null) }, timeoutMs)
    child.stdout.on('data', (chunk: Buffer) => { out += chunk.toString() })
    child.on('error', () => finish(null))
    child.on('close', () => {
      const match = out.match(new RegExp(`${MARK}(.*?)${MARK}`, 's'))
      finish(match?.[1] ? match[1] : null)
    })
  })
}

// The shell's entries first, then whatever the app already had, without repeats
export function mergePath(shellPath: string | null, current: string | undefined): string {
  const seen = new Set<string>()
  const parts = [...(shellPath ?? '').split(':'), ...(current ?? '').split(':')]
  return parts.filter((p) => p && !seen.has(p) && seen.add(p)).join(':')
}
