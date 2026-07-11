import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { makeTestApp } from './helpers/app.js';
import { ConflictError } from '../src/errors.js';

const ctx = makeTestApp();
beforeEach(() => ctx.truncate());
afterAll(() => ctx.dispose());

describe('error handler', () => {
  it('AppError → {error:{code,message}} + status', async () => {
    ctx.app.get('/boom', async () => { throw new ConflictError('이미 대여됨'); });
    const res = await ctx.app.inject({ method: 'GET', url: '/boom' });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: { code: 'CONFLICT', message: '이미 대여됨' } });
  });
  it('zod ValidationError → 400 VALIDATION', async () => {
    ctx.app.get('/bad', async () => {
      const { z } = await import('zod');
      z.object({ a: z.string() }).parse({});
    });
    const res = await ctx.app.inject({ method: 'GET', url: '/bad' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION');
  });
});
