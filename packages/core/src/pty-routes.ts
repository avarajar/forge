import type { Hono } from 'hono'
import { createNodeWebSocket } from '@hono/node-ws'
import type { PTYManager } from './pty-manager.js'
import type { CWReader } from './cw-reader.js'

export function ptyRoutes(
  app: Hono,
  manager: PTYManager,
  reader: CWReader
) {
  const nodeWs = createNodeWebSocket({ app })
  const { upgradeWebSocket } = nodeWs

  app.get(
    '/ws/terminal/:project/:sessionDir',
    upgradeWebSocket((c) => {
      const project = c.req.param('project') as string
      const sessionDir = c.req.param('sessionDir') as string
      console.log(`[pty-routes] WebSocket upgrade for ${project}/${sessionDir}`)

      return {
        onOpen(_evt, ws) {
          console.log(`[pty-routes] onOpen: ${project}/${sessionDir}`)
          const session = reader.getSession(project, sessionDir)
          if (!session) {
            console.log(`[pty-routes] Session not found: ${project}/${sessionDir}`)
            ws.send(JSON.stringify({ type: 'error', message: `Session not found: ${project}/${sessionDir}` }))
            ws.close()
            return
          }

          const sessionId = `${project}::${sessionDir}`
          manager.getOrCreate(project, sessionDir, session)

          const client = {
            send: (data: string) => { ws.send(data) },
            close: () => { ws.close() }
          }

          ;(ws as unknown as Record<string, unknown>).__ptyClient = client
          ;(ws as unknown as Record<string, unknown>).__sessionId = sessionId

          manager.attach(sessionId, client)
        },

        onMessage(evt, ws) {
          const sessionId = (ws as unknown as Record<string, unknown>).__sessionId as string
          if (!sessionId) return

          try {
            const msg = JSON.parse(typeof evt.data === 'string' ? evt.data : evt.data.toString())

            if (msg.type === 'input') {
              const ptySession = manager.get(sessionId)
              if (ptySession) {
                ptySession.pty.write(msg.data)
              }
            } else if (msg.type === 'resize') {
              const ptySession = manager.get(sessionId)
              if (ptySession && msg.cols && msg.rows) {
                ptySession.pty.resize(msg.cols, msg.rows)
              }
            }
          } catch {
            // Ignore malformed messages
          }
        },

        onClose(_evt, ws) {
          const sessionId = (ws as unknown as Record<string, unknown>).__sessionId as string
          const client = (ws as unknown as Record<string, unknown>).__ptyClient
          if (sessionId && client) {
            manager.detach(sessionId, client as { send: (data: string) => void; close: () => void })
          }
        }
      }
    })
  )

  return nodeWs
}
