import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { makeTestApp } from './helpers/app.js';
import { devices } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';

const ctx = makeTestApp();
beforeEach(async () => { await ctx.truncate(); });
afterAll(() => ctx.dispose());

describe('POST /api/devices/enroll', () => {
  it('신규 등록 → deviceToken 발급', async () => {
    const res = await ctx.app.inject({ method: 'POST', url: '/api/devices/enroll',
      payload: { serial: 'SER-1', model: 'SM-X200', wifiMac: 'AA:BB', fcmToken: 'fcm-1' } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.deviceToken).toMatch(/^[0-9a-f]{64}$/);
    const rows = await ctx.db.select().from(devices).where(eq(devices.serial, 'SER-1'));
    expect(rows[0].fcmToken).toBe('fcm-1');
    expect(rows[0].deviceTokenHash).not.toBeNull();
  });
  it('같은 serial 재등록 → 업서트(행 1개, fcmToken 갱신, 새 토큰)', async () => {
    await ctx.app.inject({ method: 'POST', url: '/api/devices/enroll', payload: { serial: 'SER-1', fcmToken: 'old' } });
    const res2 = await ctx.app.inject({ method: 'POST', url: '/api/devices/enroll', payload: { serial: 'SER-1', fcmToken: 'new' } });
    expect(res2.statusCode).toBe(200);
    const rows = await ctx.db.select().from(devices).where(eq(devices.serial, 'SER-1'));
    expect(rows).toHaveLength(1);
    expect(rows[0].fcmToken).toBe('new');
  });
});
