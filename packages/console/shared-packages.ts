import { SHARED_PACKAGES } from '@forge-dev/sdk'

// each shared package gets one file under /shared/, named after it
export const SHARED_ENTRIES = SHARED_PACKAGES.map(name => ({ name, file: name.replace(/^@/, '').replace(/\//g, '-') }))

export const SHARED_NAMES: string[] = [...SHARED_PACKAGES]
