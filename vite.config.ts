import path from 'node:path'
import { defineConfig } from 'vite-plus'

export default defineConfig({
  test: {
    alias: {
      zile: path.resolve(import.meta.dirname, 'src'),
    },
    environment: 'node',
    exclude: ['**/node_modules/**', '**/dist/**', 'template/**'],
    globals: true,
    globalSetup: path.resolve(import.meta.dirname, 'test/setup.global.ts'),
    setupFiles: [path.resolve(import.meta.dirname, 'test/setup.ts')],
    testTimeout: 30_000,
  },
  lint: {
    ignorePatterns: ['dist/**', 'template/**', 'test/repos/**'],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {
    ignorePatterns: ['dist/**', 'template/**'],
    printWidth: 100,
    semi: false,
    singleQuote: true,
    sortPackageJson: false,
  },
})
