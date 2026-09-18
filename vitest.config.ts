// vitest.config.ts
import { defineConfig } from 'vitest/config'
import path             from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals:     true,
    setupFiles:  ['./tests/setup.ts'],
    // next.config.mjs setzt output:'standalone' (CP17); da STORAGE_LOCAL_PATH
    // ein zur Build-Zeit nicht statisch auflösbarer Pfad ist, kopiert Next.js'
    // Datei-Tracer vorsorglich weite Teile des Projekts (inkl. tests/) nach
    // .next/standalone — sonst würde Vitest doppelte, dort nicht lauffähige
    // Kopien der Testdateien einsammeln.
    exclude: [
      '**/node_modules/**', '**/dist/**', '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
      '.next/**', '.next-dev/**',
    ],
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
