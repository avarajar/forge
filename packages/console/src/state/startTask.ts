import { signal } from '@preact/signals'
import type { QuickType } from '../config/types.js'

// shared by the start card and the new-task drawer
export const startInput = signal('')
export const typeOverride = signal<QuickType | null>(null)

export const setStartInput = (value: string) => {
  startInput.value = value
  typeOverride.value = null
}
