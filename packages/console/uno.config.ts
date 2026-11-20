import { defineConfig, presetUno, presetIcons } from 'unocss'

const tokens = ['bg', 'bg-2', 'card', 'card-2', 'elev', 'well', 'hair', 'hair-2', 'hair-soft', 'ink', 'ink-2', 'ink-3', 'ink-4', 'blue', 'blue-2', 'blue-ink', 'green', 'orange', 'red', 'purple', 'teal', 'indigo', 'focus', 'term']

export default defineConfig({
  // ui is shared through the import map, so its sources are scanned here instead of through the bundle
  content: { filesystem: ['../ui/src/**/*.tsx'] },
  presets: [
    presetUno(),
    presetIcons({ scale: 1.2 })
  ],
  theme: {
    colors: {
      ...Object.fromEntries(tokens.map(t => [t.replaceAll('-', ''), `var(--${t})`])),
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
    ['popover', { 'background': 'var(--glass)', 'backdrop-filter': 'blur(30px) saturate(180%)', '-webkit-backdrop-filter': 'blur(30px) saturate(180%)', 'border': '0', 'box-shadow': 'var(--shadow-l)', 'animation': 'popIn .2s var(--ease) both' }],
    ['shadow-card', { 'box-shadow': 'var(--shadow-card)' }],
    ['shadow-primary', { 'box-shadow': 'var(--shadow-primary)' }],
    ['chrome-edge', { 'box-shadow': 'var(--chrome-edge)' }],
    [/^rounded-(xs|sm|md|lg|xl|pill)$/, ([, r]) => ({ 'border-radius': `var(--r-${r})` })],
    [/^text-(micro|meta|body|row|head|title)$/, ([, s]) => ({ 'font-size': `var(--fs-${s})`, 'line-height': `var(--lh-${s})` })],
    ['breathe', { animation: 'breathe 2.4s ease-in-out infinite' }],
  ],
})
