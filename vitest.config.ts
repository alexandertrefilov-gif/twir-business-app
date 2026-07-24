// vitest.config.ts
import { defineConfig } from 'vitest/config'
import path             from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals:     true,
    setupFiles:  ['./tests/setup.ts'],
    coverage: {
      provider:  'v8',
      reporter:  ['text', 'json', 'html'],
      include:   ['lib/**/*.ts'],
      exclude:   ['lib/db/**', 'lib/pdf-templates/**'],
      // Minimum coverage thresholds für GO/NO-GO
      thresholds: {
        statements: 70,
        branches:   65,
        functions:  70,
        lines:      70,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
