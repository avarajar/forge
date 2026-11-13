#!/usr/bin/env node
// Builds Forge.app for this Mac: main process in one file (core inlined), the console, the bundled
// modules' manifests and node-pty, packaged with @electron/packager and signed ad hoc (no Apple account).
//   pnpm app            → out/Forge-darwin-<arch>/Forge.app
//   pnpm app:install    → also copies it to ~/Applications

import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { build } from 'esbuild'
import { packager } from '@electron/packager'

const root = join(import.meta.dirname, '..')
const repo = join(root, '..', '..')
const out = join(root, 'out')
const stage = join(out, 'stage')
const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
const install = process.argv.includes('--install')

const require = createRequire(import.meta.url)
const electronVersion = JSON.parse(readFileSync(require.resolve('electron/package.json'), 'utf-8')).version
const { version } = JSON.parse(readFileSync(join(repo, 'packages', 'platform', 'package.json'), 'utf-8'))

execFileSync('pnpm', ['build'], { cwd: repo, stdio: 'inherit' })

rmSync(out, { recursive: true, force: true })
mkdirSync(stage, { recursive: true })

// electron is the runtime; node-pty is native and is copied as is
await build({
  entryPoints: [join(root, 'src', 'main.ts')],
  outfile: join(stage, 'main.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: ['electron', 'node-pty'],
  // CommonJS dependencies inlined into an ES module still call require()
  banner: { js: "import { createRequire as __forgeRequire } from 'node:module'; const require = __forgeRequire(import.meta.url);" },
  logLevel: 'warning',
})
writeFileSync(join(stage, 'package.json'), JSON.stringify({ name: 'forge', productName: 'Forge', version, type: 'module', main: 'main.js' }, null, 2))
console.log('Bundled the main process into main.js')

const consoleDist = join(repo, 'packages', 'console', 'dist')
if (!existsSync(join(consoleDist, 'index.html'))) throw new Error('the console build left no packages/console/dist')
cpSync(consoleDist, join(stage, 'console'), { recursive: true })

// only the manifest, as the npm package does: the server runs its actions, the console carries the panels
const { BUNDLED_MODULES } = await import(join(repo, 'packages', 'core', 'dist', 'modules.js'))
for (const name of BUNDLED_MODULES) {
  cpSync(join(repo, 'modules', name, 'forge-module.json'), join(stage, 'modules', name, 'forge-module.json'))
}

// node-pty loads its prebuilt N-API binary from prebuilds/<platform>-<arch>; nothing else is needed at runtime
const coreRequire = createRequire(join(repo, 'packages', 'core', 'package.json'))
const ptyDir = realpathSync(dirname(coreRequire.resolve('node-pty/package.json')))
const ptyOut = join(stage, 'node_modules', 'node-pty')
for (const entry of ['package.json', 'LICENSE', 'lib', `prebuilds/darwin-${arch}`]) {
  cpSync(join(ptyDir, entry), join(ptyOut, entry), { recursive: true })
}
console.log('Copied the console, modules and node-pty')

const [appDir] = await packager({
  dir: stage,
  out,
  name: 'Forge',
  executableName: 'Forge',
  appBundleId: 'dev.forge.desktop',
  appVersion: version,
  appCategoryType: 'public.app-category.developer-tools',
  icon: join(root, 'build', 'icon.icns'),
  platform: 'darwin',
  arch,
  electronVersion,
  asar: false,
  prune: false,
  overwrite: true,
  quiet: true,
})
const appPath = join(appDir, 'Forge.app')

// Apple Silicon refuses to run unsigned code; an ad hoc signature is enough on the machine that built it
execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' })
console.log(`Built ${appPath}`)

if (install) {
  const target = join(homedir(), 'Applications', 'Forge.app')
  mkdirSync(dirname(target), { recursive: true })
  rmSync(target, { recursive: true, force: true })
  execFileSync('ditto', [appPath, target])
  console.log(`Installed ${target}`)
}
