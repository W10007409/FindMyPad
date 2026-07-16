import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { makeTestApp } from './helpers/app.js';
import { seedAdmin } from '../src/db/seed.js';
import { users, apMap, assets } from '../src/db/schema.js';

const ctx = makeTestApp();
let dtoken: string, atoken: string;
beforeEach(async () => {
  await ctx.truncate();
  await seedAdmin(ctx.db, 'root', 'secret123', 'admin');
  await ctx.db.insert(users).values({ empNo: 'E100', name: '홍길동', dept: '개발' });
  await ctx.db.insert(apMap).values({ bssid: 'AP:1', building: '본관', floor: '3', zone: '동측' });
  dtoken = (await ctx.app.inject({ method: 'POST', url: '/api/devices/enroll', payload: { serial: 'S1', assetNo: 'A-1', model: 'SM-X200' } })).json().deviceToken;
  atoken = (await ctx.app.inject({ method: 'POST', url: '/api/admin/login', payload: { username: 'root', password: 'secret123' } })).json().token;
  await ctx.app.inject({ method: 'POST', url: '/api/checkouts', headers: { authorization: `Bearer ${dtoken}` }, payload: { empNo: 'E100', consentAt: new Date().toISOString() } });
  await ctx.app.inject({ method: 'POST', url: '/api/reports', headers: { authorization: `Bearer ${dtoken}`, 'x-forwarded-for': '203.0.113.9' }, payload: { bssid: 'AP:1', batteryPct: 55 } });
});
afterAll(() => ctx.dispose());

const admin = () => ({ authorization: `Bearer ${atoken}` });

describe('admin devices', () => {
  it('이름으로 검색 → 현재 사용자·실내위치 포함', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/admin/devices?q=홍길동', headers: admin() });
    expect(res.statusCode).toBe(200);
    const items = res.json().items;
    expect(items).toHaveLength(1);
    expect(items[0].serial).toBe('S1');
    expect(items[0].currentUser.name).toBe('홍길동');
    expect(items[0].indoor).toEqual({ building: '본관', floor: '3', zone: '동측' });
    expect(items[0].batteryPct).toBe(55);
  });
  it('자산번호로 검색', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/admin/devices?q=A-1', headers: admin() });
    expect(res.json().items).toHaveLength(1);
  });
  it('일련번호로 검색', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/admin/devices?q=S1', headers: admin() });
    expect(res.json().items).toHaveLength(1);
  });
  it('상세 → 최근 보고 + 대여 이력', async () => {
    const list = await ctx.app.inject({ method: 'GET', url: '/api/admin/devices?q=S1', headers: admin() });
    const id = list.json().items[0].id;
    const res = await ctx.app.inject({ method: 'GET', url: `/api/admin/devices/${id}`, headers: admin() });
    expect(res.json().recentReports.length).toBeGreaterThan(0);
    expect(res.json().history.length).toBeGreaterThan(0);
  });
  it('토큰 없이 → 401', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/admin/devices?q=S1' });
    expect(res.statusCode).toBe(401);
  });
});

describe('admin devices — assets 대장 검색', () => {
  const assetRow = {
    serial: 'R9TT306T78D', assetNo: '032022000216', model: 'SM-T500',
    ownerName: '이은영', ownerEmpNo: '10015727', org2: '서비스기획팀', location: '3층',
  };
  beforeEach(async () => {
    await ctx.db.insert(assets).values(assetRow);
  });

  it('serial로 검색 → 미등록(enrolled=false)이어도 배정된 소유자가 currentUser로 반환된다', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/admin/devices?q=R9TT306T78D', headers: admin() });
    expect(res.statusCode).toBe(200);
    const items = res.json().items;
    expect(items).toHaveLength(1);
    expect(items[0].id).toBeNull();
    expect(items[0].enrolled).toBe(false);
    expect(items[0].assetNo).toBe('032022000216');
    expect(items[0].currentUser).toEqual({ empNo: '10015727', name: '이은영', dept: '서비스기획팀' });
  });

  it('소유자 이름으로 검색 → 동일 결과', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/admin/devices?q=이은영', headers: admin() });
    const items = res.json().items;
    expect(items).toHaveLength(1);
    expect(items[0].currentUser.name).toBe('이은영');
    expect(items[0].assetNo).toBe('032022000216');
    expect(items[0].enrolled).toBe(false);
    expect(items[0].id).toBeNull();
  });

  it('사번으로 검색 → 동일 결과', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/admin/devices?q=10015727', headers: admin() });
    const items = res.json().items;
    expect(items).toHaveLength(1);
    expect(items[0].currentUser.name).toBe('이은영');
    expect(items[0].assetNo).toBe('032022000216');
    expect(items[0].enrolled).toBe(false);
    expect(items[0].id).toBeNull();
  });

  it('해당 serial의 device를 enroll + report 등록 후 검색 → enrolled=true, id/배터리 채워짐, owner는 그대로', async () => {
    const enroll = await ctx.app.inject({ method: 'POST', url: '/api/devices/enroll', payload: { serial: 'R9TT306T78D' } });
    const dtoken = enroll.json().deviceToken;
    await ctx.app.inject({ method: 'POST', url: '/api/reports', headers: { authorization: `Bearer ${dtoken}` }, payload: { batteryPct: 77 } });

    const res = await ctx.app.inject({ method: 'GET', url: '/api/admin/devices?q=R9TT306T78D', headers: admin() });
    const items = res.json().items;
    expect(items).toHaveLength(1);
    expect(items[0].enrolled).toBe(true);
    expect(items[0].id).not.toBeNull();
    expect(items[0].batteryPct).toBe(77);
    expect(items[0].currentUser).toEqual({ empNo: '10015727', name: '이은영', dept: '서비스기획팀' });
  });
});
