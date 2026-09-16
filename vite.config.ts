import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Приложение полностью клиентское: оно обращается к api.github.com напрямую.
// base: './' — чтобы сборку можно было положить в подпапку (GitHub Pages и т.п.).
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    // превью-прокси в песочнице приходит со своим Host, поэтому проверку хоста отключаем
    allowedHosts: true,
    cors: true,
  },
  preview: {
    host: true,
    port: 4173,
    strictPort: true,
    allowedHosts: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    testTimeout: 20_000,
  },
})
