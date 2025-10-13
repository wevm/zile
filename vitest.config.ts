import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    alias: {
      zile: path.resolve(import.meta.dirname, 'src'),
    },
    environment: 'node',
    globals: true,
    globalSetup: path.resolve(import.meta.dirname, 'test/setup.global.ts'),
    setupFiles: [path.resolve(import.meta.dirname, 'test/setup.ts')],
  },
})
