#!/usr/bin/env node
// Assembles the published package: Forge's server in one file (dist/index.js, with the workspace
// packages inlined and npm dependencies left as imports), the built console, the bundled modules (manifest, plus package.json and dist for v1), and CW.
// Run by `prepack`: builds the workspace first, so core and the console are never stale.

import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { build } from 'esbuild'

const root = join(import.meta.dirname, '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'))

execFileSync('pnpm', ['build'], { cwd: join(root, '..', '..'), stdio: 'inherit' })

const consoleDist = join(root, '..', 'console', 'dist')
if (!existsSync(join(consoleDist, 'index.html'))) throw new Error('the console build left no packages/console/dist')

// every npm dependency stays external, including its subpaths (hono/cors, @hono/node-server/serve-static)
const external = Object.keys(pkg.dependencies ?? {}).flatMap(name => [name, `${name}/*`])

// drop tsc's declarations and maps, which describe the unbundled build
rmSync(join(root, 'dist'), { recursive: true, force: true })

await build({
  entryPoints: [join(root, 'src', 'index.ts')],
  outfile: join(root, 'dist', 'index.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external,
  logLevel: 'warning',
})
console.log('Bundled the server into dist/index.js')

rmSync(join(root, 'console'), { recursive: true, force: true })
cpSync(consoleDist, join(root, 'console'), { recursive: true })
console.log('Copied the console into console/')

// legacy modules ship only the manifest: the server runs their actions, the console carries the panels
const { BUNDLED_MODULES, BUNDLED_V1_MODULES } = await import('../../core/dist/modules.js')
rmSync(join(root, 'modules'), { recursive: true, force: true })
for (const name of BUNDLED_MODULES) {
  cpSync(join(root, '..', '..', 'modules', name, 'forge-module.json'), join(root, 'modules', name, 'forge-module.json'))
}
// v1 modules run in Forge's process, so they carry their package.json and build
for (const name of BUNDLED_V1_MODULES) {
  const from = join(root, '..', '..', 'modules', name)
  if (!existsSync(join(from, 'dist'))) throw new Error(`${name} has no dist: build it first`)
  for (const entry of ['forge-module.json', 'package.json', 'dist']) cpSync(join(from, entry), join(root, 'modules', name, entry), { recursive: true })
}
console.log(`Copied ${[...BUNDLED_MODULES, ...BUNDLED_V1_MODULES].join(', ')} into modules/`)

execFileSync(process.execPath, [join(import.meta.dirname, 'bundle-cw.mjs')], { stdio: 'inherit' })
