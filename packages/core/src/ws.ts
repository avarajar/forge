type WS = { send: (data: string) => void; close: () => void }

export class WebSocketHub {
  private connections = new Map<string, Set<WS>>()

  subscribe(channel: string, ws: WS) {
    if (!this.connections.has(channel)) {
      this.connections.set(channel, new Set())
    }
    this.connections.get(channel)!.add(ws)
  }

  unsubscribe(channel: string, ws: WS) {
    const clients = this.connections.get(channel)
    if (!clients) return
    clients.delete(ws)
    if (clients.size === 0) {
      this.connections.delete(channel)
    }
  }

  broadcast(channel: string, data: unknown) {
    const clients = this.connections.get(channel)
    if (!clients) return
    const message = JSON.stringify(data)
    for (const ws of clients) {
      try {
        ws.send(message)
      } catch {
        clients.delete(ws)
      }
    }
    if (clients.size === 0) {
      this.connections.delete(channel)
    }
  }

  broadcastAll(data: unknown) {
    const message = JSON.stringify(data)
    for (const [channel, clients] of this.connections) {
      for (const ws of clients) {
        try {
          ws.send(message)
        } catch {
          clients.delete(ws)
        }
      }
      if (clients.size === 0) {
        this.connections.delete(channel)
      }
    }
  }
}
