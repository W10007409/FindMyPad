const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api';
const TOKEN_KEY = 'pad_token';
let onUnauthorized: (() => void) | null = null;

export class ApiError extends Error {
  constructor(public status: number, public body: unknown) { super(`API error ${status}`); this.name = 'ApiError'; }
}
export function getToken(): string | null { return localStorage.getItem(TOKEN_KEY); }
export function setToken(t: string | null): void { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); }
export function setUnauthorizedHandler(fn: (() => void) | null): void { onUnauthorized = fn; }

async function safeJson(res: Response): Promise<unknown> { try { return await res.json(); } catch { return null; } }

export async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers = new Headers(opts.headers);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  if (res.status === 401) { onUnauthorized?.(); throw new ApiError(401, await safeJson(res)); }
  if (!res.ok) throw new ApiError(res.status, await safeJson(res));
  if (res.status === 204) return undefined as T;
  return (await safeJson(res)) as T;
}
