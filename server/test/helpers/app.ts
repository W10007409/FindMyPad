import { buildApp } from '../../src/app.js';
import { createDb } from '../../src/db/client.js';
import { StubFcmSender } from '../../src/services/fcm.js';
import { loadConfig } from '../../src/config.js';
import { sql } from 'drizzle-orm';

export function makeTestApp() {
  const config = loadConfig(process.env);
  const { db, close } = createDb(config.DATABASE_URL);
  let fcm = new StubFcmSender();
  let app = buildApp({ config, db, fcm });
  // `truncate` doubles as per-test reset: wipe data AND rebuild a fresh app+fcm
  // so tests may add ad-hoc routes and assert on a clean StubFcmSender.
  async function truncate() {
    await app.close();
    await db.execute(sql`truncate table reports, checkouts, ap_map, users, devices, admin_users restart identity cascade`);
    fcm = new StubFcmSender();
    app = buildApp({ config, db, fcm });
  }
  async function dispose() { await app.close(); await close(); }
  return {
    db, config,
    get app() { return app; },
    get fcm() { return fcm; },
    truncate, dispose,
  };
}
