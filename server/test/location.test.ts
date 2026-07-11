import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { makeTestApp } from './helpers/app.js';
import { apMap } from '../src/db/schema.js';
import { resolveIndoorLocation } from '../src/services/location.js';

const ctx = makeTestApp();
beforeEach(() => ctx.truncate());
afterAll(() => ctx.dispose());

describe('resolveIndoorLocation', () => {
  it('매칭 bssid → building/floor/zone', async () => {
    await ctx.db.insert(apMap).values({ bssid: 'AP:1', building: '본관', floor: '3', zone: '동측' });
    expect(await resolveIndoorLocation(ctx.db, 'AP:1')).toEqual({ building: '본관', floor: '3', zone: '동측' });
  });
  it('매칭 없음 → null', async () => {
    expect(await resolveIndoorLocation(ctx.db, 'NOPE')).toBeNull();
  });
  it('bssid null → null', async () => {
    expect(await resolveIndoorLocation(ctx.db, null)).toBeNull();
  });
});
