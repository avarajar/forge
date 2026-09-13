import type { MiddlewareHandler } from 'hono'

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

export function isLoopbackHost(host: string | undefined): boolean {
  if (!host) return false
  if (LOOPBACK_HOSTNAMES.has(host)) return true
  try {
    return LOOPBACK_HOSTNAMES.has(new URL(`http://${host}`).hostname)
  } catch {
    return false
  }
}

// A loopback Host stops DNS rebinding; browsers add Origin to cross-site requests, the CLI sends none
export function isLocalRequest(host: string | undefined, origin: string | undefined): boolean {
  if (!isLoopbackHost(host)) return false
  if (origin === undefined) return true
  try {
    return LOOPBACK_HOSTNAMES.has(new URL(origin).hostname)
  } catch {
    return false
  }
}

// One place decides both the bind address and whether the same-machine check applies
export function resolveListenOptions(isTeam: boolean, envHost = process.env.FORGE_HOST): { host: string | undefined; localOnly: boolean } {
  const host = envHost ?? (isTeam ? undefined : '127.0.0.1')
  return { host, localOnly: !isTeam && isLoopbackHost(host) }
}

export function localOriginGuard(): MiddlewareHandler {
  return async (c, next) => {
    if (!isLocalRequest(new URL(c.req.url).host, c.req.header('Origin'))) {
      return c.json({ error: 'Forbidden' }, 403)
    }
    return next()
  }
}
