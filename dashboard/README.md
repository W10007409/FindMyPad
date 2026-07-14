# pad-tracker dashboard (P3)

관리자용 렌탈 패드 검색/추적 대시보드. React 18 + Vite + TypeScript + Tailwind + TanStack Query + react-leaflet.
P1 서버(`../server`)의 admin API를 소비한다(서버 코드는 이 프로젝트에서 변경하지 않음).

## 로컬 기동

### 1) P1 서버 먼저 기동 (`../server`에서)

```bash
docker compose up -d db
pnpm db:migrate
pnpm seed:admin root secret123 admin
pnpm dev
```

서버가 `http://localhost:3000`에서 뜬다.

### 2) 대시보드 (`dashboard/`에서, 이 디렉터리)

```bash
npm install
npm run dev
```

Vite 개발 서버가 `/api` 요청을 `http://localhost:3000`으로 프록시한다(`vite.config.ts`의
`server.proxy`). 브라우저에서 Vite가 출력하는 로컬 URL(기본 `http://localhost:5173`)로 접속해
`root` / `secret123`으로 로그인한다.

## 스크립트

| 명령 | 설명 |
|---|---|
| `npm run dev` | Vite 개발 서버(핫리로드, `/api` → `localhost:3000` 프록시) |
| `npm run test` | vitest 전체 스위트 1회 실행 (`vitest run`) |
| `npm run test:watch` | vitest watch 모드 |
| `npm run typecheck` | `tsc --noEmit` (타입 에러만 검사, 산출물 없음) |
| `npm run build` | `tsc -b && vite build` — `dist/`에 프로덕션 번들 생성 |
| `npm run preview` | `build` 산출물(`dist/`)을 로컬에서 정적 서빙해 미리보기 |

## 환경 변수

`.env.example` 참고:

```
VITE_API_BASE_URL=/api
```

- 기본값 `/api` — 개발 시 Vite 프록시가 `localhost:3000`으로 전달하므로 별도 설정 없이 동작한다.
- 프로덕션 배포 시 대시보드와 P1 서버가 동일 오리진이 아니면, 서버의 절대 URL(예:
  `https://pad-api.internal/api`)로 재정의한다. 로컬에서 커스터마이즈하려면
  `.env.example`을 `.env.local`로 복사해 값을 바꾼다(`.env*`는 `.gitignore`됨).

## 화면 ↔ P1 admin 엔드포인트

| 화면 | 설명 | P1 엔드포인트 |
|---|---|---|
| 로그인 | username/password로 관리자 JWT 발급, localStorage에 저장 | `POST /api/admin/login` |
| ① 검색 홈 | 이름/사번/자산번호/시리얼 통합 검색 → 결과 카드(현재 사용자, 실내위치/좌표, 마지막 보고, 배터리) | `GET /api/admin/devices?q=` |
| ② 기기 상세 | 헤더 + `<DeviceMap>`(좌표 있으면 마커, 없으면 실내위치 안내) + 최근 보고 목록 + 대여 이력 + 벨 울리기/위치 요청 버튼 | `GET /api/admin/devices/:id`, `POST /api/admin/devices/:id/ring`, `POST /api/admin/devices/:id/locate` |
| ③ 무응답 기기 | 7일 이상(기본) 미보고 기기 목록, 클릭 시 상세로 이동 | `GET /api/admin/alerts/stale?days=7` |
| ④ AP 매핑 관리 | CSV(`bssid,building,floor,zone,note`) 붙여넣기/업로드 → upsert 건수 표시 | `PUT /api/admin/ap-map` |

모든 admin 엔드포인트는 `Authorization: Bearer <token>`이 필요하다(역할 `admin`). 401 응답을 받으면
`api/client.ts`가 등록된 콜백을 통해 자동 로그아웃 후 `/login`으로 보낸다.

## 범위 밖 (후속 Phase)

- **직원용 "내 패드 찾기"** (구현 정의서 §4.3 ⑤) — 사번 본인 소유 기기만 조회하는 화면. P1 서버에
  해당 직원용(본인 기기 한정) 엔드포인트가 아직 없으므로 이번 P3 범위에서 제외했다. 별도
  후속 Phase에서 서버 엔드포인트 추가와 함께 진행한다.
- 감사 로그·위치 데이터 보유기간 UI — 2차 예정.
- 실 지도 타일이 사내망에서 차단될 경우의 대체 타일 서버 — `<DeviceMap>` 컴포넌트 뒤로
  추상화되어 있어 후속 교체가 쉽다.

## 테스트 전략

Vitest + React Testing Library + MSW(P1 admin API 목킹, mock-of-SUT 없이 네트워크 레이어만 목킹).
주요 커버리지:

- `api/client`: Bearer 토큰 부착, 401 시 로그아웃 콜백, `ApiError`
- `auth/AuthContext`: 토큰 지속(localStorage), `RequireAuth` 가드
- `api/hooks`: 검색/상세/무응답/AP매핑/로그인 쿼리·뮤테이션, stale 처리
- 컴포넌트: 실내위치 표기, 좌표 없을 때 폴백, `DeviceMap` 좌표 없음 처리
- 페이지: 로그인(성공/401), 검색, 상세(벨 울리기 POST), 무응답 목록, AP 매핑 업로드
- 라우팅: 미인증 시 로그인으로 리다이렉트

## 아키텍처 메모

```
dashboard/src/
├── main.tsx, App.tsx        # 라우터 + QueryClientProvider + AuthProvider
├── api/                     # client.ts(apiFetch), types.ts, hooks.ts(TanStack Query)
├── auth/                    # AuthContext, LoginPage
├── components/              # Layout, DeviceMap, DeviceCard, Battery, IndoorLabel, StaleBadge, LastSeen, Toast
├── pages/                   # SearchHome, DeviceDetail, StaleDevices, ApMapManage
└── test/                    # setup.ts, msw/handlers.ts
```

자세한 설계는 `docs/superpowers/specs/2026-07-13-p3-dashboard-design.md` 참고.
