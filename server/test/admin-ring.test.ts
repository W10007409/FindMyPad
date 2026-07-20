import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { makeTestApp } from './helpers/app.js';
import { seedAdmin } from '../src/db/seed.js';

const ctx = makeTestApp();
let atoken: string, deviceId: number;
beforeEach(async () => {
  await ctx.truncate();
  await seedAdmin(ctx.db, 'root', 'secret123', 'admin');
  const enroll = await ctx.app.inject({ method: 'POST', url: '/api/devices/enroll', payload: { serial: 'S1', fcmToken: 'FCM-1' } });
  deviceId = enroll.json().deviceId;
  atoken = (await ctx.app.inject({ method: 'POST', url: '/api/admin/login', payload: { username: 'root', password: 'secret123' } })).json().token;
  ctx.fcm.sent.length = 0;
});
afterAll(() => ctx.dispose());
const admin = () => ({ authorization: `Bearer ${atoken}` });

describe('ring/locate', () => {
  it('ring → fcm.send(RING) 호출', async () => {
    const res = await ctx.app.inject({ method: 'POST', url: `/api/admin/devices/${deviceId}/ring`, headers: admin() });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ queued: true });
    expect(ctx.fcm.sent).toEqual([{ token: 'FCM-1', cmd: { type: 'RING' } }]);
  });
  it('ring → 배정된 자산 있으면 대여자 이름·부서를 payload에 포함', async () => {
    await ctx.app.inject({
      method: 'PUT', url: '/api/admin/assets', headers: admin(),
      payload: { rows: [{ serial: 'S1', assetNo: 'A-1', ownerName: '이은영', org1: 'AX연구소', org2: '서비스기획팀' }] },
    });
    const res = await ctx.app.inject({ method: 'POST', url: `/api/admin/devices/${deviceId}/ring`, headers: admin() });
    expect(res.statusCode).toBe(200);
    expect(ctx.fcm.sent).toEqual([
      { token: 'FCM-1', cmd: { type: 'RING', ownerName: '이은영', ownerDept: '서비스기획팀' } },
    ]);
  });
  it('locate → fcm.send(LOCATE_NOW)', async () => {
    await ctx.app.inject({ method: 'POST', url: `/api/admin/devices/${deviceId}/locate`, headers: admin() });
    expect(ctx.fcm.sent).toEqual([{ token: 'FCM-1', cmd: { type: 'LOCATE_NOW' } }]);
  });
  it('없는 기기 → 404', async () => {
    const res = await ctx.app.inject({ method: 'POST', url: `/api/admin/devices/99999/ring`, headers: admin() });
    expect(res.statusCode).toBe(404);
  });
  it('fcmToken 없는 기기 → ring은 200이지만 queued:false, reason:no_token', async () => {
    const enroll = await ctx.app.inject({ method: 'POST', url: '/api/devices/enroll', payload: { serial: 'S2' } });
    const noTokenDeviceId = enroll.json().deviceId;
    const res = await ctx.app.inject({ method: 'POST', url: `/api/admin/devices/${noTokenDeviceId}/ring`, headers: admin() });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ queued: false, reason: 'no_token' });
    expect(ctx.fcm.sent).toEqual([]);
  });
  it('fcm.send 실패 → ring은 200이지만 queued:false, reason:send_failed', async () => {
    ctx.fcm.send = async () => { throw new Error('boom'); };
    const res = await ctx.app.inject({ method: 'POST', url: `/api/admin/devices/${deviceId}/ring`, headers: admin() });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ queued: false, reason: 'send_failed' });
  });
});
