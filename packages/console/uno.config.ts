import { defineConfig, presetUno, presetIcons } from 'unocss'

const tokens = ['bg', 'bg-2', 'card', 'card-2', 'elev', 'hair', 'hair-2', 'ink', 'ink-2', 'ink-3', 'blue', 'blue-2', 'green', 'orange', 'red', 'purple', 'teal', 'term']

export default defineConfig({
  presets: [
    presetUno(),
    presetIcons({ scale: 1.2 })
  ],
  theme: {
    colors: {
      ...Object.fromEntries(tokens.map(t => [t.replace('-', ''), `var(--${t})`])),
    },
    fontFamily: {
      sans: 'var(--font)',
      mono: 'var(--mono)'
    }
  },
  rules: [
    ['shadow-s', { 'box-shadow': 'var(--shadow-s)' }],
    ['shadow-m', { 'box-shadow': 'var(--shadow-m)' }],
    ['shadow-l', { 'box-shadow': 'var(--shadow-l)' }],
    ['ease-spring', { 'transition-timing-function': 'var(--ease)' }],
    ['glass', { 'background': 'var(--glass)', 'backdrop-filter': 'blur(22px) saturate(180%)', '-webkit-backdrop-filter': 'blur(22px) saturate(180%)' }],
    ['tnum', { 'font-variant-numeric': 'tabular-nums' }],
    ['breathe', { animation: 'breathe 2.4s ease-in-out infinite' }],
  ],
})
