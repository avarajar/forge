import type { MiddlewareHandler } from 'hono'

export function bearerAuth(token: string): MiddlewareHandler {
  return async (c, next) => {
    if (c.req.path === '/api/health') {
      return next()
    }

    const authHeader = c.req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const provided = authHeader.slice(7)
    if (provided !== token) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    return next()
  }
}
