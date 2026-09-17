import { signal } from '@preact/signals'
import type { QuickType } from '../config/types.js'

// shared by the start card and the new-task drawer
export const startInput = signal('')
export const typeOverride = signal<QuickType | null>(null)
// the project and account last picked in the start card; empty means none chosen yet
export const startProject = signal('')
export const startAccount = signal('')

export const setStartInput = (value: string) => {
  startInput.value = value
  typeOverride.value = null
}
