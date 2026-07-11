import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { makeTestApp } from './helpers/app.js';
import { seedAdmin } from '../src/db/seed.js';
import { apMap } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';

const ctx = makeTestApp();
let atoken: string;
beforeEach(async () => {
  await ctx.truncate();
  await seedAdmin(ctx.db, 'root', 'secret123', 'admin');
  atoken = (await ctx.app.inject({ method: 'POST', url: '/api/admin/login', payload: { username: 'root', password: 'secret123' } })).json().token;
});
afterAll(() => ctx.dispose());
const admin = () => ({ authorization: `Bearer ${atoken}` });

describe('ap-map CSV upsert', () => {
  const csv = 'bssid,building,floor,zone,note\nAP:1,본관,3,동측,\nAP:2,별관,1,로비,정문';
  it('업서트 → 행 생성', async () => {
    const res = await ctx.app.inject({ method: 'PUT', url: '/api/admin/ap-map', headers: { ...admin() }, payload: { csv } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ upserted: 2 });
    const [ap] = await ctx.db.select().from(apMap).where(eq(apMap.bssid, 'AP:1'));
    expect(ap.building).toBe('본관');
  });
  it('재업로드 → 갱신(중복 아님)', async () => {
    await ctx.app.inject({ method: 'PUT', url: '/api/admin/ap-map', headers: admin(), payload: { csv } });
    await ctx.app.inject({ method: 'PUT', url: '/api/admin/ap-map', headers: admin(), payload: { csv: 'bssid,building,floor,zone,note\nAP:1,신관,5,서측,' } });
    const rows = await ctx.db.select().from(apMap);
    expect(rows).toHaveLength(2);
    const [ap] = await ctx.db.select().from(apMap).where(eq(apMap.bssid, 'AP:1'));
    expect(ap.building).toBe('신관');
  });
});
