import { WebSocketServer, WebSocket } from 'ws'
import type { Server } from 'node:http'
import type { PTYManager } from './pty-manager.js'
import type { CWReader } from './cw-reader.js'

export function createTerminalWss(manager: PTYManager, reader: CWReader) {
  const wss = new WebSocketServer({ noServer: true })

  wss.on('connection', (ws: WebSocket, project: string, sessionDir: string) => {
    console.log(`[pty-ws] Connected: ${project}/${sessionDir}`)

    const session = reader.getSession(project, sessionDir)
    if (!session) {
      console.log(`[pty-ws] Session not found: ${project}/${sessionDir}`)
      ws.send(JSON.stringify({ type: 'error', message: `Session not found: ${project}/${sessionDir}` }))
      ws.close()
      return
    }

    const sessionId = `${project}::${sessionDir}`
    const ptySession = manager.getOrCreate(project, sessionDir, session)
    if (!ptySession) {
      console.error(`[pty-ws] Failed to spawn terminal for: ${project}/${sessionDir}`)
      ws.send(JSON.stringify({ type: 'error', message: `Failed to start terminal for ${project}/${sessionDir}` }))
      ws.close()
      return
    }

    const client = {
      send: (data: string) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(data)
      },
      close: () => ws.close()
    }

    manager.attach(sessionId, client)

    ws.on('message', (raw: Buffer | string) => {
      try {
        const msg = JSON.parse(raw.toString())
        if (msg.type === 'input') {
          const ptySession = manager.get(sessionId)
          if (ptySession) ptySession.pty.write(msg.data)
        } else if (msg.type === 'resize') {
          const ptySession = manager.get(sessionId)
          if (ptySession && msg.cols && msg.rows) {
            ptySession.pty.resize(msg.cols, msg.rows)
          }
        }
      } catch {}
    })

    ws.on('close', () => {
      console.log(`[pty-ws] Disconnected: ${project}/${sessionDir}`)
      manager.detach(sessionId, client)
    })
  })

  function attachToServer(server: Server) {
    server.on('upgrade', (request, socket, head) => {
      const url = new URL(request.url ?? '/', 'http://localhost')
      const match = url.pathname.match(/^\/ws\/terminal\/([^/]+)\/([^/]+)$/)

      if (match) {
        const [, project, sessionDir] = match
        console.log(`[pty-ws] Upgrade request: ${project}/${sessionDir}`)
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, project, sessionDir)
        })
      } else {
        socket.destroy()
      }
    })
  }

  return { wss, attachToServer }
}
