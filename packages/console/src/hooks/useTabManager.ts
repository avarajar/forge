import { useState, useEffect, useCallback, useRef } from 'preact/hooks'
import type { CWSession } from '@forge-dev/core'
import { sessionKey } from '../config/types.js'

const STORAGE_KEY = 'forge-open-tabs'

interface UseTabManagerOptions {
  spaces: CWSession[]
  loading: boolean
  onFetchData: () => void
}

export function useTabManager({ spaces, loading, onFetchData }: UseTabManagerOptions) {
  const [openTabs, setOpenTabs] = useState<CWSession[]>([])
  const [activeTabIndex, setActiveTabIndex] = useState(0)
  const [showList, setShowList] = useState(true)
  const restoredRef = useRef(false)

  // Restore tabs after initial data load — runs once
  // Tabs are restored but we always start on the list view.
  // The OpenTabsBanner shows which tabs are open so the user can jump in.
  useEffect(() => {
    if (loading || spaces.length === 0 || restoredRef.current) return
    restoredRef.current = true
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const { keys, activeIndex } = JSON.parse(raw) as { keys: string[]; activeIndex: number }
      const restored: CWSession[] = []
      for (const key of keys) {
        const match = spaces.find(s => sessionKey(s) === key)
        if (match) restored.push(match)
      }
      if (restored.length > 0) {
        setOpenTabs(restored)
        setActiveTabIndex(Math.min(activeIndex, restored.length - 1))
        // Stay on list — user clicks a tab from the banner to switch
      }
    } catch {}
  }, [loading, spaces])

  // Persist open tabs to sessionStorage — only after restore has run
  useEffect(() => {
    if (!restoredRef.current) return
    if (openTabs.length > 0) {
      const keys = openTabs.map(sessionKey)
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ keys, activeIndex: activeTabIndex }))
    } else {
      sessionStorage.removeItem(STORAGE_KEY)
    }
  }, [openTabs, activeTabIndex])

  const openTab = useCallback((session: CWSession) => {
    const key = sessionKey(session)
    const existingIndex = openTabs.findIndex(t => sessionKey(t) === key)
    if (existingIndex >= 0) {
      setActiveTabIndex(existingIndex)
    } else {
      setOpenTabs(prev => [...prev, session])
      setActiveTabIndex(openTabs.length)
    }
    setShowList(false)
  }, [openTabs])

  const closeTab = useCallback(async (index: number) => {
    const session = openTabs[index]
    if (!session) return

    const sessionDir = session.type === 'review' ? `review-pr-${session.pr}` : `task-${session.task}`
    try {
      await fetch('/api/cw/terminal/kill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: session.project, sessionDir })
      })
    } catch {}

    const newTabs = openTabs.filter((_, i) => i !== index)
    setOpenTabs(newTabs)

    if (newTabs.length === 0) {
      setShowList(true)
      setActiveTabIndex(0)
      onFetchData()
    } else {
      setActiveTabIndex(Math.min(index, newTabs.length - 1))
    }
  }, [openTabs, onFetchData])

  const goToList = useCallback(() => {
    setShowList(true)
    onFetchData()
  }, [onFetchData])

  const switchToTab = useCallback((index: number) => {
    setActiveTabIndex(index)
    setShowList(false)
  }, [])

  // Keyboard shortcuts: Cmd+1..5, Cmd+←/→, Cmd+W, Cmd+L
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (openTabs.length === 0 || showList) return
      const mod = e.metaKey || e.ctrlKey

      if (mod && e.key >= '1' && e.key <= '5') {
        const idx = parseInt(e.key) - 1
        if (idx < openTabs.length) {
          e.preventDefault()
          setActiveTabIndex(idx)
        }
        return
      }

      if (mod && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault()
        setActiveTabIndex(prev => {
          if (e.key === 'ArrowLeft') return prev > 0 ? prev - 1 : openTabs.length - 1
          return prev < openTabs.length - 1 ? prev + 1 : 0
        })
        return
      }

      if (mod && e.key === 'w') {
        e.preventDefault()
        closeTab(activeTabIndex)
        return
      }

      if (mod && e.key === 'l') {
        e.preventDefault()
        goToList()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [openTabs, showList, activeTabIndex, closeTab, goToList])

  const openTabKeys = new Set(openTabs.map(sessionKey))

  return {
    openTabs,
    activeTabIndex,
    setActiveTabIndex,
    showList,
    openTab,
    closeTab,
    goToList,
    switchToTab,
    openTabKeys,
  }
}
