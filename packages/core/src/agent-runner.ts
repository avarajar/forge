import { spawn as nodeSpawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ModuleError } from '@forge-dev/sdk'
import type { AgentRunInput, AgentRunResult } from '@forge-dev/sdk'
import { ACCOUNT_NAME_RE } from './cw-types.js'
import { envWithoutHarness } from './cw-doctor.js'

const DEFAULT_TIMEOUT_MS = 180_000

// headless runs wait for claude.ai connectors to connect instead of starting without them
const CONNECTOR_ENV = { MCP_CONNECTION_NONBLOCKING: 'false', MCP_TIMEOUT: '60000' }

// runs one headless `claude -p` under a CW account's config folder
export function runAgent(input: AgentRunInput, o: { cwHome: string; spawn?: typeof nodeSpawn }): Promise<AgentRunResult> {
  if (!ACCOUNT_NAME_RE.test(input.account)) return Promise.reject(new ModuleError('bad_request', 'Invalid account'))
  const configDir = join(o.cwHome, 'accounts', input.account)
  if (!existsSync(configDir)) return Promise.reject(new ModuleError('not_found', `Unknown account ${input.account}`))

  const bad = input.allowedTools.find(tool => !tool.startsWith('mcp__'))
  if (bad !== undefined) return Promise.reject(new ModuleError('bad_request', `allowedTools only takes MCP tools, not ${bad}`))

  const args = ['-p']
  if (input.model) args.push('--model', input.model)
  // no built-in tools at all: the allowlist only pre-approves, it does not take the others away
  args.push('--tools', '')
  args.push('--allowedTools', input.allowedTools.join(','), '--output-format', 'json')
  const spawn = o.spawn ?? nodeSpawn
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS

  // an empty folder of its own, so no project files or settings are within reach
  const cwd = mkdtempSync(join(tmpdir(), 'forge-agent-'))
  const cleanup = () => rmSync(cwd, { recursive: true, force: true })

  return new Promise<AgentRunResult>((resolve, reject) => {
    const child = spawn('claude', args, { cwd, env: { ...envWithoutHarness(), CLAUDE_CONFIG_DIR: configDir, ...CONNECTOR_ENV }, stdio: ['pipe', 'pipe', 'pipe'] })
    // the prompt goes over stdin so one that starts with a dash is never read as a flag
    child.stdin?.on('error', () => {})
    child.stdin?.end(input.prompt)
    let stdout = ''
    let stderr = ''
    let settled = false
    const settle = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn()
    }
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      settle(() => reject(new ModuleError('unreachable', `the agent did not finish in ${Math.round(timeoutMs / 1000)} s`)))
    }, timeoutMs)

    child.stdout?.on('data', (d: Buffer) => { stdout += d.toString() })
    child.stderr?.on('data', (d: Buffer) => { stderr += d.toString() })
    child.on('error', (err: Error) => settle(() => reject(new ModuleError('unreachable', `could not run claude: ${err.message}`))))
    child.on('close', (code: number | null) => settle(() => {
      let parsed: { result?: unknown; total_cost_usd?: unknown; num_turns?: unknown }
      try {
        parsed = JSON.parse(stdout) as typeof parsed
      } catch {
        return reject(new ModuleError('upstream', `claude did not print JSON (exit ${code}): ${stderr.trim().slice(0, 200)}`))
      }
      if (typeof parsed.result !== 'string') return reject(new ModuleError('upstream', `claude answered without a result (exit ${code})`))
      resolve({
        text: parsed.result,
        costUsd: typeof parsed.total_cost_usd === 'number' ? parsed.total_cost_usd : undefined,
        turns: typeof parsed.num_turns === 'number' ? parsed.num_turns : undefined,
      })
    }))
  }).finally(cleanup)
}
