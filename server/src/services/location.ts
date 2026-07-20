import { eq, inArray } from 'drizzle-orm';
import type { DbClient } from '../db/client.js';
import { apMap } from '../db/schema.js';

export type IndoorLocation = { building: string | null; floor: string | null; zone: string | null };

export async function resolveIndoorLocation(db: DbClient, bssid: string | null | undefined): Promise<IndoorLocation | null> {
  if (!bssid) return null;
  const rows = await db.select().from(apMap).where(eq(apMap.bssid, bssid)).limit(1);
  if (rows.length === 0) return null;
  return { building: rows[0].building, floor: rows[0].floor, zone: rows[0].zone };
}

export async function resolveIndoorLocationFromReport(
  db: DbClient,
  report: { bssid: string | null; nearbyAps?: { bssid: string; rssi: number }[] | null },
): Promise<IndoorLocation | null> {
  const nearbyAps = report.nearbyAps ?? [];
  const candidates = new Set<string>();
  if (report.bssid) candidates.add(report.bssid);
  for (const ap of nearbyAps) candidates.add(ap.bssid);
  if (candidates.size === 0) return null;

  const rows = await db.select().from(apMap).where(inArray(apMap.bssid, Array.from(candidates)));
  if (rows.length === 0) return null;

  const mapped = new Map(rows.map((row) => [row.bssid, row]));

  if (report.bssid && mapped.has(report.bssid)) {
    const row = mapped.get(report.bssid)!;
    return { building: row.building, floor: row.floor, zone: row.zone };
  }

  let best: { bssid: string; rssi: number } | null = null;
  for (const ap of nearbyAps) {
    if (!mapped.has(ap.bssid)) continue;
    if (!best || ap.rssi > best.rssi) best = ap;
  }
  if (!best) return null;

  const row = mapped.get(best.bssid)!;
  return { building: row.building, floor: row.floor, zone: row.zone };
}
