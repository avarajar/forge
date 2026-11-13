import { app, BrowserWindow, Menu, Tray, nativeImage, shell, type MenuItemConstructorOptions } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { loginShellPath, mergePath } from './shell-path.js'

// From a checkout (pnpm start) the console and the bundled modules are the repo's; the packaged app
// carries its own copies next to main.js (scripts/pack.mjs)
const appRoot = app.isPackaged ? app.getAppPath() : join(import.meta.dirname, '..')
const consoleDist = app.isPackaged ? join(appRoot, 'console') : join(appRoot, '../console/dist')
const bundledModulesDir = app.isPackaged ? join(appRoot, 'modules') : join(appRoot, '../../modules')
const forgeVersion = (JSON.parse(readFileSync(join(appRoot, app.isPackaged ? 'package.json' : '../platform/package.json'), 'utf-8')) as { version: string }).version

const DEFAULT_PORT = 3000
const ATTENTION = new Set(['waiting', 'permission', 'error'])

let window: BrowserWindow | null = null
let tray: Tray | null = null
let baseUrl = ''
let stopServer: (() => void) | null = null
let quitting = false

if (!app.requestSingleInstanceLock()) app.quit()
app.on('second-instance', () => showWindow())

async function startForge(): Promise<string> {
  const shellPath = await loginShellPath()
  const core = await import('@forge-dev/core')
  core.quietSqliteWarning()
  const cwHome = join(process.env.HOME ?? homedir(), '.cw')
  process.env.PATH = core.pathWithCw(cwHome, mergePath(shellPath, process.env.PATH))

  if (!existsSync(join(consoleDist, 'index.html'))) throw new Error(`No console build in ${consoleDist}; run pnpm build first`)
  const port = parseInt(process.env.FORGE_PORT ?? String(DEFAULT_PORT), 10)
  // FORGE_DB_URL is ignored on purpose: the app is local, team mode is the npm package's
  const started = await core.startForge({ port, version: forgeVersion, consoleDist, bundledModulesDir, fallbackToFreePort: true })
  // A Forge already running (npx forge-cw, cw forge) keeps its terminals; the window just shows it
  if (started.status === 'in-use') return `http://localhost:${port}`
  // only with FORGE_HOST in the app's environment; the error dialog shows the reason
  if (started.status === 'refused') throw new Error(started.reason)
  stopServer = started.close
  return started.url
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Forge',
    backgroundColor: '#0f0f10',
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false }
  })
  win.once('ready-to-show', () => win.show())

  // Forge pages stay in the app; GitHub, Linear, kioku web and the rest open in the browser
  const isForge = (url: string) => url === baseUrl || url.startsWith(`${baseUrl}/`)
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isForge(url)) return { action: 'allow' }
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (isForge(url)) return
    event.preventDefault()
    void shell.openExternal(url)
  })

  // Closing the window keeps Forge and its terminals running; Quit stops them
  win.on('close', (event) => {
    if (quitting) return
    event.preventDefault()
    win.hide()
  })

  void win.loadURL(baseUrl)
  return win
}

function showWindow(): void {
  if (!baseUrl) return
  if (!window || window.isDestroyed()) window = createWindow()
  window.show()
  window.focus()
}

// The console uses ⌘W (close tab), ⌘K, ⌘J, ⌘L; the menu must not take them
function buildMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Forge',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { label: 'Close Window', accelerator: 'Cmd+Shift+W', click: () => window?.hide() },
        { type: 'separator' },
        { label: 'Open in Browser', click: () => { void shell.openExternal(baseUrl) } }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

interface StateEntry { state: string }

// Menu bar item: how many sessions wait on the person, and which
async function refreshTray(): Promise<void> {
  if (!tray || !baseUrl) return
  let states: Record<string, StateEntry> = {}
  try {
    const res = await fetch(`${baseUrl}/api/cw/session-states`)
    if (res.ok) states = ((await res.json()) as { states: Record<string, StateEntry> }).states ?? {}
  } catch { /* server not up yet */ }

  const waiting = Object.entries(states).filter(([, s]) => ATTENTION.has(s.state))
  const live = Object.values(states).filter((s) => s.state !== 'exited').length
  tray.setTitle(waiting.length ? ` ${waiting.length}` : '')
  tray.setToolTip(waiting.length ? `${waiting.length} session(s) need you` : `Forge — ${live} live session(s)`)
  app.dock?.setBadge(waiting.length ? String(waiting.length) : '')

  const items: MenuItemConstructorOptions[] = waiting.length
    ? waiting.map(([key, s]) => ({ label: `${key.replace('::', ' / ')} — ${s.state}`, click: showWindow }))
    : [{ label: live ? `${live} live session(s), none waiting` : 'No live sessions', enabled: false }]
  tray.setContextMenu(Menu.buildFromTemplate([
    ...items,
    { type: 'separator' },
    { label: 'Open Forge', click: showWindow },
    { label: 'Open in Browser', click: () => { void shell.openExternal(baseUrl) } },
    { type: 'separator' },
    { label: 'Quit Forge', role: 'quit' }
  ]))
}

function createTray(): void {
  // A template image follows the menu bar's light/dark appearance
  const icon = nativeImage.createFromDataURL(TRAY_ICON).resize({ width: 16, height: 16 })
  icon.setTemplateImage(true)
  tray = new Tray(icon)
  void refreshTray()
  setInterval(() => { void refreshTray() }, 3000)
}

// 16×16 anvil-ish glyph, black on transparent (template image)
const TRAY_ICON = 'data:image/svg+xml;base64,' + Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 16 16">' +
  '<path d="M2 4h9c0 1.7 1.3 3 3 3v1H9.5L8.5 10H11v2H4v-2h2.5L5.5 8C3.6 8 2 6.4 2 4.5z" fill="#000"/></svg>'
).toString('base64')

app.on('before-quit', () => {
  quitting = true
  stopServer?.()
})

app.on('activate', () => showWindow())

app.whenReady().then(async () => {
  // the packaged app gets its icon from the bundle; `pnpm start` runs the stock Electron.app
  if (!app.isPackaged) app.dock?.setIcon(join(appRoot, 'build', 'icon.png'))
  buildMenu()
  try {
    baseUrl = await startForge()
  } catch (err) {
    const { dialog } = await import('electron')
    dialog.showErrorBox('Forge could not start', err instanceof Error ? err.message : String(err))
    app.exit(1)
    return
  }
  createTray()
  showWindow()
}).catch((err) => {
  console.error(err)
  app.exit(1)
})
