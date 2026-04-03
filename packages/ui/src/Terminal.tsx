import { type FunctionComponent } from 'preact'
import { useEffect, useRef } from 'preact/hooks'

interface TerminalProps {
  streamUrl?: string
  content?: string
  height?: number
}

export const ForgeTerminal: FunctionComponent<TerminalProps> = ({
  streamUrl, content, height = 300
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<unknown>(null)

  useEffect(() => {
    let cleanup: (() => void) | undefined

    const init = async () => {
      const { Terminal } = await import('@xterm/xterm')
      const { FitAddon } = await import('@xterm/addon-fit')

      const term = new Terminal({
        theme: {
          background: '#1a1a2e',
          foreground: '#e0e0e0',
          cursor: '#e0e0e0'
        },
        fontSize: 13,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        convertEol: true,
        disableStdin: true
      })

      const fitAddon = new FitAddon()
      term.loadAddon(fitAddon)

      if (containerRef.current) {
        term.open(containerRef.current)
        fitAddon.fit()
        termRef.current = term
      }

      if (content) {
        term.write(content)
      }

      let evtSource: EventSource | undefined
      if (streamUrl) {
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

      const observer = new ResizeObserver(() => fitAddon.fit())
      if (containerRef.current) observer.observe(containerRef.current)

      cleanup = () => {
        evtSource?.close()
        observer.disconnect()
        term.dispose()
      }
    }

    init()
    return () => cleanup?.()
  }, [streamUrl, content])

  return (
    <div
      ref={containerRef}
      class="rounded-lg overflow-hidden"
      style={{ height: `${height}px`, width: '100%' }}
    />
  )
}
