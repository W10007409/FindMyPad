import { eq } from 'drizzle-orm';
import type { DbClient } from '../db/client.js';
import { apMap } from '../db/schema.js';

export type IndoorLocation = { building: string | null; floor: string | null; zone: string | null };

export async function resolveIndoorLocation(db: DbClient, bssid: string | null | undefined): Promise<IndoorLocation | null> {
  if (!bssid) return null;
  const rows = await db.select().from(apMap).where(eq(apMap.bssid, bssid)).limit(1);
  if (rows.length === 0) return null;
  return { building: rows[0].building, floor: rows[0].floor, zone: rows[0].zone };
}
