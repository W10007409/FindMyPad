import { beforeEach, afterEach, describe, expect, test, vi } from 'vitest';
import { apiFetch, ApiError, setToken, getToken, setUnauthorizedHandler } from './client';

describe('apiFetch', () => {
  beforeEach(() => { localStorage.clear(); setUnauthorizedHandler(null); });
  afterEach(() => vi.restoreAllMocks());

  test('attaches Bearer token when set', async () => {
    setToken('TOK-1');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    await apiFetch('/admin/x');
    const [, init] = fetchMock.mock.calls[0];
    expect(new Headers(init!.headers).get('Authorization')).toBe('Bearer TOK-1');
  });

  test('throws ApiError on non-ok', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"error":{"code":"X"}}', { status: 500 }));
    await expect(apiFetch('/admin/x')).rejects.toBeInstanceOf(ApiError);
  });

  test('calls onUnauthorized on 401', async () => {
    const spy = vi.fn();
    setUnauthorizedHandler(spy);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 401 }));
    await expect(apiFetch('/admin/x')).rejects.toBeInstanceOf(ApiError);
    expect(spy).toHaveBeenCalledOnce();
  });

  test('setToken/getToken round-trip via localStorage', () => {
    setToken('abc'); expect(getToken()).toBe('abc');
    setToken(null); expect(getToken()).toBeNull();
  });
});
