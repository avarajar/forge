import { spawn } from 'node:child_process'

export interface ExecOptions {
  cwd: string
  onData?: (data: string) => void
  signal?: AbortSignal
  timeout?: number
  env?: Record<string, string>
}

export interface ExecResult {
  exitCode: number
  output: string
  timedOut: boolean
}

export class ActionRunner {
  async exec(command: string, options: ExecOptions): Promise<ExecResult> {
    return new Promise((resolve) => {
      let output = ''
      let timedOut = false
      let timeoutId: ReturnType<typeof setTimeout> | undefined

      // its own process group, so a stop reaches what the shell started (dash forks instead of exec'ing)
      const proc = spawn('sh', ['-c', command], {
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true
      })
      const stop = () => {
        try {
          if (proc.pid) process.kill(-proc.pid, 'SIGTERM')
        } catch {
          proc.kill('SIGTERM')
        }
      }

      const handleData = (data: Buffer) => {
        const str = data.toString()
        output += str
        options.onData?.(str)
      }

      proc.stdout.on('data', handleData)
      proc.stderr.on('data', handleData)

      if (options.signal) {
        options.signal.addEventListener('abort', stop, { once: true })
      }

      if (options.timeout) {
        timeoutId = setTimeout(() => {
          timedOut = true
          stop()
        }, options.timeout)
      }

      proc.on('close', (code) => {
        if (timeoutId) clearTimeout(timeoutId)
        resolve({
          exitCode: code ?? 1,
          output,
          timedOut
        })
      })

      proc.on('error', () => {
        if (timeoutId) clearTimeout(timeoutId)
        resolve({ exitCode: 1, output, timedOut })
      })
    })
  }
}
