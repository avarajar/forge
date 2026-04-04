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
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true
      }
    }
  }
})
