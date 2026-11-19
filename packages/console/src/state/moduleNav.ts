import { signal } from '@preact/signals'

// what a module view asked the console to open; `n` makes a repeated request a new value
export const sessionRequest = signal<{ project: string; sessionDir: string; n: number } | null>(null)
export const pageRequest = signal<{ moduleId: string; n: number } | null>(null)

let counter = 0
export const requestSession = (project: string, sessionDir: string) => { sessionRequest.value = { project, sessionDir, n: ++counter } }
export const requestPage = (moduleId: string) => { pageRequest.value = { moduleId, n: ++counter } }
