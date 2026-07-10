import { pgTable, bigserial, text, timestamp, boolean, doublePrecision, real, smallint, bigint, inet, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const devices = pgTable('devices', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  serial: text('serial').notNull().unique(),
  assetNo: text('asset_no').unique(),
  model: text('model'),
  wifiMac: text('wifi_mac'),
  fcmToken: text('fcm_token'),
  deviceTokenHash: text('device_token_hash'),
  knoxLicensed: boolean('knox_licensed').default(false),
  enrolledAt: timestamp('enrolled_at', { withTimezone: true }).defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
});

export const users = pgTable('users', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  empNo: text('emp_no').notNull().unique(),
  name: text('name').notNull(),
  dept: text('dept'),
  email: text('email'),
});

export const adminUsers = pgTable('admin_users', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['admin', 'employee'] }).notNull().default('admin'),
});

export const checkouts = pgTable('checkouts', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  deviceId: bigint('device_id', { mode: 'number' }).references(() => devices.id),
  userId: bigint('user_id', { mode: 'number' }).references(() => users.id),
  consentAt: timestamp('consent_at', { withTimezone: true }).notNull(),
  checkedOut: timestamp('checked_out', { withTimezone: true }).defaultNow(),
  returnedAt: timestamp('returned_at', { withTimezone: true }),
}, (t) => ({
  oneActive: uniqueIndex('one_active_checkout_per_device')
    .on(t.deviceId).where(sql`${t.returnedAt} is null`),
}));

export const reports = pgTable('reports', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  deviceId: bigint('device_id', { mode: 'number' }).references(() => devices.id),
  reportedAt: timestamp('reported_at', { withTimezone: true }).defaultNow(),
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
  accuracyM: real('accuracy_m'),
  bssid: text('bssid'),
  ssid: text('ssid'),
  publicIp: inet('public_ip'),
  batteryPct: smallint('battery_pct'),
}, (t) => ({
  byDeviceTime: index('reports_device_time').on(t.deviceId, t.reportedAt.desc()),
}));

export const apMap = pgTable('ap_map', {
  bssid: text('bssid').primaryKey(),
  building: text('building'),
  floor: text('floor'),
  zone: text('zone'),
  note: text('note'),
});
