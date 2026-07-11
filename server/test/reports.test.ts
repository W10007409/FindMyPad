import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { makeTestApp } from './helpers/app.js';
import { devices, reports, apMap } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';

const ctx = makeTestApp();
let token: string;
beforeEach(async () => {
  await ctx.truncate();
  const r = await ctx.app.inject({ method: 'POST', url: '/api/devices/enroll', payload: { serial: 'S1' } });
  token = r.json().deviceToken;
});
afterAll(() => ctx.dispose());

describe('POST /api/reports', () => {
  it('인증 없이 → 401', async () => {
    const res = await ctx.app.inject({ method: 'POST', url: '/api/reports', payload: { batteryPct: 50 } });
    expect(res.statusCode).toBe(401);
  });
  it('보고 저장 + public_ip 서버 기록 + indoor 해석 + last_seen 갱신', async () => {
    await ctx.db.insert(apMap).values({ bssid: 'AP:1', building: '본관', floor: '3', zone: '동측' });
    const res = await ctx.app.inject({
      method: 'POST', url: '/api/reports',
      headers: { authorization: `Bearer ${token}`, 'x-forwarded-for': '203.0.113.9' },
      payload: { bssid: 'AP:1', ssid: 'CORP', batteryPct: 77, lat: 37.5, lng: 127.0, accuracyM: 30 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().indoor).toEqual({ building: '본관', floor: '3', zone: '동측' });
    const [rep] = await ctx.db.select().from(reports);
    expect(rep.batteryPct).toBe(77);
    expect(rep.publicIp).toBe('203.0.113.9');
    const [dev] = await ctx.db.select().from(devices).where(eq(devices.serial, 'S1'));
    expect(dev.lastSeenAt).not.toBeNull();
  });
});
