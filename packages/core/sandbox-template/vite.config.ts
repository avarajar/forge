import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

export default defineConfig({
  plugins: [preact()],
  server: {
    port: parseInt(process.env.FORGE_SANDBOX_PORT ?? '5173', 10),
    strictPort: true,
    host: '127.0.0.1',
  },
})
