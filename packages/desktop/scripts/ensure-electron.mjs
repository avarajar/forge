// pnpm 11 does not always run electron's install script, even with `electron: true` in allowBuilds,
// which leaves the package without its binary. Download it when it is missing.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const electronDir = dirname(createRequire(import.meta.url).resolve('electron/package.json'))
if (!existsSync(join(electronDir, 'path.txt'))) {
  console.log('Downloading the Electron binary…')
  execFileSync(process.execPath, [join(electronDir, 'install.js')], { cwd: electronDir, stdio: 'inherit' })
}
