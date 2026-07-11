import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    globalSetup: ['server/test/helpers/container.ts'],
    hookTimeout: 120_000,
    testTimeout: 60_000,
    fileParallelism: false,
  },
});
