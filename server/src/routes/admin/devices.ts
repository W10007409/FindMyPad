import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, desc, eq, ilike, inArray, isNull, or } from 'drizzle-orm';
import { devices, users, checkouts, reports, assets } from '../../db/schema.js';
import type { DbClient } from '../../db/client.js';
import { requireAdmin } from '../../plugins/auth-admin.js';
import { resolveIndoorLocation, resolveIndoorLocationFromReport } from '../../services/location.js';
import { resolveNetworkLocation } from '../../services/network-location.js';
import { NotFoundError, ForbiddenError } from '../../errors.js';
import type { FcmCommand } from '../../services/fcm.js';

type Device = typeof devices.$inferSelect;
type Asset = typeof assets.$inferSelect;

/** 사번(empNo)이 자산 대장에서 소유(owner)한 serial 집합. employee 스코핑의 기준. */
async function ownedSerials(db: DbClient, empNo: string): Promise<Set<string>> {
  const rows = await db.select({ serial: assets.serial }).from(assets).where(eq(assets.ownerEmpNo, empNo));
  return new Set(rows.map((r) => r.serial));
}

/** admin이 아니면(=employee) 해당 deviceId가 본인 소유 자산인지 확인, 아니면 403. */
async function assertCanAccessDevice(
  db: DbClient,
  admin: { role: 'admin' | 'employee'; empNo: string },
  deviceId: number,
): Promise<void> {
  if (admin.role === 'admin') return;
  const [d] = await db.select({ serial: devices.serial }).from(devices).where(eq(devices.id, deviceId)).limit(1);
  if (!d) throw new NotFoundError('device not found');
  const owned = await ownedSerials(db, admin.empNo);
  if (!owned.has(d.serial)) throw new ForbiddenError('not your device');
}

async function latestReport(db: DbClient, deviceId: number) {
  const [r] = await db.select().from(reports).where(eq(reports.deviceId, deviceId)).orderBy(desc(reports.reportedAt)).limit(1);
  return r ?? null;
}
async function activeUser(db: DbClient, deviceId: number) {
  const [row] = await db.select({ empNo: users.empNo, name: users.name, dept: users.dept })
    .from(checkouts).innerJoin(users, eq(checkouts.userId, users.id))
    .where(and(eq(checkouts.deviceId, deviceId), isNull(checkouts.returnedAt))).limit(1);
  return row ?? null;
}

/** 등록된(enrolled) device 한 건 → 검색 결과 item. 자산 대장에 매칭되는 행이 없을 때의 fallback. */
async function enrolledDeviceItem(db: DbClient, d: Device) {
  const rep = await latestReport(db, d.id);
  const cu = await activeUser(db, d.id);
  const indoor = await resolveIndoorLocation(db, rep?.bssid ?? null);
  return {
    id: d.id, serial: d.serial, assetNo: d.assetNo, model: d.model,
    batteryPct: rep?.batteryPct ?? null, lastSeenAt: d.lastSeenAt,
    lat: rep?.lat ?? null, lng: rep?.lng ?? null,
    currentUser: cu, indoor,
    org1: null as string | null, location: null as string | null, enrolled: true,
  };
}

/** assets(개인별 지급 대장) 한 건 → 검색 결과 item. serial이 같은 enrolled device가 있으면 좌측 조인해 실시간 정보(배터리/위치)를 붙인다. */
async function assetItem(db: DbClient, a: Asset, deviceBySerial: Map<string, Device>) {
  const device = deviceBySerial.get(a.serial) ?? null;
  const rep = device ? await latestReport(db, device.id) : null;
  const indoor = await resolveIndoorLocation(db, rep?.bssid ?? null);
  const currentUser = a.ownerEmpNo || a.ownerName
    ? { empNo: a.ownerEmpNo, name: a.ownerName, dept: a.org2 }
    : null;
  return {
    id: device?.id ?? null,
    serial: a.serial,
    assetNo: a.assetNo,
    model: a.model ?? device?.model ?? null,
    batteryPct: rep?.batteryPct ?? null,
    lastSeenAt: device?.lastSeenAt ?? null,
    lat: rep?.lat ?? null,
    lng: rep?.lng ?? null,
    indoor,
    currentUser,
    org1: a.org1,
    location: a.location,
    enrolled: !!device,
  };
}

/** q(serial/자산번호/소유자명/사번)에 매칭되는 assets 행 조회 */
async function matchedAssets(db: DbClient, like: string) {
  return db.select().from(assets).where(or(
    ilike(assets.serial, like),
    ilike(assets.assetNo, like),
    ilike(assets.ownerName, like),
    ilike(assets.ownerEmpNo, like),
  )).limit(100);
}

/** q(serial/자산번호/현재 대여자 이름·사번)에 매칭되는 enrolled devices 조회 — 기존 검색 로직 */
async function matchedEnrolledDevices(db: DbClient, like: string) {
  // q가 이름/사번과 매칭되는 활성 대여의 device_id 목록을 먼저 조회한다.
  // (drizzle-orm 0.36.4에서 sql`${id} in (${subquery})` 패턴이 불안정하여 inArray 폴백을 사용)
  const userMatchedRows = await db.select({ id: checkouts.deviceId }).from(checkouts)
    .innerJoin(users, eq(checkouts.userId, users.id))
    .where(and(isNull(checkouts.returnedAt), or(ilike(users.name, like), ilike(users.empNo, like))));
  const userMatchedDeviceIds = userMatchedRows.map((r) => r.id).filter((id): id is number => id !== null);

  const conditions = [ilike(devices.serial, like), ilike(devices.assetNo, like)];
  if (userMatchedDeviceIds.length > 0) conditions.push(inArray(devices.id, userMatchedDeviceIds));

  return db.select().from(devices).where(or(...conditions)).limit(100);
}

export function registerAdminDeviceRoutes(app: FastifyInstance) {
  const db = app.deps.db;

  app.get('/api/admin/devices', { preHandler: requireAdmin(app, ['admin', 'employee']) }, async (req) => {
    const admin = req.admin!;
    const q = (z.object({ q: z.string().optional() }).parse(req.query).q ?? '').trim();

    // employee는 항상 본인 소유 자산으로 스코핑된다(q 유무 무관). 소유 자산이 없으면 빈 목록.
    const scope = admin.role === 'employee' ? await ownedSerials(db, admin.empNo) : null;

    if (!q) {
      if (scope) {
        // 내 패드 목록: 본인 소유 자산 전체(enroll 여부 무관).
        const mine = await db.select().from(assets).where(eq(assets.ownerEmpNo, admin.empNo)).limit(100);
        const linked = mine.length
          ? await db.select().from(devices).where(inArray(devices.serial, mine.map((a) => a.serial)))
          : [];
        const bySerial = new Map(linked.map((d) => [d.serial, d]));
        return { items: await Promise.all(mine.map((a) => assetItem(db, a, bySerial))) };
      }
      // admin: 기존 동작 그대로 enrolled devices 전체(최대 100).
      const rows = await db.select().from(devices).limit(100);
      const items = await Promise.all(rows.map((d) => enrolledDeviceItem(db, d)));
      return { items };
    }

    const like = `%${q}%`;

    // assets(개인별 지급 대장)가 검색의 주 소스: 아직 enroll되지 않은 단말도 결과에 포함된다.
    const assetRows = (await matchedAssets(db, like)).filter((a) => !scope || scope.has(a.serial));
    const assetSerials = new Set(assetRows.map((a) => a.serial));
    const linkedDevices = assetSerials.size > 0
      ? await db.select().from(devices).where(inArray(devices.serial, [...assetSerials]))
      : [];
    const deviceBySerial = new Map(linkedDevices.map((d) => [d.serial, d]));
    const assetResultItems = await Promise.all(assetRows.map((a) => assetItem(db, a, deviceBySerial)));

    // enrolled devices 중 assets에 매칭 행이 없는 것들(자산 대장 미등재)은 기존 checkout 기반 currentUser로 보강해 union한다.
    // employee는 소유 자산에만 국한되므로 대장 미등재 fallback은 admin 전용이다.
    const fallbackItems = scope ? [] : await (async () => {
      const enrolledMatches = await matchedEnrolledDevices(db, like);
      const fallbackDevices = enrolledMatches.filter((d) => !assetSerials.has(d.serial));
      return Promise.all(fallbackDevices.map((d) => enrolledDeviceItem(db, d)));
    })();

    return { items: [...assetResultItems, ...fallbackItems] };
  });

  app.get('/api/admin/devices/:id', { preHandler: requireAdmin(app, ['admin', 'employee']) }, async (req) => {
    const id = Number((req.params as { id: string }).id);
    await assertCanAccessDevice(db, req.admin!, id);
    const [device] = await db.select().from(devices).where(eq(devices.id, id)).limit(1);
    const recentReports = await db.select().from(reports).where(eq(reports.deviceId, id)).orderBy(desc(reports.reportedAt)).limit(20);
    const history = await db.select({
      id: checkouts.id, empNo: users.empNo, name: users.name,
      checkedOut: checkouts.checkedOut, returnedAt: checkouts.returnedAt, consentAt: checkouts.consentAt,
    }).from(checkouts).innerJoin(users, eq(checkouts.userId, users.id))
      .where(eq(checkouts.deviceId, id)).orderBy(desc(checkouts.checkedOut)).limit(50);
    const currentUser = await activeUser(db, id);
    const top = recentReports[0] ?? null;
    const indoor = await resolveIndoorLocationFromReport(db, {
      bssid: top?.bssid ?? null,
      nearbyAps: (top?.nearbyAps as { bssid: string; rssi: number }[] | null) ?? null,
    });
    // 사내망(corp) 여부 분류: publicIp가 IPv4-mapped IPv6(`::ffff:a.b.c.d`, 듀얼스택 프록시 경유 시)이면
    // 벗겨내지 않으면 IPv4로 인식되지 않아 항상 external로 분류되므로 접두를 제거한다.
    const corpCidrs = app.deps.config.CORP_PUBLIC_IPS.split(',').map((s) => s.trim()).filter(Boolean);
    const rawIp = top?.publicIp ?? null;
    const ip = rawIp && rawIp.startsWith('::ffff:') ? rawIp.slice('::ffff:'.length) : rawIp;
    const network = resolveNetworkLocation(ip, { corpCidrs, mmdbPath: app.deps.config.MAXMIND_MMDB_PATH });
    // serial이 일치하는 자산 대장 행이 있으면 배정된 소유자(asset) 정보도 함께 반환한다. (기존 필드는 그대로 유지)
    const asset = device ? (await db.select().from(assets).where(eq(assets.serial, device.serial)).limit(1))[0] ?? null : null;
    return { device, currentUser, indoor, network, recentReports, history, asset };
  });

  async function sendCmd(id: number, type: 'RING' | 'LOCATE_NOW'): Promise<{ queued: boolean; reason?: 'no_token' | 'send_failed' }> {
    const [d] = await db.select().from(devices).where(eq(devices.id, id)).limit(1);
    if (!d) throw new NotFoundError('device not found');
    if (!d.fcmToken) return { queued: false, reason: 'no_token' };
    const cmd: FcmCommand = { type };
    if (type === 'RING') {
      // Attach the assigned renter so the ring screen shows whose pad it is.
      const [a] = await db.select().from(assets).where(eq(assets.serial, d.serial)).limit(1);
      if (a?.ownerName) cmd.ownerName = a.ownerName;
      const dept = a?.org2 ?? a?.org1;
      if (dept) cmd.ownerDept = dept;
    }
    try {
      await app.deps.fcm.send(d.fcmToken, cmd);
      return { queued: true };
    } catch (e) {
      app.log.warn({ err: e, deviceId: id, type }, 'fcm send failed');
      return { queued: false, reason: 'send_failed' };
    }
  }
  app.post('/api/admin/devices/:id/ring', { preHandler: requireAdmin(app, ['admin', 'employee']) },
    async (req) => {
      const id = Number((req.params as { id: string }).id);
      await assertCanAccessDevice(db, req.admin!, id);
      return sendCmd(id, 'RING');
    });
  app.post('/api/admin/devices/:id/locate', { preHandler: requireAdmin(app, ['admin', 'employee']) },
    async (req) => {
      const id = Number((req.params as { id: string }).id);
      await assertCanAccessDevice(db, req.admin!, id);
      return sendCmd(id, 'LOCATE_NOW');
    });
}
