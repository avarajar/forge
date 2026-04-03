import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { bearerAuth } from './auth.js'

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
