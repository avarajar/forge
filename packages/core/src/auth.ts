import { createHash, timingSafeEqual } from 'node:crypto'
import type { Hono, MiddlewareHandler } from 'hono'

export const AUTH_COOKIE = 'forge_token'
export const MIN_TOKEN_LENGTH = 16

// Hashing first gives both sides the same length, so the comparison takes the same time whatever was sent
function sameToken(expected: string, provided: string | undefined): boolean {
  if (!provided) return false
  const a = createHash('sha256').update(expected).digest()
  const b = createHash('sha256').update(provided).digest()
  return timingSafeEqual(a, b)
}

function cookieValue(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    if (part.slice(0, eq).trim() === name) {
      try { return decodeURIComponent(part.slice(eq + 1).trim()) } catch { return undefined }
    }
  }
  return undefined
}

// The CLI and scripts send `Authorization: Bearer`; the console and its terminal WebSockets send the
// cookie that /auth leaves (a browser cannot put headers on a WebSocket)
export function isAuthorized(token: string, authorization: string | undefined, cookieHeader: string | undefined): boolean {
  if (authorization?.startsWith('Bearer ') && sameToken(token, authorization.slice(7))) return true
  return sameToken(token, cookieValue(cookieHeader, AUTH_COOKIE))
}

export function bearerAuth(token: string): MiddlewareHandler {
  return async (c, next) => {
    if (c.req.path === '/api/health') {
      return next()
    }
    if (!isAuthorized(token, c.req.header('Authorization'), c.req.header('Cookie'))) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    return next()
  }
}

// GET /auth?token=… checks the token once, keeps it in an HttpOnly cookie and goes to the console.
// SameSite=Strict keeps other sites from riding on it.
export function mountAuthRoute(app: Hono, token: string): void {
  app.get('/auth', (c) => {
    if (!sameToken(token, c.req.query('token'))) {
      return c.text('Wrong or missing token. Open the link Forge printed when it started.', 401)
    }
    const https = new URL(c.req.url).protocol === 'https:' || c.req.header('X-Forwarded-Proto') === 'https'
    const cookie = [
      `${AUTH_COOKIE}=${encodeURIComponent(token)}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Strict',
      'Max-Age=2592000',
      ...(https ? ['Secure'] : [])
    ].join('; ')
    c.header('Set-Cookie', cookie)
    c.header('Cache-Control', 'no-store')
    return c.redirect('/', 302)
  })
}

// Forge reachable from other machines must have a token: without one, anyone who reaches the port
// gets the API and a shell on this machine
export function remoteAuthProblem(localOnly: boolean, token: string | undefined): string | null {
  if (localOnly) return null
  if (!token) return 'Forge would be reachable from other machines (FORGE_HOST or team mode) and needs FORGE_AUTH_TOKEN. Set one, for example: FORGE_AUTH_TOKEN=$(openssl rand -hex 24)'
  if (token.length < MIN_TOKEN_LENGTH) return `FORGE_AUTH_TOKEN must be at least ${MIN_TOKEN_LENGTH} characters, for example: FORGE_AUTH_TOKEN=$(openssl rand -hex 24)`
  return null
}
