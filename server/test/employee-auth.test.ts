import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { makeTestApp } from './helpers/app.js';
import { seedAdmin } from '../src/db/seed.js';
import { users, assets, devices } from '../src/db/schema.js';

const ctx = makeTestApp();

async function login(empNo: string, password: string) {
  const res = await ctx.app.inject({ method: 'POST', url: '/api/admin/login', payload: { empNo, password } });
  return res;
}
const bearer = (t: string) => ({ authorization: `Bearer ${t}` });

beforeEach(async () => {
  await ctx.truncate();
  // admin + two employees
  await seedAdmin(ctx.db, 'admin', 'adminpw', 'admin');
  await ctx.db.insert(users).values([
    { empNo: 'E1', name: '이은영', role: 'employee', passwordHash: null, mustChangePassword: true },
    { empNo: 'E2', name: '김대호', role: 'employee', passwordHash: null, mustChangePassword: true },
  ]);
  // give E1 an owned asset (+ enrolled device), E2 an owned asset
  await ctx.db.insert(assets).values([
    { serial: 'S-E1', assetNo: 'A1', ownerName: '이은영', ownerEmpNo: 'E1', org2: '기획팀' },
    { serial: 'S-E2', assetNo: 'A2', ownerName: '김대호', ownerEmpNo: 'E2', org2: '개발팀' },
  ]);
  await ctx.db.insert(devices).values([
    { serial: 'S-E1', assetNo: 'A1', fcmToken: 'TOK-E1' },
    { serial: 'S-E2', assetNo: 'A2', fcmToken: 'TOK-E2' },
  ]);
});
afterAll(() => ctx.dispose());

describe('employee 사번 login + change-password', () => {
  it('초기 비번 1234 로그인 → mustChangePassword=true', async () => {
    // seed E1's password to 1234 via the same hash path
    const { hashPassword } = await import('../src/services/auth.js');
    await ctx.db.update(users).set({ passwordHash: hashPassword('1234') }).where(eq(users.empNo, 'E1'));
    const res = await login('E1', '1234');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ role: 'employee', name: '이은영', mustChangePassword: true });
  });

  it('change-password → 이후 새 비번 로그인 + mustChangePassword=false', async () => {
    const { hashPassword } = await import('../src/services/auth.js');
    await ctx.db.update(users).set({ passwordHash: hashPassword('1234') }).where(eq(users.empNo, 'E1'));
    const token = (await login('E1', '1234')).json().token;
    const chg = await ctx.app.inject({
      method: 'POST', url: '/api/auth/change-password', headers: bearer(token),
      payload: { currentPassword: '1234', newPassword: 'newpass' },
    });
    expect(chg.statusCode).toBe(200);
    const relog = await login('E1', 'newpass');
    expect(relog.json()).toMatchObject({ mustChangePassword: false });
  });

  it('change-password 새 비번 1234 금지 → 400', async () => {
    const { hashPassword } = await import('../src/services/auth.js');
    await ctx.db.update(users).set({ passwordHash: hashPassword('1234') }).where(eq(users.empNo, 'E1'));
    const token = (await login('E1', '1234')).json().token;
    const chg = await ctx.app.inject({
      method: 'POST', url: '/api/auth/change-password', headers: bearer(token),
      payload: { currentPassword: '1234', newPassword: '1234' },
    });
    expect(chg.statusCode).toBe(400);
  });

  it('비활성 계정 → 로그인 401', async () => {
    const { hashPassword } = await import('../src/services/auth.js');
    await ctx.db.update(users).set({ passwordHash: hashPassword('1234'), isActive: false }).where(eq(users.empNo, 'E1'));
    expect((await login('E1', '1234')).statusCode).toBe(401);
  });
});

describe('employee RBAC 스코핑', () => {
  async function employeeToken(empNo: string) {
    const { hashPassword } = await import('../src/services/auth.js');
    await ctx.db.update(users).set({ passwordHash: hashPassword('pw'), mustChangePassword: false }).where(eq(users.empNo, empNo));
    return (await login(empNo, 'pw')).json().token;
  }

  it('내 패드 목록은 본인 소유만', async () => {
    const t = await employeeToken('E1');
    const res = await ctx.app.inject({ method: 'GET', url: '/api/admin/devices', headers: bearer(t) });
    const items = res.json().items;
    expect(items.map((i: { serial: string }) => i.serial)).toEqual(['S-E1']);
  });

  it('검색해도 타인 패드는 안 나옴', async () => {
    const t = await employeeToken('E1');
    const res = await ctx.app.inject({ method: 'GET', url: '/api/admin/devices?q=S-E2', headers: bearer(t) });
    expect(res.json().items).toEqual([]);
  });

  it('타인 기기 상세 → 403', async () => {
    const t = await employeeToken('E1');
    const [dev] = await ctx.db.select().from(devices).where(eq(devices.serial, 'S-E2')).limit(1);
    const res = await ctx.app.inject({ method: 'GET', url: `/api/admin/devices/${dev.id}`, headers: bearer(t) });
    expect(res.statusCode).toBe(403);
  });

  it('본인 기기 벨 → 200, 타인 기기 벨 → 403', async () => {
    const t = await employeeToken('E1');
    const [mine] = await ctx.db.select().from(devices).where(eq(devices.serial, 'S-E1')).limit(1);
    const [theirs] = await ctx.db.select().from(devices).where(eq(devices.serial, 'S-E2')).limit(1);
    expect((await ctx.app.inject({ method: 'POST', url: `/api/admin/devices/${mine.id}/ring`, headers: bearer(t) })).statusCode).toBe(200);
    expect((await ctx.app.inject({ method: 'POST', url: `/api/admin/devices/${theirs.id}/ring`, headers: bearer(t) })).statusCode).toBe(403);
  });

  it('employee는 관리자 전용(무응답) → 401/403', async () => {
    const t = await employeeToken('E1');
    const res = await ctx.app.inject({ method: 'GET', url: '/api/admin/alerts/stale', headers: bearer(t) });
    expect([401, 403]).toContain(res.statusCode);
  });

  it('admin은 전체 검색 가능', async () => {
    await ctx.db.update(users).set({ passwordHash: (await import('../src/services/auth.js')).hashPassword('adminpw'), mustChangePassword: false }).where(eq(users.empNo, 'admin'));
    const t = (await login('admin', 'adminpw')).json().token;
    const res = await ctx.app.inject({ method: 'GET', url: '/api/admin/devices?q=S-E2', headers: bearer(t) });
    expect(res.json().items.map((i: { serial: string }) => i.serial)).toContain('S-E2');
  });
});

// local import to avoid top-level drizzle eq import churn
import { eq } from 'drizzle-orm';
