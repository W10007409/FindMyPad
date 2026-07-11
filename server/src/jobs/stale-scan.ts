import { or, lt, isNull } from 'drizzle-orm';
import type { DbClient } from '../db/client.js';
import { devices } from '../db/schema.js';

export async function scanStale(db: DbClient, days: number) {
  const cutoff = new Date(Date.now() - days * 86_400_000);
  return db.select({ id: devices.id, serial: devices.serial, assetNo: devices.assetNo, lastSeenAt: devices.lastSeenAt })
    .from(devices)
    .where(or(isNull(devices.lastSeenAt), lt(devices.lastSeenAt, cutoff)));
}
