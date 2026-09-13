import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CWDoctor } from './cw-types.js'

export type DoctorResult = { available: true; doctor: CWDoctor } | { available: false; reason: string }

const CACHE_MS = 2000
const TIMEOUT_MS = 15000

export function envWithoutHarness(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined && key !== 'CW_HARNESS') out[key] = value
  }
  return out
}

function runDoctor(cwBin: string): Promise<DoctorResult> {
  return new Promise((resolve) => {
    execFile(cwBin, ['doctor', '--json'], { timeout: TIMEOUT_MS, env: envWithoutHarness(), maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      if (err) return resolve({ available: false, reason: err.message })
      let parsed: { schema?: unknown }
      try {
        parsed = JSON.parse(stdout) as { schema?: unknown }
      } catch {
        return resolve({ available: false, reason: 'cw doctor --json did not print JSON' })
      }
      if (parsed.schema !== 1) return resolve({ available: false, reason: `unsupported doctor schema ${String(parsed.schema)}` })
      resolve({ available: true, doctor: parsed as CWDoctor })
    })
  })
}

export function createDoctorClient(cwBin: string) {
  let inFlight: Promise<DoctorResult> | null = null
  let cached: { at: number; result: DoctorResult } | null = null

  return {
    get(fresh = false): Promise<DoctorResult> {
      if (inFlight) return inFlight
      if (!fresh && cached && Date.now() - cached.at < CACHE_MS) return Promise.resolve(cached.result)
      inFlight = runDoctor(cwBin).then((result) => {
        cached = { at: Date.now(), result }
        inFlight = null
        return result
      })
      return inFlight
    },
  }
}

export function readContextTokens(cwHome: string, env: NodeJS.ProcessEnv = process.env): { linear: boolean; notion: boolean } {
  const file = join(cwHome, 'tokens.env')
  const text = existsSync(file) ? readFileSync(file, 'utf-8') : ''
  const has = (name: string) =>
    Boolean(env[name]?.trim()) || new RegExp(`^\\s*(export\\s+)?${name}\\s*=\\s*\\S`, 'm').test(text)
  return { linear: has('LINEAR_API_KEY'), notion: has('NOTION_TOKEN') }
}
