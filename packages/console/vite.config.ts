import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import UnoCSS from 'unocss/vite'

export default defineConfig({
  plugins: [preact(), UnoCSS()],
  resolve: {
    dedupe: ['preact', '@preact/signals']
  },
  build: {
    outDir: 'dist',
    emptyDirOnBuild: true
  }
})
