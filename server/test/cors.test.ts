import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { makeTestApp } from './helpers/app.js';

// 대시보드가 다른 오리진(NCP CDN)일 때 CORS 허용 동작 검증.
const ctx = makeTestApp();
const ORIGIN = 'https://app.example.com';
beforeEach(async () => {
  ctx.config.CORS_ORIGINS = ORIGIN; // buildApp 시점에 읽으므로 rebuild 전에 설정
  await ctx.truncate();             // 같은 config 참조로 앱 재빌드 → CORS 등록
});
afterAll(() => ctx.dispose());

describe('CORS (다른 오리진 대시보드)', () => {
  it('허용 오리진 → preflight(OPTIONS)에 ACAO/Allow-Methods 헤더', async () => {
    const res = await ctx.app.inject({
      method: 'OPTIONS',
      url: '/api/admin/login',
      headers: {
        origin: ORIGIN,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization,content-type',
      },
    });
    expect(res.headers['access-control-allow-origin']).toBe(ORIGIN);
    expect(String(res.headers['access-control-allow-methods'])).toContain('POST');
  });
  it('허용 오리진 → 실제 응답에 ACAO 헤더', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/health', headers: { origin: ORIGIN } });
    expect(res.headers['access-control-allow-origin']).toBe(ORIGIN);
  });
  it('미허용 오리진 → ACAO 헤더 없음', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/health', headers: { origin: 'https://evil.example.com' } });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
