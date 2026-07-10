import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/app.js';
import { StubFcmSender } from '../src/services/fcm.js';
import { loadConfig } from '../src/config.js';

describe('health', () => {
  it('GET /health → ok', async () => {
    const config = loadConfig({ DATABASE_URL: 'x', JWT_SECRET: '0123456789abcdef' });
    const app = buildApp({ config, db: {} as any, fcm: new StubFcmSender() });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
    await app.close();
  });
});
