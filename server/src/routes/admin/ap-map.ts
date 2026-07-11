import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { apMap } from '../../db/schema.js';
import { requireAdmin } from '../../plugins/auth-admin.js';

const Body = z.object({ csv: z.string().min(1) });

function parseCsv(csv: string): Array<{ bssid: string; building?: string; floor?: string; zone?: string; note?: string }> {
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const header = lines.shift()!.split(',').map((h) => h.trim());
  const idx = (name: string) => header.indexOf(name);
  return lines.map((line) => {
    const c = line.split(',');
    const get = (n: string) => { const i = idx(n); return i >= 0 ? (c[i] ?? '').trim() || undefined : undefined; };
    return { bssid: get('bssid')!, building: get('building'), floor: get('floor'), zone: get('zone'), note: get('note') };
  }).filter((r) => r.bssid);
}

export function registerApMapRoutes(app: FastifyInstance) {
  app.put('/api/admin/ap-map', { preHandler: requireAdmin(app, ['admin']) }, async (req) => {
    const { csv } = Body.parse(req.body);
    const rows = parseCsv(csv);
    for (const r of rows) {
      await app.deps.db.insert(apMap).values(r).onConflictDoUpdate({
        target: apMap.bssid,
        set: { building: r.building, floor: r.floor, zone: r.zone, note: r.note },
      });
    }
    return { upserted: rows.length };
  });
}
