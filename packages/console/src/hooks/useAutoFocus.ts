import { useEffect, useRef } from 'preact/hooks'

// the autofocus attribute is ignored once the document has focus, so focus on mount
export function useAutoFocus<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useEffect(() => { ref.current?.focus() }, [])
  return ref
}
