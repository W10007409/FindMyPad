import { lt } from 'drizzle-orm';
import type { DbClient } from '../db/client.js';
import { reports } from '../db/schema.js';

export async function purgeOldReports(db: DbClient, days: number): Promise<number> {
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const deleted = await db.delete(reports).where(lt(reports.reportedAt, cutoff)).returning({ id: reports.id });
  return deleted.length;
}
