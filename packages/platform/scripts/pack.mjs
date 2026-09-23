#!/usr/bin/env node
// Assembles the published package: Forge's server in one file (dist/index.js, with the workspace
// packages inlined and npm dependencies left as imports), the built console, and CW.
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

execFileSync(process.execPath, [join(import.meta.dirname, 'bundle-cw.mjs')], { stdio: 'inherit' })
