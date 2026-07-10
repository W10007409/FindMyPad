import { loadConfig } from './config.js';
import { createDb } from './db/client.js';
import { StubFcmSender } from './services/fcm.js';
import { buildApp } from './app.js';

const config = loadConfig();
const { db } = createDb(config.DATABASE_URL);
const app = buildApp({ config, db, fcm: new StubFcmSender() });
app.listen({ port: config.PORT, host: '0.0.0.0' })
  .then((addr) => console.log(`listening on ${addr}`))
  .catch((err) => { console.error(err); process.exit(1); });
