/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // 하위경로 배포 지원: 빌드 시 VITE_BASE_PATH=/FindMyPad/ 로 지정(끝 슬래시 포함). 기본은 루트.
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  server: { proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: true } } },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
