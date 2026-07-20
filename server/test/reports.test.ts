import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { makeTestApp } from './helpers/app.js';
import { devices, reports, apMap } from '../src/db/schema.js';
import { eq, desc } from 'drizzle-orm';

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
  it('persists extended telemetry fields', async () => {
    const res = await ctx.app.inject({
      method: 'POST', url: '/api/reports',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        batteryPct: 55, batteryStatus: 'charging', batteryPlug: 'ac', batteryTempC: 31.5,
        batteryHealth: 'good', batteryVoltageMv: 4123, wifiRssi: -47, wifiLinkMbps: 433,
        wifiFreqMhz: 5180, localIp: '10.0.0.12', storageFreeMb: 20480, storageTotalMb: 65536,
        osVersion: 'Android 13 (SDK 33)', uptimeSec: 86400,
        nearbyAps: [{ bssid: 'aa:bb:cc:dd:ee:01', rssi: -50, ssid: 'CORP', frequency: 5180 }],
      },
    });
    expect(res.statusCode).toBe(200);
    const [row] = await ctx.db.select().from(reports).orderBy(desc(reports.id)).limit(1);
    expect(row.batteryStatus).toBe('charging');
    expect(row.storageFreeMb).toBe(20480);
    expect((row.nearbyAps as any[])[0].bssid).toBe('aa:bb:cc:dd:ee:01');
  });
});
