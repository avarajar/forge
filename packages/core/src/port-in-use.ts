import type { Server } from 'node:net'

export type PortHolder = 'forge' | 'other' | 'unresponsive'

// Resolves once the server listens; rejects with the listen error (EADDRINUSE, EACCES…)
export function waitForListening(server: Server): Promise<void> {
  if (server.listening) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const onError = (err: Error) => { server.off('listening', onListening); reject(err) }
    const onListening = () => { server.off('error', onError); resolve() }
    server.once('error', onError)
    server.once('listening', onListening)
  })
}

// Who holds the port: a Forge answers /api/health; a suspended one (Ctrl+Z) accepts but never answers
export async function probePort(port: number, timeoutMs = 1500): Promise<PortHolder> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(timeoutMs) })
    const body = await res.json().catch(() => null) as { status?: unknown; modules?: unknown } | null
    return body?.status === 'ok' && typeof body.modules === 'number' ? 'forge' : 'other'
  } catch (err) {
    return (err as Error).name === 'TimeoutError' ? 'unresponsive' : 'other'
  }
}

export function portInUseMessage(port: number, holder: PortHolder): string {
  const next = `Start on another port with --port ${port + 1} (or FORGE_PORT=${port + 1}).`
  const find = `Find it with: lsof -nP -iTCP:${port} -sTCP:LISTEN`
  if (holder === 'forge') return `Forge is already running at http://localhost:${port}.`
  if (holder === 'unresponsive') {
    return [
      `Port ${port} is taken by a process that does not answer, often a Forge suspended with Ctrl+Z.`,
      `${find}, then bring it back with \`fg\` in its terminal or stop it with \`kill <pid>\`.`,
      next
    ].join('\n  ')
  }
  return [`Port ${port} is in use by another program.`, find, next].join('\n  ')
}
