import { defineConfig, presetUno, presetIcons } from 'unocss'

export default defineConfig({
  presets: [
    presetUno(),
    presetIcons({ scale: 1.2 })
  ],
  theme: {
    colors: {
      forge: {
        bg: 'var(--forge-bg)',
        surface: 'var(--forge-surface)',
        border: 'var(--forge-border)',
        text: 'var(--forge-text)',
        muted: 'var(--forge-muted)',
        accent: 'var(--forge-accent)',
        success: 'var(--forge-success)',
        warning: 'var(--forge-warning)',
        error: 'var(--forge-error)'
      }
    }
  }
})
