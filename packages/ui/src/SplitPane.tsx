import { type FunctionComponent, type ComponentChildren } from 'preact'
import { useState, useRef, useCallback, useEffect } from 'preact/hooks'

interface SplitPaneProps {
  left: ComponentChildren
  right: ComponentChildren
  defaultWidth?: number
  minWidth?: number
  maxWidth?: number
  storageKey?: string
}

export const SplitPane: FunctionComponent<SplitPaneProps> = ({
  left,
  right,
  defaultWidth = 300,
  minWidth = 200,
  maxWidth = 600,
  storageKey = 'forge-split-width'
}) => {
  const [width, setWidth] = useState<number>(() => {
    if (typeof localStorage !== 'undefined' && storageKey) {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const n = parseInt(saved, 10)
        if (!isNaN(n) && n >= minWidth && n <= maxWidth) return n
      }
    }
    return defaultWidth
  })

  const dragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)

  const onMouseDown = useCallback((e: MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    startX.current = e.clientX
    startWidth.current = width
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [width])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const delta = e.clientX - startX.current
      const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidth.current + delta))
      setWidth(newWidth)
    }

    const onMouseUp = () => {
      if (!dragging.current) return
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      if (typeof localStorage !== 'undefined' && storageKey) {
        localStorage.setItem(storageKey, String(width))
      }
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [width, minWidth, maxWidth, storageKey])

  return (
    <div class="flex h-full w-full overflow-hidden">
      {/* Left pane (sidebar) */}
      <div
        class="shrink-0 overflow-y-auto overflow-x-hidden"
        style={{ width: `${width}px` }}
      >
        {left}
      </div>

      {/* Drag handle */}
      <div
        class="shrink-0 w-1 cursor-col-resize hover:bg-forge-accent/30 transition-colors"
        style={{ backgroundColor: 'var(--forge-ghost-border)' }}
        onMouseDown={onMouseDown}
      />

      {/* Right pane (terminal) */}
      <div class="flex-1 min-w-0 overflow-hidden">
        {right}
      </div>
    </div>
  )
}
