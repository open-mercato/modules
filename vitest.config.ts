import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['test/e2e/**', 'node_modules/**'],
    environment: 'node',
    // round 14: tests that build the whole search corpus passed 5 s on a Mac busy with an astro build
    testTimeout: 15000,
  },
})
