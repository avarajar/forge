// packages/core/src/sandbox-types.ts

export type SandboxState =
  | 'creating'
  | 'ready'
  | 'generating'
  | 'live'
  | 'shared'
  | 'archived'
  | 'deleted'

export type InputType = 'description' | 'figma' | 'screenshot' | 'url' | 'components'

export interface SandboxInput {
  type: InputType
  text?: string
  figmaUrl?: string
  imagePath?: string
  url?: string
  components?: { path: string; name: string }[]
}

export interface Sandbox {
  id: string
  projectId: string | null
  name: string
  state: SandboxState
  port: number | null
  dir: string
  input: SandboxInput
  createdAt: string
  updatedAt: string
  prUrl: string | null
  previewUrl: string | null
  branch: string | null
}

export interface SandboxConfig {
  templateDir: string
  sandboxBaseDir: string
  portRangeStart: number
}
