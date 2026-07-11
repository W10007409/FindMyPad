import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { makeTestApp } from './helpers/app.js';
import { devices } from '../src/db/schema.js';

const ctx = makeTestApp();
beforeEach(() => ctx.truncate());
afterAll(() => ctx.dispose());

describe('schema', () => {
  it('devices 테이블에 insert/select 된다', async () => {
    await ctx.db.insert(devices).values({ serial: 'SER-1', model: 'SM-X200' });
    const rows = await ctx.db.select().from(devices);
    expect(rows).toHaveLength(1);
    expect(rows[0].serial).toBe('SER-1');
    expect(rows[0].knoxLicensed).toBe(false);
  });
});
