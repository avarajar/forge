import { spawn } from 'node:child_process'
import { accessSync, constants, existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'

export interface EditorDef { id: string; label: string; cli: string; app: string }

export const EDITORS: EditorDef[] = [
  { id: 'vscode', label: 'VS Code', cli: 'code', app: 'Visual Studio Code.app' },
  { id: 'cursor', label: 'Cursor', cli: 'cursor', app: 'Cursor.app' },
  { id: 'windsurf', label: 'Windsurf', cli: 'windsurf', app: 'Windsurf.app' },
  { id: 'zed', label: 'Zed', cli: 'zed', app: 'Zed.app' },
]

export interface DetectedEditor { id: string; label: string; bin: string; args: string[] }

export interface EditorProbe {
  onPath: (cli: string) => string | null
  appExists: (app: string) => boolean
  platform: NodeJS.Platform
}

export function detectEditors(probe: EditorProbe): DetectedEditor[] {
  const found: DetectedEditor[] = []
  for (const def of EDITORS) {
    const cliPath = probe.onPath(def.cli)
    if (cliPath) {
      found.push({ id: def.id, label: def.label, bin: cliPath, args: [] })
    } else if (probe.platform === 'darwin' && probe.appExists(def.app)) {
      found.push({ id: def.id, label: def.label, bin: 'open', args: ['-a', def.app.replace(/\.app$/, '')] })
    }
  }
  return found
}

export const systemProbe: EditorProbe = {
  onPath: (cli) => {
    for (const dir of (process.env.PATH ?? '').split(delimiter)) {
      if (!dir) continue
      const candidate = join(dir, cli)
      try {
        accessSync(candidate, constants.X_OK)
        return candidate
      } catch {
        // not in this directory
      }
    }
    return null
  },
  appExists: (app) => existsSync(join('/Applications', app)),
  platform: process.platform,
}

export function openInEditor(editor: DetectedEditor, dir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(editor.bin, [...editor.args, dir], { detached: true, stdio: 'ignore' })
    child.once('error', reject)
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })
}
