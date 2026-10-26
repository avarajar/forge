// packages the console and every module view share through the import map in index.html
export const SHARED_ENTRIES = [
  { name: 'preact', file: 'preact' },
  { name: 'preact/hooks', file: 'preact-hooks' },
  { name: 'preact/jsx-runtime', file: 'preact-jsx-runtime' },
  { name: 'preact/compat', file: 'preact-compat' },
  { name: '@preact/signals', file: 'preact-signals' },
  { name: '@forge-dev/ui', file: 'forge-ui' },
  { name: '@forge-dev/sdk', file: 'forge-sdk' },
]

export const SHARED_NAMES = SHARED_ENTRIES.map(e => e.name)
