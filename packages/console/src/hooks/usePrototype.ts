import { useState, useCallback, useRef, useEffect } from 'preact/hooks'

export type SandboxState = 'idle' | 'creating' | 'ready' | 'generating' | 'live' | 'shared' | 'archived'
export type InputType = 'description' | 'figma' | 'screenshot' | 'url' | 'components'

export interface PrototypeSandbox {
  id: string
  name: string
  state: SandboxState
  port: number | null
  dir: string
  prUrl: string | null
  previewUrl: string | null
}

interface UsePrototypeReturn {
  sandbox: PrototypeSandbox | null
  state: SandboxState
  error: string | null
  create: (name: string, inputType: InputType, inputData: Record<string, unknown>, projectId?: string) => Promise<void>
  generate: (inputType: InputType, inputData: Record<string, unknown>) => Promise<void>
  regenerate: (inputType: InputType, inputData: Record<string, unknown>) => Promise<void>
  archive: () => Promise<void>
  remove: () => Promise<void>
  share: (prUrl: string, branch: string, previewUrl?: string) => Promise<void>
}

export function usePrototype(): UsePrototypeReturn {
  const [sandbox, setSandbox] = useState<PrototypeSandbox | null>(null)
  const [state, setState] = useState<SandboxState>('idle')
  const [error, setError] = useState<string | null>(null)
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current !== null) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
  }, [])

  // Poll when state is 'generating'; stop when it changes away from 'generating'
  useEffect(() => {
    if (state !== 'generating' || !sandbox) {
      stopPolling()
      return
    }

    const id = sandbox.id
    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/prototype/${id}`)
        if (!res.ok) return
        const data = (await res.json()) as PrototypeSandbox
        setSandbox(data)
        if (data.state !== 'generating') {
          setState(data.state)
        }
      } catch {
        // silently ignore transient poll errors
      }
    }, 2000)

    return () => {
      stopPolling()
    }
  }, [state, sandbox?.id, stopPolling])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPolling()
    }
  }, [stopPolling])

  const create = useCallback(
    async (name: string, inputType: InputType, inputData: Record<string, unknown>, projectId?: string) => {
      setError(null)
      setState('creating')
      try {
        const createRes = await fetch('/api/prototype/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, inputType, inputData, projectId }),
        })
        if (!createRes.ok) {
          const msg = await createRes.text()
          throw new Error(msg || 'Failed to create prototype')
        }
        const created = (await createRes.json()) as PrototypeSandbox

        const startRes = await fetch(`/api/prototype/${created.id}/start-server`, {
          method: 'POST',
        })
        if (!startRes.ok) {
          const msg = await startRes.text()
          throw new Error(msg || 'Failed to start prototype server')
        }
        const started = (await startRes.json()) as PrototypeSandbox

        setSandbox(started)
        setState(started.state ?? 'ready')
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        setState('idle')
      }
    },
    [],
  )

  const generate = useCallback(
    async (inputType: InputType, inputData: Record<string, unknown>) => {
      if (!sandbox) return
      setError(null)
      setState('generating')
      try {
        const res = await fetch(`/api/prototype/${sandbox.id}/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inputType, inputData }),
        })
        if (!res.ok) {
          const msg = await res.text()
          throw new Error(msg || 'Failed to generate prototype')
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        setState(sandbox.state ?? 'ready')
      }
    },
    [sandbox],
  )

  const regenerate = useCallback(
    async (inputType: InputType, inputData: Record<string, unknown>) => {
      if (!sandbox) return
      setError(null)
      setState('generating')
      try {
        const res = await fetch(`/api/prototype/${sandbox.id}/regenerate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inputType, inputData }),
        })
        if (!res.ok) {
          const msg = await res.text()
          throw new Error(msg || 'Failed to regenerate prototype')
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        setState(sandbox.state ?? 'ready')
      }
    },
    [sandbox],
  )

  const archive = useCallback(async () => {
    if (!sandbox) return
    setError(null)
    try {
      const res = await fetch(`/api/prototype/${sandbox.id}/archive`, {
        method: 'POST',
      })
      if (!res.ok) {
        const msg = await res.text()
        throw new Error(msg || 'Failed to archive prototype')
      }
      setSandbox(prev => (prev ? { ...prev, state: 'archived' } : prev))
      setState('archived')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [sandbox])

  const remove = useCallback(async () => {
    if (!sandbox) return
    setError(null)
    try {
      const res = await fetch(`/api/prototype/${sandbox.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const msg = await res.text()
        throw new Error(msg || 'Failed to remove prototype')
      }
      setSandbox(null)
      setState('idle')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [sandbox])

  const share = useCallback(
    async (prUrl: string, branch: string, previewUrl?: string) => {
      if (!sandbox) return
      setError(null)
      try {
        const res = await fetch(`/api/prototype/${sandbox.id}/share`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prUrl, branch, previewUrl }),
        })
        if (!res.ok) {
          const msg = await res.text()
          throw new Error(msg || 'Failed to share prototype')
        }
        setSandbox(prev =>
          prev ? { ...prev, state: 'shared', prUrl, previewUrl: previewUrl ?? prev.previewUrl } : prev,
        )
        setState('shared')
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    },
    [sandbox],
  )

  return {
    sandbox,
    state,
    error,
    create,
    generate,
    regenerate,
    archive,
    remove,
    share,
  }
}
