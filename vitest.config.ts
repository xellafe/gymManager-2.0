import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  define: {
    // Stessa sostituzione usata da electron-vite; in test sono stringhe vuote
    // salvo che la variabile d'ambiente sia impostata manualmente.
    __GOOGLE_CLIENT_ID__: JSON.stringify(process.env.GOOGLE_CLIENT_ID ?? ''),
    __GOOGLE_CLIENT_SECRET__: JSON.stringify(process.env.GOOGLE_CLIENT_SECRET ?? ''),
    __GITHUB_UPDATE_TOKEN__: JSON.stringify(process.env.GITHUB_UPDATE_TOKEN ?? '')
  },
  test: {
    environment: 'node',
    globals: true,
    passWithNoTests: true,
    include: ['tests/unit/**/*.test.ts', 'src/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**', 'out/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/main/**/*.ts']
    }
  },
  resolve: {
    alias: {
      '@main': resolve(__dirname, 'src/main')
    }
  }
})
