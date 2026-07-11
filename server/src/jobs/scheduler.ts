import cron from 'node-cron';
import type { FastifyInstance } from 'fastify';
import { purgeOldReports } from './retention.js';
import { scanStale } from './stale-scan.js';

export function startSchedulers(app: FastifyInstance) {
  // 매일 03:00 보관정책
  cron.schedule('0 3 * * *', async () => {
    const n = await purgeOldReports(app.deps.db, app.deps.config.RETENTION_DAYS);
    app.log.info(`retention purged ${n} reports`);
  });
  // 매일 09:00 무응답 스캔(로깅만; 알림은 2차)
  cron.schedule('0 9 * * *', async () => {
    const stale = await scanStale(app.deps.db, app.deps.config.STALE_DAYS);
    app.log.info(`stale devices: ${stale.length}`);
  });
}
