// builds the server half for Node; the view is added with its sources
import { context, build } from 'esbuild'

const watch = process.argv.includes('--watch')
const configs = [
  { entryPoints: ['src/server.ts'], outfile: 'dist/server.js', platform: 'node', format: 'esm', bundle: true, target: 'node22' },
]

if (watch) {
  for (const c of configs) await (await context(c)).watch()
  console.log('Watching src/ for changes')
} else {
  await Promise.all(configs.map(c => build(c)))
}
