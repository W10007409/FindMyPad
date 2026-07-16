import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { makeTestApp } from './helpers/app.js';
import { seedAdmin } from '../src/db/seed.js';
import { assets, users } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import { toAssetValues, toUserValues } from '../src/routes/admin/assets.js';
import { parseModel } from '../src/scripts/import-assets.js';

const ctx = makeTestApp();
let atoken: string;
beforeEach(async () => {
  await ctx.truncate();
  await seedAdmin(ctx.db, 'root', 'secret123', 'admin');
  await seedAdmin(ctx.db, 'emp', 'secret123', 'employee');
  atoken = (await ctx.app.inject({ method: 'POST', url: '/api/admin/login', payload: { username: 'root', password: 'secret123' } })).json().token;
});
afterAll(() => ctx.dispose());
const admin = () => ({ authorization: `Bearer ${atoken}` });

const rows = [
  { serial: 'SER-1', assetNo: 'A-1', sapNo: 'SAP-1', model: 'SM-T500', ownerName: '홍길동', ownerEmpNo: 'E100', org1: '본부1', org2: '팀1', location: '본관', status: '사용중', issuedAt: '2024-01-01', note: '' },
  { serial: 'SER-2', assetNo: 'A-2', sapNo: 'SAP-2', model: 'SM-T510', ownerName: '김철수', ownerEmpNo: 'E200', org1: '본부2', org2: '팀2', location: '별관', status: '사용중', issuedAt: '2024-02-01', note: '' },
];

describe('PUT /api/admin/assets', () => {
  it('2행 업서트 → 200 {upserted:2}, assets + users 반영', async () => {
    const res = await ctx.app.inject({ method: 'PUT', url: '/api/admin/assets', headers: admin(), payload: { rows } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ upserted: 2 });

    const assetRows = await ctx.db.select().from(assets);
    expect(assetRows).toHaveLength(2);
    const [a1] = await ctx.db.select().from(assets).where(eq(assets.serial, 'SER-1'));
    expect(a1.assetNo).toBe('A-1');
    expect(a1.ownerName).toBe('홍길동');

    const [u1] = await ctx.db.select().from(users).where(eq(users.empNo, 'E100'));
    expect(u1.name).toBe('홍길동');
    expect(u1.dept).toBe('팀1');
  });

  it('같은 시리얼 재업로드 + ownerName 변경 → 갱신(중복 아님), users도 갱신', async () => {
    await ctx.app.inject({ method: 'PUT', url: '/api/admin/assets', headers: admin(), payload: { rows } });
    const updated = [{ ...rows[0], ownerName: '이영희' }];
    const res = await ctx.app.inject({ method: 'PUT', url: '/api/admin/assets', headers: admin(), payload: { rows: updated } });
    expect(res.statusCode).toBe(200);

    const assetRows = await ctx.db.select().from(assets);
    expect(assetRows).toHaveLength(2); // no dup — still SER-1, SER-2
    const [a1] = await ctx.db.select().from(assets).where(eq(assets.serial, 'SER-1'));
    expect(a1.ownerName).toBe('이영희');

    const userRows = await ctx.db.select().from(users).where(eq(users.empNo, 'E100'));
    expect(userRows).toHaveLength(1);
    expect(userRows[0].name).toBe('이영희');
  });

  it('토큰 없이 → 401', async () => {
    const res = await ctx.app.inject({ method: 'PUT', url: '/api/admin/assets', payload: { rows } });
    expect(res.statusCode).toBe(401);
  });

  it('employee 역할 토큰 → 401(관리자 권한 아님)', async () => {
    const login = await ctx.app.inject({ method: 'POST', url: '/api/admin/login', payload: { username: 'emp', password: 'secret123' } });
    const etoken = login.json().token as string;
    const res = await ctx.app.inject({ method: 'PUT', url: '/api/admin/assets', headers: { authorization: `Bearer ${etoken}` }, payload: { rows } });
    expect(res.statusCode).toBe(401);
  });

  it('serial 누락 행 → 400 validation error', async () => {
    const res = await ctx.app.inject({ method: 'PUT', url: '/api/admin/assets', headers: admin(), payload: { rows: [{ assetNo: 'A-9' }] } });
    expect(res.statusCode).toBe(400);
  });
});

describe('toAssetValues / toUserValues (순수 매핑)', () => {
  it('AssetRow → assets insert 값', () => {
    expect(toAssetValues(rows[0])).toMatchObject({ serial: 'SER-1', assetNo: 'A-1', model: 'SM-T500', ownerName: '홍길동' });
  });
  it('ownerEmpNo 있으면 users 값 생성, empNo=ownerEmpNo, dept=org2', () => {
    expect(toUserValues(rows[0])).toEqual({ empNo: 'E100', name: '홍길동', dept: '팀1' });
  });
  it('ownerEmpNo 없으면 null', () => {
    expect(toUserValues({ serial: 'SER-3' })).toBeNull();
  });
});

describe('parseModel (import-assets)', () => {
  it('"디바이스(S패드:SM-T500)" → "SM-T500"', () => {
    expect(parseModel('디바이스(S패드:SM-T500)')).toBe('SM-T500');
  });
  it('콜론 없는 값은 그대로', () => {
    expect(parseModel('SM-T500')).toBe('SM-T500');
  });
  it('빈 값은 undefined', () => {
    expect(parseModel('')).toBeUndefined();
    expect(parseModel(undefined)).toBeUndefined();
  });
});
