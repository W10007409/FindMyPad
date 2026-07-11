import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { makeTestApp } from './helpers/app.js';
import { devices } from '../src/db/schema.js';
import { generateDeviceToken, hashToken } from '../src/services/auth.js';
import { requireDevice } from '../src/plugins/auth-device.js';

const ctx = makeTestApp();
beforeEach(() => ctx.truncate());
afterAll(() => ctx.dispose());

describe('requireDevice', () => {
  it('유효 토큰 → request.device 세팅', async () => {
    const { token, hash } = generateDeviceToken();
    await ctx.db.insert(devices).values({ serial: 'S1', deviceTokenHash: hash });
    ctx.app.get('/whoami', { preHandler: requireDevice(ctx.app) }, async (req) => ({ serial: req.device!.serial }));
    const res = await ctx.app.inject({ method: 'GET', url: '/whoami', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ serial: 'S1' });
  });
  it('없는 토큰 → 401', async () => {
    ctx.app.get('/whoami2', { preHandler: requireDevice(ctx.app) }, async () => ({}));
    const res = await ctx.app.inject({ method: 'GET', url: '/whoami2', headers: { authorization: 'Bearer nope' } });
    expect(res.statusCode).toBe(401);
  });
  it('hashToken은 결정적', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
  });
});
