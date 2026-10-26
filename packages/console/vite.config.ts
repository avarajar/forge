import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import UnoCSS from 'unocss/vite'
import { SHARED_ENTRIES, SHARED_NAMES } from './shared-packages.js'

const importMap = JSON.stringify({ imports: Object.fromEntries(SHARED_ENTRIES.map(e => [e.name, `/shared/${e.file}.js`])) })

export default defineConfig({
  plugins: [
    preact(),
    UnoCSS(),
    {
      name: 'forge-import-map',
      apply: 'build',
      transformIndexHtml: () => [
        { tag: 'script', attrs: { type: 'importmap' }, children: importMap, injectTo: 'head-prepend' },
        { tag: 'link', attrs: { rel: 'stylesheet', href: '/shared/forge-ui.css' }, injectTo: 'head' },
      ],
    },
  ],
  resolve: {
    dedupe: ['preact', '@preact/signals']
  },
  build: {
    outDir: 'dist',
    emptyDirOnBuild: true,
    rollupOptions: { external: SHARED_NAMES }
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
