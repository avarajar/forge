import { type FunctionComponent } from 'preact'
import { useEffect, useRef } from 'preact/hooks'

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
  const isInteractive = !!wsUrl

  // Stable refs for callbacks — prevents useEffect re-runs
  const onExitRef = useRef(onExit)
  onExitRef.current = onExit
  const onConnectionChangeRef = useRef(onConnectionChange)
  onConnectionChangeRef.current = onConnectionChange

  useEffect(() => {
    if (!containerRef.current) return

    let disposed = false
    let ws: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let reconnectAttempt = 0
    const disposables: { dispose: () => void }[] = []

    const init = async () => {
      const { Terminal } = await import('@xterm/xterm')
      const { FitAddon } = await import('@xterm/addon-fit')
      const { WebLinksAddon } = await import('@xterm/addon-web-links')

      if (disposed) return

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

      term.open(containerRef.current!)
      // Delay fit so the container has final dimensions from layout
      setTimeout(() => {
        fitAddon.fit()
        if (isInteractive) term.focus()
      }, 50)

      // Static content mode
      if (content && !isInteractive) {
        term.write(content)
      }

      // SSE stream mode
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

      // WebSocket interactive mode
      if (wsUrl && !disposed) {
        const connectWs = (url: string) => {
          if (disposed) return
          console.log('[ForgeTerminal] Connecting to:', url)
          ws = new WebSocket(url)
          const wsDisposables: { dispose: () => void }[] = []

          ws.onopen = () => {
            console.log('[ForgeTerminal] WebSocket OPEN')
            reconnectAttempt = 0
            onConnectionChangeRef.current?.(true)

            // Send current dimensions immediately so PTY matches terminal
            fitAddon.fit()
            const { cols, rows } = term
            ws.send(JSON.stringify({ type: 'resize', cols, rows }))

            wsDisposables.push(term.onData((data: string) => {
              if (ws?.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'input', data }))
              }
            }))

            wsDisposables.push(term.onResize(({ cols, rows }: { cols: number; rows: number }) => {
              if (ws?.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'resize', cols, rows }))
              }
            }))
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
                onExitRef.current?.(msg.code)
              } else if (msg.type === 'error') {
                term.write(`\r\n\x1b[31m--- Error: ${msg.message} ---\x1b[0m\r\n`)
              }
            } catch {}
          }

          ws.onclose = (evt) => {
            console.log('[ForgeTerminal] WebSocket CLOSE:', evt.code, evt.reason)
            wsDisposables.forEach(d => d.dispose())
            wsDisposables.length = 0
            onConnectionChangeRef.current?.(false)

            if (disposed) return
            if (reconnectAttempt < 5) {
              const delay = Math.min(2000 * Math.pow(2, reconnectAttempt), 16000)
              reconnectAttempt++
              term.write(`\r\n\x1b[90m--- Reconnecting (attempt ${reconnectAttempt}/5)... ---\x1b[0m\r\n`)
              reconnectTimer = setTimeout(() => connectWs(url), delay)
            } else {
              term.write(`\r\n\x1b[31m--- Connection lost. Click Restart to try again. ---\x1b[0m\r\n`)
            }
          }

          ws.onerror = (e) => {
            console.error('[ForgeTerminal] WebSocket error:', e)
          }
        }

        connectWs(wsUrl)
      }

      // Auto-fit on resize
      const observer = new ResizeObserver(() => {
        if (!disposed) fitAddon.fit()
      })
      observer.observe(containerRef.current!)

      disposables.push({
        dispose: () => {
          evtSource?.close()
          observer.disconnect()
          if (reconnectTimer) clearTimeout(reconnectTimer)
          if (ws) {
            disposed = true // prevent reconnect
            ws.close()
          }
          term.dispose()
        }
      })
    }

    init()
    return () => {
      disposed = true
      disposables.forEach(d => d.dispose())
    }
  }, [streamUrl, content, wsUrl, isInteractive])

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
