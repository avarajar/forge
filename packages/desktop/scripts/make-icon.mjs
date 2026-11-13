// Renders build/icon.svg into build/icon.icns. Run with Electron: `electron scripts/make-icon.mjs`
import { app, BrowserWindow } from 'electron'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const buildDir = join(import.meta.dirname, '..', 'build')
const svg = readFileSync(join(buildDir, 'icon.svg'), 'utf-8')

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1024, height: 1024, show: false, frame: false, transparent: true, useContentSize: true, webPreferences: { offscreen: true } })
  win.webContents.setZoomFactor(1)
  await win.loadURL('data:text/html,' + encodeURIComponent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`))
  await new Promise((r) => setTimeout(r, 300))
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 })
  const png = image.resize({ width: 1024, height: 1024 }).toPNG()

  const iconset = join(buildDir, 'icon.iconset')
  rmSync(iconset, { recursive: true, force: true })
  mkdirSync(iconset)
  const master = join(buildDir, 'icon.png')
  writeFileSync(master, png)
  for (const size of [16, 32, 128, 256, 512]) {
    for (const scale of [1, 2]) {
      const px = size * scale
      const name = scale === 1 ? `icon_${size}x${size}.png` : `icon_${size}x${size}@2x.png`
      execFileSync('sips', ['-z', String(px), String(px), master, '--out', join(iconset, name)], { stdio: 'ignore' })
    }
  }
  execFileSync('iconutil', ['-c', 'icns', iconset, '-o', join(buildDir, 'icon.icns')])
  rmSync(iconset, { recursive: true, force: true })
  console.log('Wrote build/icon.icns and build/icon.png')
  app.quit()
})
