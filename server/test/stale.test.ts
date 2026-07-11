import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { makeTestApp } from './helpers/app.js';
import { scanStale } from '../src/jobs/stale-scan.js';
import { seedAdmin } from '../src/db/seed.js';
import { devices } from '../src/db/schema.js';

const ctx = makeTestApp();
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
let atoken: string;
beforeEach(async () => {
  await ctx.truncate();
  await seedAdmin(ctx.db, 'root', 'secret123', 'admin');
  atoken = (await ctx.app.inject({ method: 'POST', url: '/api/admin/login', payload: { username: 'root', password: 'secret123' } })).json().token;
  await ctx.db.insert(devices).values([
    { serial: 'FRESH', lastSeenAt: daysAgo(1) },
    { serial: 'STALE', lastSeenAt: daysAgo(10) },
    { serial: 'NEVER', lastSeenAt: null },
  ]);
});
afterAll(() => ctx.dispose());

describe('stale detection', () => {
  it('scanStale(7) → STALE + NEVER 포함, FRESH 제외', async () => {
    const rows = await scanStale(ctx.db, 7);
    const serials = rows.map((r) => r.serial).sort();
    expect(serials).toEqual(['NEVER', 'STALE']);
  });
  it('GET /api/admin/alerts/stale?days=7', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/admin/alerts/stale?days=7', headers: { authorization: `Bearer ${atoken}` } });
    expect(res.statusCode).toBe(200);
    expect(res.json().items).toHaveLength(2);
  });
});
