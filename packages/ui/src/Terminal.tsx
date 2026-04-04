import { type FunctionComponent } from 'preact'
import { useEffect, useRef, useCallback } from 'preact/hooks'

interface TerminalProps {
  /** Static content to display (read-only) */
  content?: string
  /** SSE stream URL (read-only) */
  streamUrl?: string
  /** WebSocket URL for interactive mode (bidirectional) */
  wsUrl?: string
  /** Terminal height — ignored when wsUrl is set (uses 100% of parent) */
  height?: number
  /** Called when the PTY exits */
  onExit?: (code: number) => void
  /** Called when WebSocket connection state changes */
  onConnectionChange?: (connected: boolean) => void
}

export const ForgeTerminal: FunctionComponent<TerminalProps> = ({
  streamUrl, content, wsUrl, height = 300, onExit, onConnectionChange
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<unknown>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectAttemptRef = useRef(0)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isInteractive = !!wsUrl

  const connectWs = useCallback(async (
    term: { write: (data: string) => void; onData: (cb: (data: string) => void) => { dispose: () => void }; onResize: (cb: (size: { cols: number; rows: number }) => void) => { dispose: () => void } },
    url: string
  ) => {
    if (wsRef.current) {
      wsRef.current.close()
    }

    const ws = new WebSocket(url)
    wsRef.current = ws

    const disposables: { dispose: () => void }[] = []

    ws.onopen = () => {
      reconnectAttemptRef.current = 0
      onConnectionChange?.(true)

      const dataDisp = term.onData((data: string) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'input', data }))
        }
      })
      disposables.push(dataDisp)

      const resizeDisp = term.onResize(({ cols, rows }: { cols: number; rows: number }) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'resize', cols, rows }))
        }
      })
      disposables.push(resizeDisp)
    }

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data)
        if (msg.type === 'output') {
          term.write(msg.data)
        } else if (msg.type === 'scrollback') {
          term.write(msg.data)
        } else if (msg.type === 'exit') {
          term.write(`\r\n\x1b[33m--- Session ended (code ${msg.code}) ---\x1b[0m\r\n`)
          onExit?.(msg.code)
        } else if (msg.type === 'error') {
          term.write(`\r\n\x1b[31m--- Error: ${msg.message} ---\x1b[0m\r\n`)
        }
      } catch {}
    }

    ws.onclose = () => {
      disposables.forEach(d => d.dispose())
      onConnectionChange?.(false)

      const attempt = reconnectAttemptRef.current
      if (attempt < 5) {
        const delay = Math.min(2000 * Math.pow(2, attempt), 16000)
        reconnectAttemptRef.current = attempt + 1
        term.write(`\r\n\x1b[90m--- Reconnecting (attempt ${attempt + 1}/5)... ---\x1b[0m\r\n`)
        reconnectTimerRef.current = setTimeout(() => connectWs(term, url), delay)
      } else {
        term.write(`\r\n\x1b[31m--- Connection lost. Click Restart to try again. ---\x1b[0m\r\n`)
      }
    }

    ws.onerror = () => {
      // onclose will handle reconnection
    }
  }, [onExit, onConnectionChange])

  useEffect(() => {
    let cleanup: (() => void) | undefined

    const init = async () => {
      const { Terminal } = await import('@xterm/xterm')
      const { FitAddon } = await import('@xterm/addon-fit')
      const { WebLinksAddon } = await import('@xterm/addon-web-links')

      const term = new Terminal({
        theme: {
          background: '#1a1a2e',
          foreground: '#e0e0e0',
          cursor: '#e0e0e0'
        },
        fontSize: 13,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        convertEol: !isInteractive,
        disableStdin: !isInteractive,
        cursorBlink: isInteractive
      })

      const fitAddon = new FitAddon()
      term.loadAddon(fitAddon)
      term.loadAddon(new WebLinksAddon())

      if (containerRef.current) {
        term.open(containerRef.current)
        fitAddon.fit()
        termRef.current = term
      }

      if (content && !isInteractive) {
        term.write(content)
      }

      let evtSource: EventSource | undefined
      if (streamUrl && !isInteractive) {
        evtSource = new EventSource(streamUrl)
        evtSource.addEventListener('output', (e) => {
          const { chunk } = JSON.parse(e.data)
          term.write(chunk)
        })
        evtSource.addEventListener('done', (e) => {
          const { exitCode } = JSON.parse(e.data)
          term.write(`\r\n\x1b[${exitCode === 0 ? '32' : '31'}m--- Exit code: ${exitCode} ---\x1b[0m\r\n`)
          evtSource?.close()
        })
      }

      if (wsUrl) {
        await connectWs(term as unknown as Parameters<typeof connectWs>[0], wsUrl)
      }

      const observer = new ResizeObserver(() => fitAddon.fit())
      if (containerRef.current) observer.observe(containerRef.current)

      cleanup = () => {
        evtSource?.close()
        observer.disconnect()
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
        if (wsRef.current) {
          reconnectAttemptRef.current = 999 // prevent reconnect during cleanup
          wsRef.current.close()
        }
        term.dispose()
      }
    }

    init()
    return () => cleanup?.()
  }, [streamUrl, content, wsUrl, isInteractive, connectWs])

  const style = isInteractive
    ? { width: '100%', height: '100%' }
    : { width: '100%', height: `${height}px` }

  return (
    <div
      ref={containerRef}
      class="rounded-lg overflow-hidden"
      style={style}
    />
  )
}
