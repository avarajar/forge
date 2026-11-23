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

// Claude Code names a server's tools mcp__<server>__<tool>, with any other character as _, and a plugin's server
// plugin_<plugin>_<server>; the prefix alone matches all of them in --disallowedTools
const toolName = (name: string): string => name.replace(/[^A-Za-z0-9_-]/g, '_')
export const mcpPrefix = (server: string, plugin?: string): string =>
  plugin ? `mcp__plugin_${toolName(plugin)}_${toolName(server)}` : `mcp__${toolName(server)}`

export interface LoadedMcp { name: string; title: string; prefix: string }

// MCP servers Claude Code will load: the configured ones plus those of enabled plugins
export function loadedMcps(tools: ToolsInfo): LoadedMcp[] {
  const own = tools.mcps.map(m => ({ name: m.name, title: `${m.type} · ${m.source}`, prefix: mcpPrefix(m.name) }))
  const fromPlugins = tools.plugins
    .filter(p => p.enabled && p.hasMcp && p.mcpName)
    .map(p => ({ name: p.mcpName ?? p.name, title: `plugin ${p.name}`, prefix: mcpPrefix(p.mcpName ?? p.name, p.name) }))
  return [...own, ...fromPlugins]
}

const chip = (color: string, off: boolean) => ({
  fontSize: '11.5px',
  fontFamily: 'var(--mono)',
  padding: '2px 8px',
  borderRadius: '999px',
  border: off ? '1px dashed var(--hair-2)' : '1px solid transparent',
  background: off ? 'transparent' : soft(color),
  color: off ? 'var(--ink-3)' : inkOf(color),
  textDecoration: off ? 'line-through' : 'none',
  whiteSpace: 'nowrap' as const,
  cursor: 'pointer',
  transition: 'background .15s var(--ease), color .15s var(--ease)',
})

// what a new Claude Code session will have for this account and project, shown before it starts;
// a click on an MCP starts the session without its tools
export const ClaudeTools: FunctionComponent<{
  project: string
  account: string
  disabled: string[]
  onToggle: (prefix: string) => void
}> = ({ project, account, disabled, onToggle }) => {
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
  const off = mcps.filter(m => disabled.includes(m.prefix)).length

  return (
    <div class="flex flex-col" style={{ gap: '6px' }}>
      <span style={labelStyle}>Claude Code will load</span>
      <div class="flex flex-wrap items-center" style={{ gap: '5px' }}>
        <span style={{ fontSize: '12px', color: 'var(--ink-3)', marginRight: '2px' }}>MCP</span>
        {mcps.length === 0 && <span style={{ fontSize: '12px', color: 'var(--ink-3)' }}>none</span>}
        {mcps.map(m => {
          const isOff = disabled.includes(m.prefix)
          return (
            <button
              key={m.prefix}
              type="button"
              aria-pressed={!isOff}
              title={`${m.title} · ${isOff ? 'click to load it' : 'click to start without it'}`}
              onClick={() => onToggle(m.prefix)}
              style={chip('--teal', isOff)}
            >
              {m.name}
            </button>
          )
        })}
      </div>
      {plugins.length > 0 && (
        <div class="truncate" style={{ fontSize: '12px', color: 'var(--ink-3)' }} title={plugins.map(p => p.name).join(', ')}>
          {plugins.length} plugin{plugins.length === 1 ? '' : 's'} · <span style={{ color: 'var(--ink-2)' }}>{plugins.map(p => p.name).join(', ')}</span>
        </div>
      )}
      <span style={{ fontSize: '11.5px', color: 'var(--ink-3)' }}>
        {off > 0
          ? `${off} MCP off: the server still starts, Claude gets none of its tools. Kept when the task reopens.`
          : 'Click an MCP to start without it. claude.ai connectors are not listed.'}
      </span>
    </div>
  )
}
