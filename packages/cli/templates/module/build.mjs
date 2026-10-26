// builds the server half for Node and the view for the browser; the view leaves Forge's shared packages to the import map
import { context, build } from 'esbuild'
import { SHARED_PACKAGES } from '@forge-dev/sdk'

const SHARED = [...SHARED_PACKAGES]
const watch = process.argv.includes('--watch')

const configs = [
  { entryPoints: ['src/server.ts'], outfile: 'dist/server.js', platform: 'node', format: 'esm', bundle: true, target: 'node22' },
  { entryPoints: ['src/view.tsx'], outfile: 'dist/view.js', platform: 'browser', format: 'esm', bundle: true, target: 'es2022', jsx: 'automatic', jsxImportSource: 'preact', external: SHARED },
]

if (watch) {
  for (const c of configs) await (await context(c)).watch()
  console.log('Watching src/ for changes')
} else {
  await Promise.all(configs.map(c => build(c)))
}
