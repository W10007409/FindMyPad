import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { makeTestApp } from './helpers/app.js';
import { apMap } from '../src/db/schema.js';
import { resolveIndoorLocation, resolveIndoorLocationFromReport } from '../src/services/location.js';

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

describe('resolveIndoorLocationFromReport', () => {
  it('연결 bssid가 매핑됨 → 더 강한 nearby가 있어도 연결 bssid 위치 반환', async () => {
    await ctx.db.insert(apMap).values([
      { bssid: 'AP:CONNECTED', building: '본관', floor: '1', zone: '연결' },
      { bssid: 'AP:STRONG', building: '별관', floor: '2', zone: '강함' },
    ]);
    const result = await resolveIndoorLocationFromReport(ctx.db, {
      bssid: 'AP:CONNECTED',
      nearbyAps: [{ bssid: 'AP:STRONG', rssi: -40 }],
    });
    expect(result).toEqual({ building: '본관', floor: '1', zone: '연결' });
  });

  it('연결 bssid 미매핑 + nearby 2개 매핑(강/약) → 강한 쪽 위치 반환', async () => {
    await ctx.db.insert(apMap).values([
      { bssid: 'AP:WEAK', building: '약관', floor: '4', zone: '약함' },
      { bssid: 'AP:STRONG', building: '강관', floor: '5', zone: '강함' },
    ]);
    const result = await resolveIndoorLocationFromReport(ctx.db, {
      bssid: 'AP:UNMAPPED',
      nearbyAps: [
        { bssid: 'AP:WEAK', rssi: -80 },
        { bssid: 'AP:STRONG', rssi: -50 },
      ],
    });
    expect(result).toEqual({ building: '강관', floor: '5', zone: '강함' });
  });

  it('연결 bssid null + nearby에 매핑 AP 하나 → 그 위치 반환', async () => {
    await ctx.db.insert(apMap).values({ bssid: 'AP:ONLY', building: '유일관', floor: '1', zone: 'A' });
    const result = await resolveIndoorLocationFromReport(ctx.db, {
      bssid: null,
      nearbyAps: [{ bssid: 'AP:ONLY', rssi: -60 }],
    });
    expect(result).toEqual({ building: '유일관', floor: '1', zone: 'A' });
  });

  it('매핑된 것이 하나도 없음 → null', async () => {
    const result = await resolveIndoorLocationFromReport(ctx.db, {
      bssid: 'AP:UNMAPPED',
      nearbyAps: [{ bssid: 'AP:ALSO_UNMAPPED', rssi: -60 }],
    });
    expect(result).toBeNull();
  });

  it('nearbyAps 없음/undefined + bssid 미매핑 → null', async () => {
    expect(await resolveIndoorLocationFromReport(ctx.db, { bssid: 'AP:UNMAPPED' })).toBeNull();
    expect(await resolveIndoorLocationFromReport(ctx.db, { bssid: null, nearbyAps: [] })).toBeNull();
  });
});
