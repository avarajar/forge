import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { AUTH_COOKIE, MIN_TOKEN_LENGTH, bearerAuth, isAuthorized, mountAuthRoute, remoteAuthProblem } from './auth.js'

describe('bearerAuth middleware', () => {
  const app = new Hono()
  app.use('/api/*', bearerAuth('test-secret-token'))
  app.get('/api/health', (c) => c.json({ status: 'ok' }))
  app.get('/api/projects', (c) => c.json([]))

  it('allows requests with valid token', async () => {
    const res = await app.request('/api/projects', {
      headers: { Authorization: 'Bearer test-secret-token' }
    })
    expect(res.status).toBe(200)
  })

  it('rejects requests without token', async () => {
    const res = await app.request('/api/projects')
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('Unauthorized')
  })

  it('rejects requests with wrong token', async () => {
    const res = await app.request('/api/projects', {
      headers: { Authorization: 'Bearer wrong-token' }
    })
    expect(res.status).toBe(401)
  })

  it('always allows /api/health without token', async () => {
    const res = await app.request('/api/health')
    expect(res.status).toBe(200)
  })
})

describe('token sign-in for remote Forge', () => {
  const TOKEN = 'remote-token-0123456789abcdef'

  it('accepts the cookie as well as the bearer header', () => {
    expect(isAuthorized(TOKEN, `Bearer ${TOKEN}`, undefined)).toBe(true)
    expect(isAuthorized(TOKEN, undefined, `theme=dark; ${AUTH_COOKIE}=${TOKEN}`)).toBe(true)
    expect(isAuthorized(TOKEN, 'Bearer nope', `${AUTH_COOKIE}=nope`)).toBe(false)
    expect(isAuthorized(TOKEN, undefined, undefined)).toBe(false)
    expect(isAuthorized(TOKEN, undefined, `${AUTH_COOKIE}=%E0%A4%A`)).toBe(false)
  })

  it('/auth leaves an HttpOnly, SameSite=Strict cookie that opens the API', async () => {
    const app = new Hono()
    app.use('/api/*', bearerAuth(TOKEN))
    mountAuthRoute(app, TOKEN)
    app.get('/api/projects', (c) => c.json([]))

    const signIn = await app.request(`/auth?token=${TOKEN}`)
    expect(signIn.status).toBe(302)
    expect(signIn.headers.get('location')).toBe('/')
    const cookie = signIn.headers.get('set-cookie') ?? ''
    expect(cookie).toContain(`${AUTH_COOKIE}=${TOKEN}`)
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Strict')
    expect(cookie).not.toContain('Secure')

    const res = await app.request('/api/projects', { headers: { Cookie: cookie.split(';')[0] } })
    expect(res.status).toBe(200)
  })

  it('/auth refuses a wrong or missing token and sets nothing', async () => {
    const app = new Hono()
    mountAuthRoute(app, TOKEN)
    for (const path of ['/auth', '/auth?token=wrong']) {
      const res = await app.request(path)
      expect(res.status).toBe(401)
      expect(res.headers.get('set-cookie')).toBeNull()
    }
  })

  it('marks the cookie Secure behind HTTPS', async () => {
    const app = new Hono()
    mountAuthRoute(app, TOKEN)
    const res = await app.request(`/auth?token=${TOKEN}`, { headers: { 'X-Forwarded-Proto': 'https' } })
    expect(res.headers.get('set-cookie')).toContain('Secure')
  })

  it('requires a long enough token whenever Forge is not local only', () => {
    expect(remoteAuthProblem(true, undefined)).toBeNull()
    expect(remoteAuthProblem(false, undefined)).toContain('FORGE_AUTH_TOKEN')
    expect(remoteAuthProblem(false, 'short')).toContain(`at least ${MIN_TOKEN_LENGTH}`)
    expect(remoteAuthProblem(false, TOKEN)).toBeNull()
  })
})
