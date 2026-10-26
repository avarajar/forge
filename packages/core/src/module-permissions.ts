import { realpathSync } from 'node:fs'
import { basename, dirname, join, resolve, sep } from 'node:path'
import { expandHome } from './state-log.js'
import type { ModulePermissions, ModuleSettings } from '@forge-dev/sdk'

export interface Grants {
  network: string[]
  fsRead: string[]
  fsWrite: string[]
  shell: string[]
  pty: boolean
}

const TEMPLATE_RE = /\{([a-zA-Z0-9_]+)(\[\]\.([a-zA-Z0-9_]+))?\}/g

export function expandGrants(permissions: ModulePermissions | undefined, settings: ModuleSettings): Grants {
  const p = permissions ?? {}
  return {
    network: expandAll(p.network, settings).map(normalizeOrigin).filter((o): o is string => o !== null),
    fsRead: expandAll(p['fs:read'], settings).map(expandHome),
    fsWrite: expandAll(p['fs:write'], settings).map(expandHome),
    shell: expandAll(p.shell, settings).map(expandHome),
    pty: p.pty === true,
  }
}

function expandAll(templates: string[] | undefined, settings: ModuleSettings): string[] {
  return (templates ?? []).flatMap(t => expandOne(t, settings))
}

// one string per list item; any unresolved placeholder drops that string, never widens it
function expandOne(template: string, settings: ModuleSettings): string[] {
  const lists = new Set<string>()
  for (const m of template.matchAll(TEMPLATE_RE)) if (m[2]) lists.add(m[1])
  if (lists.size > 1) return []
  const [list] = [...lists]
  const items: Array<Record<string, unknown> | undefined> = list
    ? (Array.isArray(settings[list]) ? (settings[list] as unknown[]).map(i => (typeof i === 'object' && i !== null ? i as Record<string, unknown> : {})) : [])
    : [undefined]

  const out: string[] = []
  for (const item of items) {
    let missing = false
    const text = template.replace(TEMPLATE_RE, (_all, key: string, isList?: string, field?: string) => {
      const v = isList ? item?.[field as string] : settings[key]
      if (typeof v === 'string' && v !== '') return v
      if (typeof v === 'number' && Number.isFinite(v)) return String(v)
      missing = true
      return ''
    })
    if (!missing) out.push(text)
  }
  return out
}

function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value)
    return url.username || url.password ? null : url.origin
  } catch {
    return null
  }
}

export function allowsOrigin(grants: Grants, target: string): boolean {
  try {
    const url = new URL(target)
    if (url.username || url.password) return false
    return grants.network.includes(url.origin)
  } catch {
    return false
  }
}

export function allowsCommand(grants: Grants, command: string): boolean {
  return grants.shell.includes(expandHome(command))
}

export async function allowsPath(grants: string[], target: string): Promise<boolean> {
  const real = realOrParent(resolve(expandHome(target)))
  for (const grant of grants) {
    const folder = grant.endsWith('/')
    const base = realOrParent(resolve(expandHome(grant)))
    if (folder ? real === base || real.startsWith(base + sep) : real === base) return true
  }
  return false
}

// a file that does not exist yet resolves through its nearest existing parent
export function realOrParent(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    const parent = dirname(path)
    return parent === path ? path : join(realOrParent(parent), basename(path))
  }
}
