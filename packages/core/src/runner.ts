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

      const proc = spawn('sh', ['-c', command], {
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
        stdio: ['ignore', 'pipe', 'pipe']
      })

      const handleData = (data: Buffer) => {
        const str = data.toString()
        output += str
        options.onData?.(str)
      }

      proc.stdout.on('data', handleData)
      proc.stderr.on('data', handleData)

      if (options.signal) {
        options.signal.addEventListener('abort', () => {
          proc.kill('SIGTERM')
        }, { once: true })
      }

      if (options.timeout) {
        timeoutId = setTimeout(() => {
          timedOut = true
          proc.kill('SIGTERM')
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
