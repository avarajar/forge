import { describe, it, expect } from 'vitest'
import { HARNESS_CAPABILITIES, supports } from './harness-capabilities.js'

describe('harness capabilities', () => {
  it('matches the capability table in the brief', () => {
    expect(HARNESS_CAPABILITIES).toEqual({
      claude: ['skip_permissions', 'agent_teams', 'slash_commands', 'mcp', 'model_flag', 'resume_by_name', 'continue_last'],
      codex: ['headless_login', 'api_key_login', 'custom_provider', 'model_flag', 'continue_last'],
      pi: ['model_flag'],
      opencode: ['custom_provider', 'model_flag'],
    })
  })

  it('treats an undefined harness as claude', () => {
    expect(supports(undefined, 'agent_teams')).toBe(true)
  })

  it('reports nothing for an unknown harness', () => {
    expect(supports('echoagent', 'model_flag')).toBe(false)
  })

  it('answers per harness', () => {
    expect(supports('codex', 'headless_login')).toBe(true)
    expect(supports('codex', 'skip_permissions')).toBe(false)
  })
})
