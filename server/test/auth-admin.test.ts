import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { makeTestApp } from './helpers/app.js';
import { requireAdmin } from '../src/plugins/auth-admin.js';
import { seedAdmin } from '../src/db/seed.js';

const ctx = makeTestApp();
beforeEach(async () => {
  await ctx.truncate();
  await seedAdmin(ctx.db, 'root', 'secret123', 'admin');
  ctx.app.get('/api/admin/ping', { preHandler: requireAdmin(ctx.app) }, async (req) => ({ role: req.admin!.role }));
});
afterAll(() => ctx.dispose());

describe('admin auth', () => {
  it('로그인 성공 → token, 보호 라우트 접근', async () => {
    const login = await ctx.app.inject({ method: 'POST', url: '/api/admin/login', payload: { username: 'root', password: 'secret123' } });
    expect(login.statusCode).toBe(200);
    const token = login.json().token as string;
    const ping = await ctx.app.inject({ method: 'GET', url: '/api/admin/ping', headers: { authorization: `Bearer ${token}` } });
    expect(ping.json()).toEqual({ role: 'admin' });
  });
  it('틀린 비밀번호 → 401', async () => {
    const res = await ctx.app.inject({ method: 'POST', url: '/api/admin/login', payload: { username: 'root', password: 'wrong' } });
    expect(res.statusCode).toBe(401);
  });
  it('토큰 없이 보호 라우트 → 401', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/admin/ping' });
    expect(res.statusCode).toBe(401);
  });
});
