import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { SHARED_ENTRIES } from './shared-packages.js'

// one ES build of the packages modules share with the console, so Preact exists once
export default defineConfig({
  plugins: [preact({ devToolsEnabled: false })],
  build: {
    outDir: 'dist/shared',
    emptyOutDir: true,
    copyPublicDir: false,
    rollupOptions: {
      input: Object.fromEntries(SHARED_ENTRIES.map(e => [e.file, e.name])),
      preserveEntrySignatures: 'strict',
      output: {
        format: 'es',
        entryFileNames: '[name].js',
        chunkFileNames: 'chunk-[hash].js',
        assetFileNames: '[name][extname]',
      },
    },
  },
})
