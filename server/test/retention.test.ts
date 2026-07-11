import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { makeTestApp } from './helpers/app.js';
import { purgeOldReports } from '../src/jobs/retention.js';
import { devices, reports } from '../src/db/schema.js';
import { sql } from 'drizzle-orm';

const ctx = makeTestApp();
beforeEach(() => ctx.truncate());
afterAll(() => ctx.dispose());

describe('retention', () => {
  it('90일 초과 report 삭제, 이내 보존', async () => {
    const [d] = await ctx.db.insert(devices).values({ serial: 'S1' }).returning();
    await ctx.db.insert(reports).values({ deviceId: d.id, reportedAt: sql`now() - interval '100 days'` });
    await ctx.db.insert(reports).values({ deviceId: d.id, reportedAt: sql`now() - interval '10 days'` });
    const deleted = await purgeOldReports(ctx.db, 90);
    expect(deleted).toBe(1);
    const remaining = await ctx.db.select().from(reports);
    expect(remaining).toHaveLength(1);
  });
});
