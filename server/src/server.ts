import { loadConfig } from './config.js';
import { createDb } from './db/client.js';
import { createFcmSender } from './services/fcm.js';
import { buildApp } from './app.js';
import { startSchedulers } from './jobs/scheduler.js';

const config = loadConfig();
const { db } = createDb(config.DATABASE_URL);
const fcm = createFcmSender(config);
const app = buildApp({ config, db, fcm }, { logger: true });
startSchedulers(app);
app.listen({ port: config.PORT, host: '0.0.0.0' })
  .then((addr) => console.log(`listening on ${addr}`))
  .catch((err) => { console.error(err); process.exit(1); });
