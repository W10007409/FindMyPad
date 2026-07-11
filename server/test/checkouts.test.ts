import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { makeTestApp } from './helpers/app.js';
import { users } from '../src/db/schema.js';

const ctx = makeTestApp();
let token: string;
beforeEach(async () => {
  await ctx.truncate();
  await ctx.db.insert(users).values({ empNo: 'E100', name: '홍길동', dept: '개발' });
  token = (await ctx.app.inject({ method: 'POST', url: '/api/devices/enroll', payload: { serial: 'S1' } })).json().deviceToken;
});
afterAll(() => ctx.dispose());

const auth = () => ({ authorization: `Bearer ${token}` });

describe('checkouts', () => {
  it('체크아웃 성공', async () => {
    const res = await ctx.app.inject({ method: 'POST', url: '/api/checkouts', headers: auth(), payload: { empNo: 'E100', consentAt: new Date().toISOString() } });
    expect(res.statusCode).toBe(200);
    expect(res.json().checkoutId).toBeTypeOf('number');
  });
  it('이중 체크아웃 → 409', async () => {
    await ctx.app.inject({ method: 'POST', url: '/api/checkouts', headers: auth(), payload: { empNo: 'E100', consentAt: new Date().toISOString() } });
    const res2 = await ctx.app.inject({ method: 'POST', url: '/api/checkouts', headers: auth(), payload: { empNo: 'E100', consentAt: new Date().toISOString() } });
    expect(res2.statusCode).toBe(409);
    expect(res2.json().error.code).toBe('CONFLICT');
  });
  it('반납 후 재대여 허용', async () => {
    const c1 = await ctx.app.inject({ method: 'POST', url: '/api/checkouts', headers: auth(), payload: { empNo: 'E100', consentAt: new Date().toISOString() } });
    const id = c1.json().checkoutId;
    const ret = await ctx.app.inject({ method: 'POST', url: `/api/checkouts/${id}/return`, headers: auth() });
    expect(ret.statusCode).toBe(200);
    const c2 = await ctx.app.inject({ method: 'POST', url: '/api/checkouts', headers: auth(), payload: { empNo: 'E100', consentAt: new Date().toISOString() } });
    expect(c2.statusCode).toBe(200);
  });
  it('없는 empNo → 404', async () => {
    const res = await ctx.app.inject({ method: 'POST', url: '/api/checkouts', headers: auth(), payload: { empNo: 'NOPE', consentAt: new Date().toISOString() } });
    expect(res.statusCode).toBe(404);
  });
});
