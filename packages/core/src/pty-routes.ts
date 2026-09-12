import { WebSocketServer, WebSocket } from 'ws'
import type { Server } from 'node:http'
import type { PTYManager } from './pty-manager.js'
import type { CWReader } from './cw-reader.js'
import type { CWSession } from './cw-types.js'
import { pendingSessions } from './cw-routes.js'

// A session still in pendingSessions was just created by /start; anything else is a resume
export function takeSession(reader: CWReader, project: string, sessionDir: string): { session: CWSession; isNew: boolean } | null {
  const sessionId = `${project}::${sessionDir}`
  const pending = pendingSessions.get(sessionId)
  if (pending) {
    pendingSessions.delete(sessionId)
    return { session: pending, isNew: true }
  }
  const session = reader.getSession(project, sessionDir)
  return session ? { session, isNew: false } : null
}

export function createTerminalWss(manager: PTYManager, reader: CWReader) {
  const wss = new WebSocketServer({ noServer: true })

  function wireWs(ws: WebSocket, sessionId: string, project: string, sessionDir: string) {
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
  }

  wss.on('connection', (ws: WebSocket, project: string, sessionDir: string) => {
    console.log(`[pty-ws] Connected: ${project}/${sessionDir}`)

    const sessionId = `${project}::${sessionDir}`

    // Reattach to an already-running PTY even if session metadata is gone
    // (e.g. general sessions where session.json never exists on disk and
    //  pendingSessions was consumed on the first connect)
    if (manager.has(sessionId)) {
      wireWs(ws, sessionId, project, sessionDir)
      return
    }

    const taken = takeSession(reader, project, sessionDir)

    if (!taken) {
      console.log(`[pty-ws] Session not found: ${project}/${sessionDir}`)
      ws.send(JSON.stringify({ type: 'error', message: `Session not found: ${project}/${sessionDir}` }))
      ws.close()
      return
    }

    const ptySession = manager.getOrCreate(project, sessionDir, taken.session, { isNew: taken.isNew })
    if (!ptySession) {
      console.error(`[pty-ws] Failed to spawn terminal for: ${project}/${sessionDir}`)
      ws.send(JSON.stringify({ type: 'error', message: `Failed to start terminal for ${project}/${sessionDir}` }))
      ws.close()
      return
    }

    wireWs(ws, sessionId, project, sessionDir)
  })

  function attachToServer(server: Server) {
    server.on('upgrade', (request, socket, head) => {
      const url = new URL(request.url ?? '/', 'http://localhost')
      const parsed = parseTerminalUpgradeUrl(url.pathname)

      if (parsed) {
        const { project, sessionDir } = parsed
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

// Slashes inside `sessionDir` (from branch-style task names like `task/form-header`,
// stored by CW as the nested dir `task-task/form-header`) must be percent-encoded
// by the client — otherwise the regex sees too many path segments and returns null.
export function parseTerminalUpgradeUrl(pathname: string): { project: string; sessionDir: string } | null {
  const match = pathname.match(/^\/ws\/terminal\/([^/]+)\/([^/]+)$/)
  if (!match) return null
  try {
    return { project: decodeURIComponent(match[1]), sessionDir: decodeURIComponent(match[2]) }
  } catch {
    return null
  }
}
