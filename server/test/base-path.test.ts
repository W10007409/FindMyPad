import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { makeTestApp } from './helpers/app.js';

// BASE_PATH 하위경로(예: /FindMyPad)에서 API가 서빙되는지 검증.
const ctx = makeTestApp();
beforeEach(async () => {
  ctx.config.BASE_PATH = '/FindMyPad';
  await ctx.truncate();
});
afterAll(() => ctx.dispose());

describe('BASE_PATH 하위경로 서빙', () => {
  it('접두사 하위 health → 200', async () => {
    expect((await ctx.app.inject({ method: 'GET', url: '/FindMyPad/health' })).statusCode).toBe(200);
  });
  it('루트 health도 유지(컨테이너/인프라 체크) → 200', async () => {
    expect((await ctx.app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
  });
  it('API가 접두사 하위에 등록됨(토큰 없으면 401)', async () => {
    expect((await ctx.app.inject({ method: 'GET', url: '/FindMyPad/api/admin/devices' })).statusCode).toBe(401);
  });
  it('접두사 없는 경로는 404(라우트 미등록)', async () => {
    expect((await ctx.app.inject({ method: 'GET', url: '/api/admin/devices' })).statusCode).toBe(404);
  });
});
