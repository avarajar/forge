export type Capability =
  | 'skip_permissions' | 'agent_teams' | 'slash_commands' | 'mcp'
  | 'headless_login' | 'api_key_login' | 'custom_provider' | 'model_flag'
  | 'resume_by_name' | 'continue_last'

// Copied from the CW drivers because cw doctor --json does not expose capabilities
export const HARNESS_CAPABILITIES: Record<string, readonly Capability[]> = {
  claude: ['skip_permissions', 'agent_teams', 'slash_commands', 'mcp', 'model_flag', 'resume_by_name', 'continue_last'],
  codex: ['headless_login', 'api_key_login', 'custom_provider', 'model_flag', 'continue_last'],
  pi: ['model_flag'],
  opencode: ['custom_provider', 'model_flag'],
}

export function supports(harness: string | undefined, cap: Capability): boolean {
  return (HARNESS_CAPABILITIES[harness ?? 'claude'] ?? []).includes(cap)
}
