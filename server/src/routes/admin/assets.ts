import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { assets, users } from '../../db/schema.js';
import { requireAdmin } from '../../plugins/auth-admin.js';
import type { DbClient } from '../../db/client.js';

export const AssetRow = z.object({
  serial: z.string().min(1),
  assetNo: z.string().optional(),
  sapNo: z.string().optional(),
  model: z.string().optional(),
  ownerName: z.string().optional(),
  ownerEmpNo: z.string().optional(),
  org1: z.string().optional(),
  org2: z.string().optional(),
  location: z.string().optional(),
  status: z.string().optional(),
  issuedAt: z.string().optional(),
  note: z.string().optional(),
});
export type AssetRow = z.infer<typeof AssetRow>;

const Body = z.object({ rows: z.array(AssetRow) });

/** row → assets 테이블 insert/update 값. 순수 함수(테스트용). */
export function toAssetValues(row: AssetRow) {
  return {
    serial: row.serial,
    assetNo: row.assetNo ?? null,
    sapNo: row.sapNo ?? null,
    model: row.model ?? null,
    ownerName: row.ownerName ?? null,
    ownerEmpNo: row.ownerEmpNo ?? null,
    org1: row.org1 ?? null,
    org2: row.org2 ?? null,
    location: row.location ?? null,
    status: row.status ?? null,
    issuedAt: row.issuedAt ?? null,
    note: row.note ?? null,
  };
}

/** row → users 테이블 insert/update 값. ownerEmpNo가 없으면 null(스킵 대상). */
export function toUserValues(row: AssetRow): { empNo: string; name: string; dept: string | null } | null {
  if (!row.ownerEmpNo) return null;
  return { empNo: row.ownerEmpNo, name: row.ownerName ?? row.ownerEmpNo, dept: row.org2 ?? null };
}

export async function upsertAssetRows(db: DbClient, rows: AssetRow[]) {
  for (const row of rows) {
    const values = toAssetValues(row);
    await db.insert(assets).values(values).onConflictDoUpdate({
      target: assets.serial,
      set: values,
    });

    const userValues = toUserValues(row);
    if (userValues) {
      await db.insert(users).values(userValues).onConflictDoUpdate({
        target: users.empNo,
        set: { name: userValues.name, dept: userValues.dept },
      });
    }
  }
  return { upserted: rows.length };
}

export function registerAssetRoutes(app: FastifyInstance) {
  app.put('/api/admin/assets', { preHandler: requireAdmin(app, ['admin']) }, async (req) => {
    const { rows } = Body.parse(req.body);
    return upsertAssetRows(app.deps.db, rows);
  });
}
