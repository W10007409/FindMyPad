import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    // 루트 스위트는 서버(node 환경)만 대상으로 한다. dashboard는 자체 vitest 설정(jsdom+MSW)으로
    // `cd dashboard && npm test`로 실행 — 여기서 쓸어담으면 document/localStorage 미정의로 실패한다.
    include: ['server/test/**/*.test.ts'],
    exclude: ['dashboard/**', 'node_modules/**', 'android-agent/**'],
    globalSetup: ['server/test/helpers/container.ts'],
    hookTimeout: 120_000,
    testTimeout: 60_000,
    fileParallelism: false,
  },
});
