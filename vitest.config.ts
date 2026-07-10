import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    // TODO(Task 2): enable globalSetup once container.ts exists
    // globalSetup: ['server/test/helpers/container.ts'],
    hookTimeout: 120_000,
    testTimeout: 60_000,
    fileParallelism: false,
  },
});
