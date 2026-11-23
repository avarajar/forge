import { type FunctionComponent } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { inkOf, soft } from '../config/types.js'
import { labelStyle } from './Field.js'

export interface ToolsMcp { name: string; type: string; source: string; url?: string }
export interface ToolsPlugin { name: string; enabled: boolean; hasMcp: boolean; mcpName?: string; mcpType?: string; marketplace: string }
export interface ToolsInfo { account: string | null; mcps: ToolsMcp[]; plugins: ToolsPlugin[] }

export const toolsUrl = (project: string, account: string): string => {
  const q = new URLSearchParams()
  if (project) q.set('project', project)
  if (account) q.set('account', account)
  return `/api/cw/tools?${q.toString()}`
}

// MCP servers Claude Code will load: the configured ones plus those of enabled plugins
export function loadedMcps(tools: ToolsInfo): { name: string; title: string }[] {
  const own = tools.mcps.map(m => ({ name: m.name, title: `${m.type} · ${m.source}` }))
  const fromPlugins = tools.plugins
    .filter(p => p.enabled && p.hasMcp && p.mcpName && !own.some(m => m.name === p.mcpName))
    .map(p => ({ name: p.mcpName ?? p.name, title: `plugin ${p.name}` }))
  return [...own, ...fromPlugins]
}

const chip = (color: string) => ({
  fontSize: '11.5px',
  fontFamily: 'var(--mono)',
  padding: '2px 8px',
  borderRadius: '999px',
  background: soft(color),
  color: inkOf(color),
  whiteSpace: 'nowrap' as const,
})

// what a new Claude Code session will have for this account and project, shown before it starts
export const ClaudeTools: FunctionComponent<{ project: string; account: string }> = ({ project, account }) => {
  const [tools, setTools] = useState<ToolsInfo | null>(null)

  useEffect(() => {
    if (!account) return
    let cancelled = false
    fetch(toolsUrl(project, account))
      .then(r => r.json() as Promise<ToolsInfo>)
      .catch(() => null)
      .then((result) => { if (!cancelled) setTools(result) })
    return () => { cancelled = true }
  }, [project, account])

  if (!tools) return null
  const mcps = loadedMcps(tools)
  const plugins = tools.plugins.filter(p => p.enabled)

  return (
    <div class="flex flex-col" style={{ gap: '6px' }}>
      <span style={labelStyle}>Claude Code will load</span>
      <div class="flex flex-wrap items-center" style={{ gap: '5px' }}>
        <span style={{ fontSize: '12px', color: 'var(--ink-3)', marginRight: '2px' }}>MCP</span>
        {mcps.length === 0 && <span style={{ fontSize: '12px', color: 'var(--ink-3)' }}>none</span>}
        {mcps.map(m => <span key={m.name} title={m.title} style={chip('--teal')}>{m.name}</span>)}
      </div>
      {plugins.length > 0 && (
        <div class="truncate" style={{ fontSize: '12px', color: 'var(--ink-3)' }} title={plugins.map(p => p.name).join(', ')}>
          {plugins.length} plugin{plugins.length === 1 ? '' : 's'} · <span style={{ color: 'var(--ink-2)' }}>{plugins.map(p => p.name).join(', ')}</span>
        </div>
      )}
      <span style={{ fontSize: '11.5px', color: 'var(--ink-3)' }}>claude.ai connectors are not listed: they live in the account, not on disk.</span>
    </div>
  )
}
