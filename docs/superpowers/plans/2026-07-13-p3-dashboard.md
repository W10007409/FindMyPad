# P3 — 관리자 대시보드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자가 렌탈 패드를 검색·조회·벨울리기·무응답 점검·AP매핑 관리하는 React 대시보드를 P1 admin API를 소비해 구현 — 외부 키·하드웨어 없이 `vitest`+`tsc`+`vite build`로 완전 자동 검증.

**Architecture:** React 18 + Vite + TypeScript + Tailwind. TanStack Query로 서버 상태, React Router로 라우팅, AuthContext(JWT)로 인증. API는 얇은 `apiFetch`(Bearer 주입·401 처리) 위에 React Query 훅. 전 구간 jsdom(Vitest + React Testing Library + MSW)에서 실동작 테스트.

**Tech Stack:** React 18.3, Vite 5.4, TypeScript 5.5, Tailwind 3.4, react-router-dom 6.26, @tanstack/react-query 5.56, react-leaflet 4.2 + leaflet 1.9, Vitest 2.1 + @testing-library/react 16 + @testing-library/jest-dom 6 + @testing-library/user-event 14 + MSW 2.4 + jsdom 25. npm(Node 22).

## Global Constraints

- **위치**: `dashboard/` (레포 루트 하위), base 브랜치 main. 패키지 매니저 npm.
- **언어**: TypeScript(strict). React 함수형 컴포넌트 + 훅.
- **API baseUrl**: `import.meta.env.VITE_API_BASE_URL ?? '/api'`. 모든 admin 요청에 `Authorization: Bearer <token>`. 401 응답 → 등록된 onUnauthorized(로그아웃) 호출.
- **P1 API 계약**(소비, 이미 배포됨): `POST /api/admin/login {username,password}`→`{token}`(401 실패); `GET /api/admin/devices?q=`→`{items:DeviceListItem[]}`; `GET /api/admin/devices/:id`→`{device,currentUser,indoor,recentReports,history}`; `POST /api/admin/devices/:id/ring`·`/locate`→`{queued:true}`; `GET /api/admin/alerts/stale?days=7`→`{items:StaleItem[]}`; `PUT /api/admin/ap-map {csv}`→`{upserted}`.
- **GPS 미탑재**: `lat/lng`는 대개 null → 실내위치(building/floor/zone)가 1차 신호. `<DeviceMap>`은 좌표 없음을 우아하게 처리.
- **테스트**: MSW로 P1 응답 목킹, RTL로 실제 렌더·상호작용. 목-of-SUT 금지.
- **스타일**: Tailwind 유틸리티. 다크모드 대응(`dark:`), 반응형.
- **시크릿 없음**: 토큰은 런타임 localStorage. `.gitignore`에 node_modules/dist/.env.
- **DoD 명령**: `npm run test`(vitest run), `npm run typecheck`(tsc --noEmit), `npm run build`(vite build) — 셋 다 그린.

---

## 파일 구조 (책임)

```
FindMyPad/dashboard/
├── package.json, vite.config.ts, tailwind.config.ts, postcss.config.js, tsconfig.json, tsconfig.node.json, index.html, .env.example, .gitignore, README.md
└── src/
    ├── main.tsx, App.tsx, index.css, vite-env.d.ts
    ├── api/ types.ts, client.ts, hooks.ts
    ├── auth/ AuthContext.tsx, LoginPage.tsx
    ├── components/ Layout.tsx, DeviceMap.tsx, DeviceCard.tsx, Battery.tsx, IndoorLabel.tsx, StaleBadge.tsx, LastSeen.tsx, Toast.tsx
    ├── pages/ SearchHome.tsx, DeviceDetail.tsx, StaleDevices.tsx, ApMapManage.tsx
    └── test/ setup.ts, msw/handlers.ts, utils.tsx (renderWithProviders)
```

## 공유 계약 (모든 태스크가 참조 — 이름 정확히)

```ts
// api/types.ts
export interface Indoor { building: string | null; floor: string | null; zone: string | null }
export interface CurrentUser { empNo: string; name: string; dept: string | null }
export interface DeviceListItem {
  id: number; serial: string; assetNo: string | null; model: string | null;
  batteryPct: number | null; lastSeenAt: string | null; lat: number | null; lng: number | null;
  currentUser: CurrentUser | null; indoor: Indoor | null;
}
export interface DeviceRow { id: number; serial: string; assetNo: string | null; model: string | null;
  wifiMac: string | null; knoxLicensed: boolean; enrolledAt: string | null; lastSeenAt: string | null }
export interface Report { id: number; reportedAt: string | null; lat: number | null; lng: number | null;
  bssid: string | null; ssid: string | null; batteryPct: number | null }
export interface HistoryItem { id: number; empNo: string; name: string;
  checkedOut: string | null; returnedAt: string | null; consentAt: string | null }
export interface DeviceDetail { device: DeviceRow; currentUser: CurrentUser | null; indoor: Indoor | null;
  recentReports: Report[]; history: HistoryItem[] }
export interface StaleItem { id: number; serial: string; assetNo: string | null; lastSeenAt: string | null }

// api/client.ts
export class ApiError extends Error { status: number; body: unknown }
export function getToken(): string | null           // localStorage 'pad_token'
export function setToken(t: string | null): void
export function setUnauthorizedHandler(fn: (() => void) | null): void
export function apiFetch<T>(path: string, opts?: RequestInit): Promise<T>

// api/hooks.ts (React Query)
export function useLogin(): mutation → {token}
export function useSearchDevices(q: string): query → DeviceListItem[]
export function useDeviceDetail(id: number): query → DeviceDetail
export function useStaleDevices(days: number): query → StaleItem[]
export function useRing(): mutation(id) ; useLocate(): mutation(id)
export function useApMapUpload(): mutation(csv) → {upserted}

// auth/AuthContext.tsx
useAuth(): { token: string | null; login: (t: string) => void; logout: () => void }
<AuthProvider>, <RequireAuth>
```

---

## Task 1: 스캐폴드 (Vite+React+TS+Tailwind+Vitest+MSW) + 스모크

**Files:**
- Create: `dashboard/package.json`, `vite.config.ts`, `tailwind.config.ts`, `postcss.config.js`, `tsconfig.json`, `tsconfig.node.json`, `index.html`, `.env.example`, `.gitignore`
- Create: `src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/vite-env.d.ts`
- Create: `src/test/setup.ts`
- Test: `src/test/smoke.test.tsx`

**Interfaces:**
- Produces: 빌드/테스트 가능한 앱, `App` 컴포넌트(자리표시), vitest+RTL+jsdom 환경.

- [ ] **Step 1: package.json**

```json
{
  "name": "pad-tracker-dashboard",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.2",
    "@tanstack/react-query": "^5.56.2",
    "leaflet": "^1.9.4",
    "react-leaflet": "^4.2.1"
  },
  "devDependencies": {
    "typescript": "^5.5.4",
    "vite": "^5.4.8",
    "@vitejs/plugin-react": "^4.3.2",
    "tailwindcss": "^3.4.13",
    "postcss": "^8.4.47",
    "autoprefixer": "^10.4.20",
    "vitest": "^2.1.2",
    "jsdom": "^25.0.1",
    "@testing-library/react": "^16.0.1",
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/user-event": "^14.5.2",
    "msw": "^2.4.9",
    "@types/react": "^18.3.11",
    "@types/react-dom": "^18.3.0",
    "@types/leaflet": "^1.9.12"
  }
}
```

- [ ] **Step 2: 설정 파일들**

`vite.config.ts`:
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: true } } },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
```
`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022", "useDefineForClassFields": true, "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext", "skipLibCheck": true, "moduleResolution": "bundler",
    "allowImportingTsExtensions": true, "resolveJsonModule": true, "isolatedModules": true,
    "noEmit": true, "jsx": "react-jsx", "strict": true, "noUnusedLocals": true,
    "noUnusedParameters": true, "noFallthroughCasesInSwitch": true, "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"], "references": [{ "path": "./tsconfig.node.json" }]
}
```
`tsconfig.node.json`:
```json
{ "compilerOptions": { "composite": true, "skipLibCheck": true, "module": "ESNext", "moduleResolution": "bundler", "allowSyntheticDefaultImports": true, "strict": true, "noEmit": true }, "include": ["vite.config.ts"] }
```
`tailwind.config.ts`:
```ts
import type { Config } from 'tailwindcss';
export default { content: ['./index.html', './src/**/*.{ts,tsx}'], darkMode: 'media', theme: { extend: {} }, plugins: [] } satisfies Config;
```
`postcss.config.js`:
```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```
`.env.example`: `VITE_API_BASE_URL=/api`
`.gitignore`:
```
node_modules
dist
.env
.env.local
*.log
```

- [ ] **Step 3: 엔트리 + 앱 자리표시 + css**

`index.html`:
```html
<!doctype html>
<html lang="ko"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>PadTracker 관리자</title></head>
<body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>
```
`src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```
`src/vite-env.d.ts`: `/// <reference types="vite/client" />`
`src/App.tsx`:
```tsx
export default function App() {
  return <div className="p-4 text-lg">PadTracker 관리자</div>;
}
```
`src/main.tsx`:
```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
```

- [ ] **Step 4: 테스트 setup + 스모크 테스트**

`src/test/setup.ts`:
```ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
afterEach(() => cleanup());
```
`src/test/smoke.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { test, expect } from 'vitest';
import App from '../App';
test('renders heading', () => {
  render(<App />);
  expect(screen.getByText('PadTracker 관리자')).toBeInTheDocument();
});
```

- [ ] **Step 5: 빌드 + 테스트 (DoD)**

Run: `cd dashboard && npm install && npm run test && npm run typecheck && npm run build`
Expected: vitest 1 passed, tsc 에러 0, `dist/` 생성. 실패 시 버전/설정 조정.

- [ ] **Step 6: 커밋**

```bash
git add dashboard/package.json dashboard/package-lock.json dashboard/*.ts dashboard/*.js dashboard/*.json dashboard/index.html dashboard/.env.example dashboard/.gitignore dashboard/src
git commit -m "feat(dashboard): scaffold Vite+React+TS+Tailwind+Vitest with smoke test"
```

---

## Task 2: API 타입 + apiFetch 클라이언트 (TDD)

**Files:**
- Create: `src/api/types.ts`, `src/api/client.ts`
- Test: `src/api/client.test.ts`

**Interfaces:**
- Produces: 공유 계약의 모든 타입, `ApiError`, `getToken/setToken`, `setUnauthorizedHandler`, `apiFetch<T>`.

- [ ] **Step 1: 실패 테스트 (fetch 모킹)**

`src/api/client.test.ts`:
```ts
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
```
Run: `npm run test -- client` → FAIL.

- [ ] **Step 2: types.ts (공유 계약 전체)**

공유 계약 §의 타입 전부를 `src/api/types.ts`로 작성.

- [ ] **Step 3: client.ts**

```ts
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
```

- [ ] **Step 4: 통과 + 커밋**

Run: `npm run test -- client` → PASS.
```bash
git add dashboard/src/api/types.ts dashboard/src/api/client.ts dashboard/src/api/client.test.ts
git commit -m "feat(dashboard): API types + apiFetch client (Bearer, 401, ApiError)"
```

---

## Task 3: 인증 컨텍스트 + RequireAuth (TDD)

**Files:**
- Create: `src/auth/AuthContext.tsx`
- Test: `src/auth/AuthContext.test.tsx`

**Interfaces:**
- Produces: `AuthProvider`, `useAuth()→{token,login,logout}`, `RequireAuth`(children 보호). login/logout이 client의 setToken 연동, mount 시 setUnauthorizedHandler(logout).

- [ ] **Step 1: 실패 테스트**

`src/auth/AuthContext.test.tsx`:
```tsx
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { beforeEach, expect, test } from 'vitest';
import { AuthProvider, RequireAuth, useAuth } from './AuthContext';
import { getToken } from '../api/client';

function LoginProbe() { const { login } = useAuth(); return <button onClick={() => login('TOK')}>login</button>; }

beforeEach(() => localStorage.clear());

test('RequireAuth redirects to /login when no token', () => {
  render(
    <MemoryRouter initialEntries={['/secret']}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<div>login page</div>} />
          <Route element={<RequireAuth />}><Route path="/secret" element={<div>secret</div>} /></Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>);
  expect(screen.getByText('login page')).toBeInTheDocument();
});

test('login stores token via client.setToken', () => {
  render(<MemoryRouter><AuthProvider><LoginProbe /></AuthProvider></MemoryRouter>);
  act(() => { screen.getByText('login').click(); });
  expect(getToken()).toBe('TOK');
});
```
Run → FAIL.

- [ ] **Step 2: AuthContext.tsx**

```tsx
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { getToken, setToken, setUnauthorizedHandler } from '../api/client';

interface AuthValue { token: string | null; login: (t: string) => void; logout: () => void }
const AuthCtx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTok] = useState<string | null>(() => getToken());
  const value = useMemo<AuthValue>(() => ({
    token,
    login: (t) => { setToken(t); setTok(t); },
    logout: () => { setToken(null); setTok(null); },
  }), [token]);
  useEffect(() => { setUnauthorizedHandler(() => value.logout()); return () => setUnauthorizedHandler(null); }, [value]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
export function useAuth(): AuthValue { const v = useContext(AuthCtx); if (!v) throw new Error('useAuth outside provider'); return v; }
export function RequireAuth() { const { token } = useAuth(); return token ? <Outlet /> : <Navigate to="/login" replace />; }
```

- [ ] **Step 3: 통과 + 커밋**

Run → PASS.
```bash
git add dashboard/src/auth/AuthContext.tsx dashboard/src/auth/AuthContext.test.tsx
git commit -m "feat(dashboard): auth context + RequireAuth guard"
```

---

## Task 4: React Query 훅 + MSW 핸들러 + 테스트 유틸 (TDD)

**Files:**
- Create: `src/api/hooks.ts`, `src/test/msw/handlers.ts`, `src/test/utils.tsx`
- Modify: `src/test/setup.ts` (MSW 서버 lifecycle)
- Test: `src/api/hooks.test.tsx`

**Interfaces:**
- Produces: `useLogin`, `useSearchDevices`, `useDeviceDetail`, `useStaleDevices`, `useRing`, `useLocate`, `useApMapUpload`; `renderWithProviders`(QueryClient + MemoryRouter); MSW `handlers`.
- Consumes: `apiFetch`, 타입.

- [ ] **Step 1: MSW 핸들러 + setup + 유틸**

`src/test/msw/handlers.ts`:
```ts
import { http, HttpResponse } from 'msw';
export const handlers = [
  http.post('*/api/admin/login', async ({ request }) => {
    const b = (await request.json()) as { username: string; password: string };
    if (b.password === 'good') return HttpResponse.json({ token: 'TOK-OK' });
    return new HttpResponse('{"error":{"code":"UNAUTHORIZED"}}', { status: 401 });
  }),
  http.get('*/api/admin/devices', ({ request }) => {
    const q = new URL(request.url).searchParams.get('q') ?? '';
    return HttpResponse.json({ items: q === 'none' ? [] : [{
      id: 1, serial: 'S1', assetNo: 'A-1', model: 'SM-X200', batteryPct: 55, lastSeenAt: '2026-07-13T00:00:00Z',
      lat: null, lng: null, currentUser: { empNo: 'E100', name: '홍길동', dept: '개발' },
      indoor: { building: '본관', floor: '3', zone: '동측' } }] });
  }),
  http.get('*/api/admin/devices/:id', ({ params }) => HttpResponse.json({
    device: { id: Number(params.id), serial: 'S1', assetNo: 'A-1', model: 'SM-X200', wifiMac: null, knoxLicensed: false, enrolledAt: '2026-07-01T00:00:00Z', lastSeenAt: '2026-07-13T00:00:00Z' },
    currentUser: { empNo: 'E100', name: '홍길동', dept: '개발' },
    indoor: { building: '본관', floor: '3', zone: '동측' },
    recentReports: [{ id: 9, reportedAt: '2026-07-13T00:00:00Z', lat: null, lng: null, bssid: 'AP:1', ssid: 'CORP', batteryPct: 55 }],
    history: [{ id: 3, empNo: 'E100', name: '홍길동', checkedOut: '2026-07-10T00:00:00Z', returnedAt: null, consentAt: '2026-07-10T00:00:00Z' }] })),
  http.post('*/api/admin/devices/:id/ring', () => HttpResponse.json({ queued: true })),
  http.post('*/api/admin/devices/:id/locate', () => HttpResponse.json({ queued: true })),
  http.get('*/api/admin/alerts/stale', () => HttpResponse.json({ items: [{ id: 2, serial: 'STALE1', assetNo: null, lastSeenAt: '2026-07-01T00:00:00Z' }] })),
  http.put('*/api/admin/ap-map', () => HttpResponse.json({ upserted: 2 })),
];
```
`src/test/setup.ts`에 추가:
```ts
import { setupServer } from 'msw/node';
import { beforeAll, afterAll, afterEach } from 'vitest';
import { handlers } from './msw/handlers';
export const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```
`src/test/utils.tsx`:
```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { render } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
export function makeClient() { return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); }
export function Providers({ children, entries = ['/'] }: { children: ReactNode; entries?: string[] }) {
  return <QueryClientProvider client={makeClient()}><MemoryRouter initialEntries={entries}>{children}</MemoryRouter></QueryClientProvider>;
}
export function renderWithProviders(ui: ReactElement, entries?: string[]) { return render(<Providers entries={entries}>{ui}</Providers>); }
```

- [ ] **Step 2: 실패 테스트 (훅)**

`src/api/hooks.test.tsx`:
```tsx
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { expect, test, beforeEach } from 'vitest';
import { makeClient } from '../test/utils';
import { useSearchDevices, useStaleDevices, useRing, useLogin } from './hooks';
import type { ReactNode } from 'react';

function wrap() { const c = makeClient(); return ({ children }: { children: ReactNode }) => <QueryClientProvider client={c}>{children}</QueryClientProvider>; }
beforeEach(() => localStorage.clear());

test('useSearchDevices returns items', async () => {
  const { result } = renderHook(() => useSearchDevices('hong'), { wrapper: wrap() });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data![0].serial).toBe('S1');
});
test('useStaleDevices returns items', async () => {
  const { result } = renderHook(() => useStaleDevices(7), { wrapper: wrap() });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data![0].serial).toBe('STALE1');
});
test('useLogin returns token', async () => {
  const { result } = renderHook(() => useLogin(), { wrapper: wrap() });
  result.current.mutate({ username: 'root', password: 'good' });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data!.token).toBe('TOK-OK');
});
test('useRing succeeds', async () => {
  const { result } = renderHook(() => useRing(), { wrapper: wrap() });
  result.current.mutate(1);
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
});
```
Run → FAIL.

- [ ] **Step 3: hooks.ts**

```ts
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiFetch } from './client';
import type { DeviceDetail, DeviceListItem, StaleItem } from './types';

export function useLogin() {
  return useMutation({
    mutationFn: (b: { username: string; password: string }) =>
      apiFetch<{ token: string }>('/admin/login', { method: 'POST', body: JSON.stringify(b) }),
  });
}
export function useSearchDevices(q: string) {
  return useQuery({
    queryKey: ['devices', q],
    queryFn: async () => (await apiFetch<{ items: DeviceListItem[] }>(`/admin/devices?q=${encodeURIComponent(q)}`)).items,
    enabled: q.length > 0,
  });
}
export function useDeviceDetail(id: number) {
  return useQuery({ queryKey: ['device', id], queryFn: () => apiFetch<DeviceDetail>(`/admin/devices/${id}`) });
}
export function useStaleDevices(days: number) {
  return useQuery({ queryKey: ['stale', days], queryFn: async () => (await apiFetch<{ items: StaleItem[] }>(`/admin/alerts/stale?days=${days}`)).items });
}
export function useRing() { return useMutation({ mutationFn: (id: number) => apiFetch<{ queued: true }>(`/admin/devices/${id}/ring`, { method: 'POST' }) }); }
export function useLocate() { return useMutation({ mutationFn: (id: number) => apiFetch<{ queued: true }>(`/admin/devices/${id}/locate`, { method: 'POST' }) }); }
export function useApMapUpload() { return useMutation({ mutationFn: (csv: string) => apiFetch<{ upserted: number }>('/admin/ap-map', { method: 'PUT', body: JSON.stringify({ csv }) }) }); }
```

- [ ] **Step 4: 통과 + 커밋**

Run: `npm run test -- hooks` → PASS. (또한 `npm run test`로 전체 그린 확인)
```bash
git add dashboard/src/api/hooks.ts dashboard/src/test
git commit -m "feat(dashboard): react-query hooks + MSW handlers + test providers"
```

---

## Task 5: 프레젠테이션 컴포넌트 (Battery/IndoorLabel/StaleBadge/LastSeen/DeviceCard) (TDD)

**Files:**
- Create: `src/components/Battery.tsx`, `IndoorLabel.tsx`, `StaleBadge.tsx`, `LastSeen.tsx`, `DeviceCard.tsx`
- Test: `src/components/components.test.tsx`

**Interfaces:**
- Produces: `<Battery pct>`, `<IndoorLabel indoor>`(null→"실내위치 미확인", 좌표 폴백은 카드에서), `<LastSeen iso>`(상대/절대), `<StaleBadge lastSeenAt days>`, `<DeviceCard item onClick>`.
- Consumes: 타입.

- [ ] **Step 1: 실패 테스트**

`src/components/components.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { IndoorLabel } from './IndoorLabel';
import { Battery } from './Battery';
import { DeviceCard } from './DeviceCard';
import type { DeviceListItem } from '../api/types';

test('IndoorLabel shows building/floor/zone', () => {
  render(<IndoorLabel indoor={{ building: '본관', floor: '3', zone: '동측' }} />);
  expect(screen.getByText(/본관/)).toBeInTheDocument();
  expect(screen.getByText(/3/)).toBeInTheDocument();
});
test('IndoorLabel null shows placeholder', () => {
  render(<IndoorLabel indoor={null} />);
  expect(screen.getByText(/실내위치 미확인/)).toBeInTheDocument();
});
test('Battery shows percent', () => { render(<Battery pct={77} />); expect(screen.getByText(/77%/)).toBeInTheDocument(); });
test('Battery null shows dash', () => { render(<Battery pct={null} />); expect(screen.getByText('—')).toBeInTheDocument(); });

const item: DeviceListItem = { id: 1, serial: 'S1', assetNo: 'A-1', model: 'M', batteryPct: 50, lastSeenAt: '2026-07-13T00:00:00Z', lat: null, lng: null, currentUser: { empNo: 'E1', name: '홍길동', dept: '개발' }, indoor: { building: '본관', floor: '3', zone: '동측' } };
test('DeviceCard shows current user and serial', () => {
  render(<DeviceCard item={item} onClick={() => {}} />);
  expect(screen.getByText('홍길동')).toBeInTheDocument();
  expect(screen.getByText(/S1/)).toBeInTheDocument();
});
```
Run → FAIL.

- [ ] **Step 2: 구현**

`src/components/Battery.tsx`:
```tsx
export function Battery({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-gray-400">—</span>;
  const color = pct <= 15 ? 'text-red-500' : pct <= 40 ? 'text-amber-500' : 'text-green-600';
  return <span className={color}>{pct}%</span>;
}
```
`src/components/IndoorLabel.tsx`:
```tsx
import type { Indoor } from '../api/types';
export function IndoorLabel({ indoor }: { indoor: Indoor | null }) {
  if (!indoor || (!indoor.building && !indoor.floor && !indoor.zone))
    return <span className="text-gray-400">실내위치 미확인</span>;
  const parts = [indoor.building, indoor.floor && `${indoor.floor}층`, indoor.zone].filter(Boolean);
  return <span className="font-medium">{parts.join(' ')}</span>;
}
```
`src/components/LastSeen.tsx`:
```tsx
export function LastSeen({ iso }: { iso: string | null }) {
  if (!iso) return <span className="text-gray-400">보고 없음</span>;
  const d = new Date(iso);
  return <span title={iso}>{d.toLocaleString('ko-KR')}</span>;
}
```
`src/components/StaleBadge.tsx`:
```tsx
export function StaleBadge({ lastSeenAt, days = 7 }: { lastSeenAt: string | null; days?: number }) {
  const stale = lastSeenAt == null || (Date.now() - new Date(lastSeenAt).getTime()) > days * 86_400_000;
  if (!stale) return null;
  return <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-700 dark:bg-red-900/40 dark:text-red-300">무응답</span>;
}
```
> `StaleBadge`는 `Date.now()`를 쓰므로 테스트에서 값 검증은 하지 않고(비결정), 컴포넌트 렌더만 확인하거나 위 테스트 집합에서 제외. (테스트는 Battery/IndoorLabel/DeviceCard만 검증.)

`src/components/DeviceCard.tsx`:
```tsx
import type { DeviceListItem } from '../api/types';
import { Battery } from './Battery';
import { IndoorLabel } from './IndoorLabel';
import { LastSeen } from './LastSeen';
export function DeviceCard({ item, onClick }: { item: DeviceListItem; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full rounded-lg border p-4 text-left hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">
      <div className="flex justify-between">
        <span className="font-semibold">{item.currentUser ? `${item.currentUser.dept ?? ''} ${item.currentUser.name}` : '대여자 없음'}</span>
        <Battery pct={item.batteryPct} />
      </div>
      <div className="mt-1 text-sm text-gray-600 dark:text-gray-300">
        {item.lat != null && item.lng != null ? `좌표 ${item.lat.toFixed(4)}, ${item.lng.toFixed(4)}` : <IndoorLabel indoor={item.indoor} />}
      </div>
      <div className="mt-1 text-xs text-gray-400">{item.serial} · {item.assetNo ?? '자산번호 없음'} · <LastSeen iso={item.lastSeenAt} /></div>
    </button>
  );
}
```

- [ ] **Step 3: 통과 + 커밋**

Run: `npm run test -- components` → PASS.
```bash
git add dashboard/src/components/Battery.tsx dashboard/src/components/IndoorLabel.tsx dashboard/src/components/StaleBadge.tsx dashboard/src/components/LastSeen.tsx dashboard/src/components/DeviceCard.tsx dashboard/src/components/components.test.tsx
git commit -m "feat(dashboard): presentational components (Battery/IndoorLabel/LastSeen/StaleBadge/DeviceCard)"
```

---

## Task 6: DeviceMap 추상화 (좌표 없음 처리) (TDD)

**Files:**
- Create: `src/components/DeviceMap.tsx`
- Test: `src/components/DeviceMap.test.tsx`

**Interfaces:**
- Produces: `<DeviceMap lat lng indoor>`; 좌표 있으면 지도(react-leaflet), 없으면 실내위치 안내. 순수 판정 `hasCoords(lat,lng)` export.

- [ ] **Step 1: 실패 테스트 (leaflet 모킹)**

`src/components/DeviceMap.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { DeviceMap, hasCoords } from './DeviceMap';

// react-leaflet은 jsdom에서 무겁다 → 모킹
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: any) => <div data-testid="map">{children}</div>,
  TileLayer: () => null, Marker: ({ children }: any) => <div>{children}</div>, Popup: ({ children }: any) => <div>{children}</div>,
}));

test('hasCoords', () => { expect(hasCoords(1, 2)).toBe(true); expect(hasCoords(null, 2)).toBe(false); expect(hasCoords(1, null)).toBe(false); });
test('renders map when coords present', () => {
  render(<DeviceMap lat={37.5} lng={127} indoor={null} />);
  expect(screen.getByTestId('map')).toBeInTheDocument();
});
test('renders indoor fallback when no coords', () => {
  render(<DeviceMap lat={null} lng={null} indoor={{ building: '본관', floor: '3', zone: '동측' }} />);
  expect(screen.getByText(/네트워크 좌표 없음/)).toBeInTheDocument();
  expect(screen.getByText(/본관/)).toBeInTheDocument();
});
```
Run → FAIL.

- [ ] **Step 2: DeviceMap.tsx**

```tsx
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { Indoor } from '../api/types';
import { IndoorLabel } from './IndoorLabel';

export function hasCoords(lat: number | null, lng: number | null): boolean { return lat != null && lng != null; }

export function DeviceMap({ lat, lng, indoor }: { lat: number | null; lng: number | null; indoor: Indoor | null }) {
  if (!hasCoords(lat, lng)) {
    return (
      <div className="flex h-64 flex-col items-center justify-center rounded-lg border bg-gray-50 text-center dark:border-gray-700 dark:bg-gray-800">
        <p className="text-sm text-gray-500">네트워크 좌표 없음 — 실내위치 기준</p>
        <p className="mt-2 text-lg"><IndoorLabel indoor={indoor} /></p>
      </div>
    );
  }
  return (
    <MapContainer center={[lat!, lng!]} zoom={17} className="h-64 w-full rounded-lg" scrollWheelZoom={false}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
      <Marker position={[lat!, lng!]}><Popup><IndoorLabel indoor={indoor} /></Popup></Marker>
    </MapContainer>
  );
}
```
> `leaflet/dist/leaflet.css` import는 vite build에서 처리. 테스트는 react-leaflet 모킹으로 우회. vitest `css:false`라 css import 무시됨.

- [ ] **Step 3: 통과 + 커밋**

Run: `npm run test -- DeviceMap` → PASS.
```bash
git add dashboard/src/components/DeviceMap.tsx dashboard/src/components/DeviceMap.test.tsx
git commit -m "feat(dashboard): DeviceMap abstraction with no-coords indoor fallback"
```

---

## Task 7: 로그인 페이지 (TDD)

**Files:**
- Create: `src/auth/LoginPage.tsx`
- Test: `src/auth/LoginPage.test.tsx`

**Interfaces:**
- Produces: `<LoginPage>` — username/password 폼, `useLogin` 뮤테이션, 성공 시 `login(token)` + `/`로 이동, 실패 시 에러.
- Consumes: `useLogin`, `useAuth`, react-router `useNavigate`.

- [ ] **Step 1: 실패 테스트 (user-event + MSW)**

`src/auth/LoginPage.test.tsx`:
```tsx
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, beforeEach } from 'vitest';
import { Routes, Route } from 'react-router-dom';
import { renderWithProviders } from '../test/utils';
import { AuthProvider } from './AuthContext';
import { LoginPage } from './LoginPage';
import { getToken } from '../api/client';

beforeEach(() => localStorage.clear());

function setup() {
  return renderWithProviders(
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<div>홈</div>} />
      </Routes>
    </AuthProvider>, ['/login']);
}

test('successful login stores token and navigates home', async () => {
  setup();
  await userEvent.type(screen.getByLabelText(/아이디/), 'root');
  await userEvent.type(screen.getByLabelText(/비밀번호/), 'good');
  await userEvent.click(screen.getByRole('button', { name: /로그인/ }));
  await waitFor(() => expect(screen.getByText('홈')).toBeInTheDocument());
  expect(getToken()).toBe('TOK-OK');
});
test('failed login shows error', async () => {
  setup();
  await userEvent.type(screen.getByLabelText(/아이디/), 'root');
  await userEvent.type(screen.getByLabelText(/비밀번호/), 'bad');
  await userEvent.click(screen.getByRole('button', { name: /로그인/ }));
  await waitFor(() => expect(screen.getByText(/로그인 실패/)).toBeInTheDocument());
});
```
Run → FAIL.

- [ ] **Step 2: LoginPage.tsx**

```tsx
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLogin } from '../api/hooks';
import { useAuth } from './AuthContext';

export function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const login = useLogin();
  const auth = useAuth();
  const navigate = useNavigate();
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    login.mutate({ username, password }, { onSuccess: (d) => { auth.login(d.token); navigate('/', { replace: true }); } });
  }
  return (
    <div className="mx-auto mt-24 max-w-sm rounded-lg border p-6 dark:border-gray-700">
      <h1 className="mb-4 text-xl font-bold">PadTracker 관리자</h1>
      <form onSubmit={onSubmit} className="space-y-3">
        <label className="block text-sm">아이디
          <input className="mt-1 w-full rounded border p-2 dark:bg-gray-800" value={username} onChange={(e) => setUsername(e.target.value)} /></label>
        <label className="block text-sm">비밀번호
          <input type="password" className="mt-1 w-full rounded border p-2 dark:bg-gray-800" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <button type="submit" disabled={login.isPending} className="w-full rounded bg-blue-600 p-2 text-white disabled:opacity-50">로그인</button>
        {login.isError && <p className="text-sm text-red-600">로그인 실패 — 아이디/비밀번호를 확인하세요</p>}
      </form>
    </div>
  );
}
```

- [ ] **Step 3: 통과 + 커밋**

Run: `npm run test -- LoginPage` → PASS.
```bash
git add dashboard/src/auth/LoginPage.tsx dashboard/src/auth/LoginPage.test.tsx
git commit -m "feat(dashboard): login page (useLogin + auth + navigate)"
```

---

## Task 8: 검색 홈 페이지 (TDD)

**Files:**
- Create: `src/pages/SearchHome.tsx`
- Test: `src/pages/SearchHome.test.tsx`

**Interfaces:**
- Produces: `<SearchHome>` — 검색창, `useSearchDevices`, 결과 `DeviceCard` 목록, 카드 클릭 → `/devices/:id` 네비.
- Consumes: `useSearchDevices`, `DeviceCard`, `useNavigate`.

- [ ] **Step 1: 실패 테스트**

`src/pages/SearchHome.test.tsx`:
```tsx
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';
import { Routes, Route } from 'react-router-dom';
import { renderWithProviders } from '../test/utils';
import { SearchHome } from './SearchHome';

test('search shows result card', async () => {
  renderWithProviders(
    <Routes>
      <Route path="/" element={<SearchHome />} />
      <Route path="/devices/:id" element={<div>상세</div>} />
    </Routes>);
  await userEvent.type(screen.getByPlaceholderText(/이름.*사번/), 'hong');
  await waitFor(() => expect(screen.getByText('홍길동')).toBeInTheDocument());
  expect(screen.getByText(/본관/)).toBeInTheDocument();
});
```
Run → FAIL.

- [ ] **Step 2: SearchHome.tsx**

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSearchDevices } from '../api/hooks';
import { DeviceCard } from '../components/DeviceCard';

export function SearchHome() {
  const [q, setQ] = useState('');
  const { data, isFetching, isError } = useSearchDevices(q);
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-3xl p-4">
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름 · 사번 · 자산번호 · 시리얼 검색"
        className="w-full rounded-lg border p-3 dark:bg-gray-800" />
      {isFetching && <p className="mt-3 text-sm text-gray-500">검색 중…</p>}
      {isError && <p className="mt-3 text-sm text-red-600">검색 오류</p>}
      <div className="mt-4 space-y-3">
        {data?.map((it) => <DeviceCard key={it.id} item={it} onClick={() => navigate(`/devices/${it.id}`)} />)}
        {data?.length === 0 && q && <p className="text-sm text-gray-500">결과 없음</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 통과 + 커밋**

Run: `npm run test -- SearchHome` → PASS.
```bash
git add dashboard/src/pages/SearchHome.tsx dashboard/src/pages/SearchHome.test.tsx
git commit -m "feat(dashboard): search home page"
```

---

## Task 9: 기기 상세 페이지 (지도+이력+벨울리기) (TDD)

**Files:**
- Create: `src/pages/DeviceDetail.tsx`, `src/components/Toast.tsx`(간단 인라인 알림)
- Test: `src/pages/DeviceDetail.test.tsx`

**Interfaces:**
- Produces: `<DeviceDetail>` — `useDeviceDetail(id)`, `<DeviceMap>`, 최근 보고·대여 이력, [벨 울리기]/[지금 위치 요청] → `useRing`/`useLocate` + 성공 알림.
- Consumes: `useDeviceDetail`, `useRing`, `useLocate`, `useParams`, react-leaflet(모킹).

- [ ] **Step 1: 실패 테스트**

`src/pages/DeviceDetail.test.tsx`:
```tsx
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { Routes, Route } from 'react-router-dom';
import { renderWithProviders } from '../test/utils';
import { DeviceDetail } from './DeviceDetail';

vi.mock('react-leaflet', () => ({ MapContainer: ({ children }: any) => <div data-testid="map">{children}</div>, TileLayer: () => null, Marker: ({ children }: any) => <div>{children}</div>, Popup: ({ children }: any) => <div>{children}</div> }));

function setup() { return renderWithProviders(<Routes><Route path="/devices/:id" element={<DeviceDetail />} /></Routes>, ['/devices/1']); }

test('renders detail with user, indoor, history', async () => {
  setup();
  await waitFor(() => expect(screen.getByText('홍길동')).toBeInTheDocument());
  expect(screen.getByText(/본관/)).toBeInTheDocument();
  expect(screen.getByText(/S1/)).toBeInTheDocument();
});
test('ring button triggers request and shows sent notice', async () => {
  setup();
  await waitFor(() => screen.getByText('홍길동'));
  await userEvent.click(screen.getByRole('button', { name: /벨 울리기/ }));
  await waitFor(() => expect(screen.getByText(/전송됨/)).toBeInTheDocument());
});
```
Run → FAIL.

- [ ] **Step 2: Toast.tsx + DeviceDetail.tsx**

`src/components/Toast.tsx`:
```tsx
export function Toast({ message }: { message: string }) {
  return <div className="fixed bottom-6 right-6 rounded bg-gray-900 px-4 py-2 text-white shadow-lg">{message}</div>;
}
```
`src/pages/DeviceDetail.tsx`:
```tsx
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useDeviceDetail, useLocate, useRing } from '../api/hooks';
import { DeviceMap } from '../components/DeviceMap';
import { IndoorLabel } from '../components/IndoorLabel';
import { Battery } from '../components/Battery';
import { LastSeen } from '../components/LastSeen';
import { Toast } from '../components/Toast';

export function DeviceDetail() {
  const { id } = useParams();
  const deviceId = Number(id);
  const { data, isLoading, isError } = useDeviceDetail(deviceId);
  const ring = useRing();
  const locate = useLocate();
  const [toast, setToast] = useState<string | null>(null);
  function notify(msg: string) { setToast(msg); setTimeout(() => setToast(null), 2500); }
  if (isLoading) return <p className="p-4">불러오는 중…</p>;
  if (isError || !data) return <p className="p-4 text-red-600">기기를 찾을 수 없습니다</p>;
  const latest = data.recentReports[0];
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{data.device.serial} <span className="text-sm text-gray-500">{data.device.assetNo}</span></h1>
          <p className="text-sm text-gray-600 dark:text-gray-300">{data.currentUser ? `${data.currentUser.dept ?? ''} ${data.currentUser.name} (${data.currentUser.empNo})` : '대여자 없음'}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => ring.mutate(deviceId, { onSuccess: () => notify('벨울리기 전송됨') })} className="rounded bg-blue-600 px-3 py-2 text-white">벨 울리기</button>
          <button onClick={() => locate.mutate(deviceId, { onSuccess: () => notify('위치 요청 전송됨') })} className="rounded border px-3 py-2">지금 위치 요청</button>
        </div>
      </div>
      <DeviceMap lat={latest?.lat ?? null} lng={latest?.lng ?? null} indoor={data.indoor} />
      <section>
        <h2 className="mb-2 font-semibold">최근 보고</h2>
        <ul className="space-y-1 text-sm">
          {data.recentReports.map((r) => (
            <li key={r.id} className="flex justify-between rounded border p-2 dark:border-gray-700">
              <LastSeen iso={r.reportedAt} /><IndoorLabel indoor={data.indoor} /><Battery pct={r.batteryPct} />
            </li>))}
        </ul>
      </section>
      <section>
        <h2 className="mb-2 font-semibold">대여 이력</h2>
        <ul className="space-y-1 text-sm">
          {data.history.map((h) => (
            <li key={h.id} className="rounded border p-2 dark:border-gray-700">{h.name} ({h.empNo}) · <LastSeen iso={h.checkedOut} /> → {h.returnedAt ? <LastSeen iso={h.returnedAt} /> : '대여 중'}</li>))}
        </ul>
      </section>
      {toast && <Toast message={toast} />}
    </div>
  );
}
```

- [ ] **Step 3: 통과 + 커밋**

Run: `npm run test -- DeviceDetail` → PASS.
```bash
git add dashboard/src/pages/DeviceDetail.tsx dashboard/src/components/Toast.tsx dashboard/src/pages/DeviceDetail.test.tsx
git commit -m "feat(dashboard): device detail page (map + reports + history + ring/locate)"
```

---

## Task 10: 무응답 기기 페이지 (TDD)

**Files:**
- Create: `src/pages/StaleDevices.tsx`
- Test: `src/pages/StaleDevices.test.tsx`

**Interfaces:**
- Produces: `<StaleDevices>` — `useStaleDevices(7)`, 목록(시리얼·자산번호·마지막 보고), 항목 클릭 → 상세.
- Consumes: `useStaleDevices`, `useNavigate`, `LastSeen`.

- [ ] **Step 1: 실패 테스트**

```tsx
import { screen, waitFor } from '@testing-library/react';
import { expect, test } from 'vitest';
import { Routes, Route } from 'react-router-dom';
import { renderWithProviders } from '../test/utils';
import { StaleDevices } from './StaleDevices';
test('lists stale devices', async () => {
  renderWithProviders(<Routes><Route path="/" element={<StaleDevices />} /></Routes>);
  await waitFor(() => expect(screen.getByText('STALE1')).toBeInTheDocument());
});
```
Run → FAIL.

- [ ] **Step 2: StaleDevices.tsx**

```tsx
import { useNavigate } from 'react-router-dom';
import { useStaleDevices } from '../api/hooks';
import { LastSeen } from '../components/LastSeen';

export function StaleDevices() {
  const { data, isLoading, isError } = useStaleDevices(7);
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-3xl p-4">
      <h1 className="mb-3 text-xl font-bold">무응답 기기 <span className="text-sm font-normal text-gray-500">(7일+ 미보고 · 분실 의심)</span></h1>
      {isLoading && <p className="text-sm text-gray-500">불러오는 중…</p>}
      {isError && <p className="text-sm text-red-600">조회 오류</p>}
      <ul className="space-y-2">
        {data?.map((s) => (
          <li key={s.id}><button onClick={() => navigate(`/devices/${s.id}`)} className="w-full rounded border p-3 text-left hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">
            <span className="font-medium">{s.serial}</span> · {s.assetNo ?? '자산번호 없음'} · 마지막 <LastSeen iso={s.lastSeenAt} />
          </button></li>))}
        {data?.length === 0 && <p className="text-sm text-gray-500">무응답 기기 없음</p>}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: 통과 + 커밋**

Run: `npm run test -- StaleDevices` → PASS.
```bash
git add dashboard/src/pages/StaleDevices.tsx dashboard/src/pages/StaleDevices.test.tsx
git commit -m "feat(dashboard): stale devices page"
```

---

## Task 11: AP 매핑 관리 페이지 (TDD)

**Files:**
- Create: `src/pages/ApMapManage.tsx`
- Test: `src/pages/ApMapManage.test.tsx`

**Interfaces:**
- Produces: `<ApMapManage>` — CSV textarea + 업로드 버튼 → `useApMapUpload`, `{upserted}` 결과 표시, 템플릿 헤더 안내.
- Consumes: `useApMapUpload`.

- [ ] **Step 1: 실패 테스트**

```tsx
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';
import { renderWithProviders } from '../test/utils';
import { ApMapManage } from './ApMapManage';
test('uploads csv and shows upserted count', async () => {
  renderWithProviders(<ApMapManage />);
  await userEvent.type(screen.getByLabelText(/CSV/), 'bssid,building\nAP:1,본관');
  await userEvent.click(screen.getByRole('button', { name: /업로드/ }));
  await waitFor(() => expect(screen.getByText(/2건/)).toBeInTheDocument());
});
```
Run → FAIL.

- [ ] **Step 2: ApMapManage.tsx**

```tsx
import { useState } from 'react';
import { useApMapUpload } from '../api/hooks';

export function ApMapManage() {
  const [csv, setCsv] = useState('');
  const upload = useApMapUpload();
  return (
    <div className="mx-auto max-w-3xl p-4">
      <h1 className="mb-2 text-xl font-bold">AP 매핑 관리</h1>
      <p className="mb-3 text-sm text-gray-500">헤더: <code>bssid,building,floor,zone,note</code></p>
      <label className="block text-sm">CSV
        <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={10}
          className="mt-1 w-full rounded border p-2 font-mono text-sm dark:bg-gray-800" placeholder="bssid,building,floor,zone,note" /></label>
      <button onClick={() => upload.mutate(csv)} disabled={!csv || upload.isPending}
        className="mt-3 rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50">업로드</button>
      {upload.isSuccess && <p className="mt-3 text-green-700">{upload.data.upserted}건 업서트됨</p>}
      {upload.isError && <p className="mt-3 text-red-600">업로드 실패</p>}
    </div>
  );
}
```

- [ ] **Step 3: 통과 + 커밋**

Run: `npm run test -- ApMapManage` → PASS.
```bash
git add dashboard/src/pages/ApMapManage.tsx dashboard/src/pages/ApMapManage.test.tsx
git commit -m "feat(dashboard): AP mapping management page (CSV upsert)"
```

---

## Task 12: 라우팅 + 레이아웃 + Provider 배선 (TDD 통합)

**Files:**
- Modify: `src/App.tsx`, `src/main.tsx`
- Create: `src/components/Layout.tsx`
- Test: `src/App.test.tsx`

**Interfaces:**
- Produces: 라우트 트리(`/login` 공개, 나머지 `RequireAuth` 하에 `/`=검색, `/devices/:id`, `/stale`, `/ap-map`), `Layout`(네비바+로그아웃). `main.tsx`가 QueryClientProvider+AuthProvider+BrowserRouter 배선.
- Consumes: 전 페이지, AuthContext.

- [ ] **Step 1: 실패 테스트 (통합: 미인증→로그인, 인증→검색)**

`src/App.test.tsx`:
```tsx
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, test, beforeEach, vi } from 'vitest';
import { makeClient } from './test/utils';
import { AppRoutes } from './App';
import { AuthProvider } from './auth/AuthContext';

vi.mock('react-leaflet', () => ({ MapContainer: ({ children }: any) => <div>{children}</div>, TileLayer: () => null, Marker: ({ children }: any) => <div>{children}</div>, Popup: ({ children }: any) => <div>{children}</div> }));
beforeEach(() => localStorage.clear());

function renderAt(entries: string[]) {
  return { user: userEvent.setup(), ...render(entries) };
  function render(e: string[]) {
    const { render: rtlRender } = require('@testing-library/react');
    return rtlRender(<QueryClientProvider client={makeClient()}><MemoryRouter initialEntries={e}><AuthProvider><AppRoutes /></AuthProvider></MemoryRouter></QueryClientProvider>);
  }
}

test('unauthenticated visit to / redirects to login', () => {
  renderAt(['/']);
  expect(screen.getByRole('button', { name: /로그인/ })).toBeInTheDocument();
});
test('after login, search home is reachable', async () => {
  const u = userEvent.setup();
  // ... render at /login, log in with good creds, expect search input
});
```
> 참고: 위 `renderAt` 헬퍼는 예시다. 실제 구현 시 `renderWithProviders` 확장(Auth 포함)으로 정리하고, 최소 "미인증 `/`→로그인 버튼 노출" 1케이스는 반드시 통과시킨다. 인증 후 흐름은 로그인 폼 제출→검색창(placeholder) 노출로 검증.

Run → FAIL.

- [ ] **Step 2: Layout + App(AppRoutes) + main 배선**

`src/components/Layout.tsx`:
```tsx
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
export function Layout() {
  const { logout } = useAuth();
  const cls = ({ isActive }: { isActive: boolean }) => `px-3 py-2 text-sm ${isActive ? 'font-semibold text-blue-600' : 'text-gray-600 dark:text-gray-300'}`;
  return (
    <div className="min-h-screen bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100">
      <header className="flex items-center justify-between border-b px-4 dark:border-gray-700">
        <nav className="flex gap-1">
          <NavLink to="/" end className={cls}>검색</NavLink>
          <NavLink to="/stale" className={cls}>무응답</NavLink>
          <NavLink to="/ap-map" className={cls}>AP매핑</NavLink>
        </nav>
        <button onClick={logout} className="text-sm text-gray-500 hover:underline">로그아웃</button>
      </header>
      <main><Outlet /></main>
    </div>
  );
}
```
`src/App.tsx`:
```tsx
import { Routes, Route } from 'react-router-dom';
import { RequireAuth } from './auth/AuthContext';
import { Layout } from './components/Layout';
import { LoginPage } from './auth/LoginPage';
import { SearchHome } from './pages/SearchHome';
import { DeviceDetail } from './pages/DeviceDetail';
import { StaleDevices } from './pages/StaleDevices';
import { ApMapManage } from './pages/ApMapManage';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route path="/" element={<SearchHome />} />
          <Route path="/devices/:id" element={<DeviceDetail />} />
          <Route path="/stale" element={<StaleDevices />} />
          <Route path="/ap-map" element={<ApMapManage />} />
        </Route>
      </Route>
    </Routes>
  );
}
export default function App() { return <AppRoutes />; }
```
`src/main.tsx`:
```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { AuthProvider } from './auth/AuthContext';
import './index.css';
const queryClient = new QueryClient();
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter><AuthProvider><App /></AuthProvider></BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>);
```
> `smoke.test.tsx`(Task 1)는 이제 라우터/Provider가 필요하므로, App이 Routes만 렌더한다면 스모크 테스트를 `renderWithProviders(<App/>)` + 미인증 → 로그인 노출로 갱신하거나 삭제한다. 이 태스크에서 스모크 테스트를 정리한다.

- [ ] **Step 3: 통과 + 커밋**

Run: `npm run test` (전체) → PASS. `npm run typecheck` → 0 에러.
```bash
git add dashboard/src/App.tsx dashboard/src/main.tsx dashboard/src/components/Layout.tsx dashboard/src/App.test.tsx dashboard/src/test/smoke.test.tsx
git commit -m "feat(dashboard): routing + layout + provider wiring (auth-gated routes)"
```

---

## Task 13: README + .env + DoD 최종 검증

**Files:**
- Create: `dashboard/README.md`
- Test: 전체 스위트 + build

- [ ] **Step 1: README.md**

로컬 기동: `npm install`, P1 서버 기동(`../server`: docker compose + migrate + seed + dev), `npm run dev`(프록시로 `/api`→localhost:3000). 테스트/빌드: `npm run test`, `npm run typecheck`, `npm run build`. 화면·엔드포인트 요약. 직원용 화면은 후속(서버 엔드포인트 필요) 명시.

- [ ] **Step 2: DoD 최종 검증**

Run: `cd dashboard && npm run test && npm run typecheck && npm run build`
Expected: vitest 전 그린, tsc 0 에러, `dist/` 생성. 커버리지: client(Bearer/401), auth(가드), hooks(검색/stale/login/ring), 컴포넌트(실내위치/좌표 폴백), DeviceMap(no-coords), 로그인, 검색, 상세(벨울리기), 무응답, AP매핑, 라우팅(미인증 가드).

- [ ] **Step 3: (선택) 브라우저 스모크**

P1 서버 기동 후 `npm run dev` → Chrome 자동화로 로그인→검색→상세→벨울리기 확인(가능 시). 실패해도 DoD는 유닛으로 충족.

- [ ] **Step 4: 최종 커밋**

```bash
git add dashboard/README.md
git commit -m "docs(dashboard): README + P3 DoD complete"
```

---

## Self-Review (스펙 대비 커버리지)

| 스펙 §5 화면 | 태스크 |
|---|---|
| 로그인 | 7 |
| ① 검색 홈 | 8 (+DeviceCard 5) |
| ② 기기 상세(지도·이력·벨울리기) | 9 (+DeviceMap 6) |
| ③ 무응답 기기 | 10 |
| ④ AP 매핑 관리 | 11 |

| 스펙 §8 테스트 | 태스크 |
|---|---|
| 로그인 성공/실패 401 | 7 |
| 검색 결과·실내위치·좌표 폴백 | 5, 8 |
| 상세 벨울리기 POST | 9 |
| 무응답 목록 | 10 |
| AP매핑 업로드 | 11 |
| 401 인터셉트→로그아웃 | 2, 3 |

| 스펙 제약 | 태스크 |
|---|---|
| apiFetch Bearer/401 | 2 |
| 인증 가드 | 3, 12 |
| DeviceMap 좌표없음 처리 | 6 |
| vite build + tsc + vitest | 1, 13 |

**미해결/주의:**
- Task 12의 App.test 헬퍼는 예시 — 구현 시 `renderWithProviders`에 Auth를 포함한 버전으로 정리하고 최소 "미인증 가드" 케이스를 통과시킨다.
- `StaleBadge`/`LastSeen`은 `Date.now()`/`new Date()` 사용(비결정) → 값이 아닌 렌더/존재만 검증.
- 실 지도 타일·실서버 브라우저 스모크는 선택(사내망 타일 차단 시 `<DeviceMap>` 교체).
- 직원용 화면(§4.3 ⑤)은 서버 엔드포인트 필요 → 범위 밖.
