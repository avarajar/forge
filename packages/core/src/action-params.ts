import type { ActionDef } from '@forge-dev/sdk'

export type ParamsResult = { env: Record<string, string> } | { error: string }

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

/** Checks a request's `params` against what the action declares and maps them to env vars.
 *  Every declared param is required; anything undeclared is refused. */
export function validateParams(def: ActionDef, params: unknown): ParamsResult {
  const given = params ?? {}
  if (typeof given !== 'object' || Array.isArray(given)) {
    return { error: 'params must be an object of strings' }
  }
  const values = given as Record<string, unknown>
  const declared = def.params ?? {}

  const extra = Object.keys(values).filter((k) => !Object.hasOwn(declared, k))
  if (extra.length > 0) {
    return { error: `Unknown param${extra.length > 1 ? 's' : ''} for action ${def.id}: ${extra.join(', ')}` }
  }

  const env: Record<string, string> = {}
  for (const [name, { pattern }] of Object.entries(declared)) {
    if (!NAME.test(name)) return { error: `Action ${def.id} declares an invalid param name: ${name}` }
    let re: RegExp
    try {
      re = new RegExp(`^(?:${pattern})$`)
    } catch {
      return { error: `Action ${def.id} declares an invalid pattern for ${name}` }
    }
    const value = values[name]
    if (value === undefined) return { error: `Missing param ${name}` }
    if (typeof value !== 'string') return { error: `Param ${name} must be a string` }
    if (!re.test(value)) return { error: `Param ${name} does not match ${pattern}` }
    env[`FORGE_PARAM_${name.toUpperCase()}`] = value
  }
  return { env }
}
