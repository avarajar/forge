import { spawn } from 'node:child_process'
import { envWithoutHarness } from './cw-doctor.js'

const TIMEOUT_MS = 60000

// Pipes, not a PTY: a PTY would echo the key into its output
export function importApiKey(
  cwBin: string, account: string, harness: string, apiKey: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    const redact = (text: string) => text.split(apiKey).join('***').trim()
    const child = spawn(cwBin, ['account', 'login', account, '--harness', harness, '--with-api-key', '-'], {
      env: envWithoutHarness(),
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let output = ''
    const collect = (chunk: Buffer) => { output += chunk.toString() }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    child.stdin.on('error', () => {})
    const timer = setTimeout(() => child.kill(), TIMEOUT_MS)
    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({ ok: false, error: redact(err.message) })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve(code === 0 ? { ok: true } : { ok: false, error: redact(output) || `cw exited with ${String(code)}` })
    })
    child.stdin.end(`${apiKey}\n`)
  })
}
