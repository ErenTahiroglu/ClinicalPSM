import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/psm/**', 'src/lib/export/**', 'src/lib/rate-limit.ts'],
      exclude: [
        // Browser-only: require Web Worker / Canvas / DOM APIs — untestable in node
        'src/lib/psm/worker.ts',
        'src/lib/psm/runPsmInWorker.ts',
        'src/lib/export/svg-to-png.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
})
