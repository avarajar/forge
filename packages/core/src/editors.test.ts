import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { detectEditors, openInEditor, type EditorProbe } from './editors.js'

const probe = (over: Partial<EditorProbe>): EditorProbe => ({
  onPath: () => null, appExists: () => false, platform: 'linux', ...over,
})

describe('detectEditors', () => {
  it('uses a CLI found on PATH', () => {
    const found = detectEditors(probe({ onPath: cli => cli === 'code' ? '/usr/local/bin/code' : null }))
    expect(found).toEqual([{ id: 'vscode', label: 'VS Code', bin: '/usr/local/bin/code', args: [] }])
  })

  it('falls back to open -a for a macOS app without a CLI', () => {
    const found = detectEditors(probe({ platform: 'darwin', appExists: app => app === 'Cursor.app' }))
    expect(found).toEqual([{ id: 'cursor', label: 'Cursor', bin: 'open', args: ['-a', 'Cursor'] }])
  })

  it('ignores app bundles off macOS', () => {
    expect(detectEditors(probe({ platform: 'linux', appExists: () => true }))).toEqual([])
  })

  it('keeps the table order: VS Code, Cursor, Windsurf, Zed', () => {
    const found = detectEditors(probe({ onPath: cli => `/bin/${cli}` }))
    expect(found.map(e => e.id)).toEqual(['vscode', 'cursor', 'windsurf', 'zed'])
  })
})

describe('openInEditor', () => {
  it('resolves once the editor process starts', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'forge-editor-'))
    try {
      await expect(openInEditor({ id: 'vscode', label: 'VS Code', bin: '/bin/sh', args: ['-c', 'exit 0'] }, dir)).resolves.toBeUndefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('rejects when the binary does not exist', async () => {
    await expect(openInEditor({ id: 'zed', label: 'Zed', bin: '/nonexistent/zed', args: [] }, tmpdir())).rejects.toThrow()
  })
})
