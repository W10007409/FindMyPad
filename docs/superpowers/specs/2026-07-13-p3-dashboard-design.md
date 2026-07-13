# P3 — 관리자 대시보드 설계 (spec)

> **Phase**: P3. React 관리자 웹 대시보드. P1 서버 admin API를 소비. Knox·실기기·키 없이 100% 자동 개발·검증.
> **완료 기준**: `vitest run` 그린 + `tsc --noEmit` + `vite build` 성공. (+선택: Chrome 브라우저 스모크)
> **선행 문서**: 「구현 정의서」 §4.3, 「개발 실행 설계서」(2026-07-10), P1 완료(admin API 고정).
> **작성일**: 2026-07-13

---

## 1. 목표 & 범위

관리자가 이름/사번/자산번호/시리얼로 렌탈 패드를 검색하고, 마지막 위치·현재 사용자를 확인하고, 벨을 울려 찾고, 무응답 기기를 점검하고, AP 매핑표를 관리하는 웹 대시보드. P1 서버 admin 엔드포인트를 소비한다(서버 변경 없음).

**범위(In) — 관리자 화면 ①~④ (+로그인)**
- 로그인(관리자 JWT).
- ① 통합 검색 홈, ② 기기 상세(지도+이력+벨울리기/위치요청), ③ 무응답 기기, ④ AP 매핑 관리.
- P1 API 클라이언트(Bearer 주입, 401 처리), React Query 데이터 훅.
- Vitest + Testing Library + MSW 자동 테스트.

**범위 밖(Out — 후속/서버 게이트)**
- **직원용 "내 패드 찾기"(정의서 §4.3 ⑤)** → 서버에 직원용(본인 기기 한정, 사번 권한) 엔드포인트가 없음. 별도 Phase(서버+대시보드 확장).
- 감사 로그·위치 데이터 보유기간 UI → 2차.
- 실 지도 타일이 사내망에서 차단될 경우의 대체 타일 서버 → `<DeviceMap>` 추상화로 후속 교체.

## 2. 결정 사항 (brainstorming 확정)

| 항목 | 결정 |
|---|---|
| 스택 | React 18 + Vite + TypeScript |
| 스타일 | **Tailwind** (깔끔한 기능형, 반응형, 다크모드 기본) |
| 라우팅 | React Router |
| 데이터 페칭 | **TanStack Query**(React Query) — 캐싱·로딩·에러·리페치 |
| 지도 | react-leaflet(OSM) — `<DeviceMap>` 뒤로 추상화, 교체 가능 |
| 인증 | 관리자 JWT (localStorage + Context), Bearer 주입, 401→로그아웃 |
| 테스트 | Vitest + React Testing Library + **MSW**(P1 API 목킹) |
| 위치 | `dashboard/`, base 브랜치 main |
| 패키지 매니저 | npm (Node 22) |

## 3. 프로젝트 구조

```
FindMyPad/dashboard/
├── index.html, vite.config.ts, tailwind.config.ts, postcss.config.js, tsconfig.json, .env.example
└── src/
    ├── main.tsx, App.tsx            # 라우터 + QueryClientProvider + AuthProvider
    ├── index.css                    # tailwind 지시어
    ├── api/
    │   ├── client.ts                # apiFetch: baseUrl + Bearer + 401 콜백; ApiError
    │   ├── types.ts                 # DeviceListItem, DeviceDetail, Report, Checkout, Indoor, StaleItem
    │   └── hooks.ts                 # useSearchDevices, useDeviceDetail, useStaleDevices, useRing, useLocate, useApMapUpload, useLogin
    ├── auth/
    │   ├── AuthContext.tsx          # token 상태, login()/logout(), RequireAuth
    │   └── LoginPage.tsx
    ├── components/
    │   ├── Layout.tsx               # 상단바(로그아웃) + 네비 + <Outlet>
    │   ├── DeviceMap.tsx            # Leaflet 추상화; 좌표 없으면 대체 안내
    │   ├── DeviceCard.tsx, Battery.tsx, IndoorLabel.tsx, StaleBadge.tsx, LastSeen.tsx
    ├── pages/
    │   ├── SearchHome.tsx
    │   ├── DeviceDetail.tsx
    │   ├── StaleDevices.tsx
    │   └── ApMapManage.tsx
    └── test/
        ├── setup.ts                 # RTL + jest-dom + MSW 서버 lifecycle
        └── msw/handlers.ts          # P1 admin 엔드포인트 목 핸들러
```

## 4. P1 API 계약 (소비 대상, 이미 배포됨)

| 화면 | Method Path | 응답 |
|---|---|---|
| 로그인 | `POST /api/admin/login {username,password}` | `{token}` (실패 401) |
| ① 검색 | `GET /api/admin/devices?q=` | `{items:[{id,serial,assetNo,model,batteryPct,lastSeenAt,lat,lng,currentUser:{empNo,name,dept}|null,indoor:{building,floor,zone}|null}]}` |
| ② 상세 | `GET /api/admin/devices/:id` | `{device,currentUser,indoor,recentReports:[{id,reportedAt,lat,lng,bssid,ssid,batteryPct}],history:[{id,empNo,name,checkedOut,returnedAt,consentAt}]}` |
| ② 벨/위치 | `POST /api/admin/devices/:id/ring` · `POST /api/admin/devices/:id/locate` | `{queued:true}` |
| ③ 무응답 | `GET /api/admin/alerts/stale?days=7` | `{items:[{id,serial,assetNo,lastSeenAt}]}` |
| ④ AP매핑 | `PUT /api/admin/ap-map {csv}` | `{upserted:number}` |

모든 admin 엔드포인트는 `Authorization: Bearer <token>` 필요(역할 `admin`). 401 시 로그아웃.

## 5. 화면 명세

1. **로그인** — username/password → `useLogin` → 토큰 저장 → 검색 홈 이동. 실패 시 에러 표시.
2. **① 검색 홈** — 통합 검색창(이름/사번/자산번호/시리얼). 입력 → `useSearchDevices(q)` → 결과 카드 목록: 현재 사용자(부서·이름) 또는 "대여자 없음", **실내위치(예: 본관 3층 동측)** 또는 좌표, 마지막 보고 시각(상대시간), 배터리. 카드 클릭 → 상세.
3. **② 기기 상세** — 헤더(시리얼·자산번호·모델·현재 사용자). `<DeviceMap>`(좌표 있으면 마커, 없으면 실내위치 안내). 최근 보고 목록(시간·실내위치/좌표·배터리), 대여 이력 타임라인. **[벨 울리기]**·**[지금 위치 요청]** 버튼 → `useRing`/`useLocate`, 성공 토스트("전송됨").
4. **③ 무응답 기기** — `useStaleDevices(days=7)` 목록(분실 의심). 각 항목 상세로 이동.
5. **④ AP 매핑 관리** — CSV 텍스트 붙여넣기/파일 업로드 → `useApMapUpload` → `{upserted}` 표시. 템플릿 헤더 안내(`bssid,building,floor,zone,note`).

## 6. 인증 & 에러 처리

- `AuthContext`: `token`(localStorage 지속), `login(token)`, `logout()`. `RequireAuth`가 토큰 없으면 `/login`으로.
- `api/client.ts`: `apiFetch(path, opts)` — baseUrl 접두, 토큰 있으면 Bearer 부착, 응답 !ok면 `ApiError(status, body)` throw. 401이면 등록된 onUnauthorized 콜백 호출(→ logout + redirect).
- React Query: 쿼리 에러는 화면에 에러 상태, 뮤테이션(ring/locate/upload)은 성공/실패 토스트.

## 7. 설정 & 서버 연동

- `VITE_API_BASE_URL`(기본값 `/api`). Vite dev 서버는 `/api`를 `http://localhost:3000`으로 프록시(P1 서버). 프로덕션은 동일 오리진 또는 설정값.
- `.env.example`: `VITE_API_BASE_URL=/api`.
- 개발 검증: P1 서버(`docker compose up -d db && pnpm db:migrate && pnpm seed:admin` + `pnpm dev`) 기동 후 대시보드가 소비.

## 8. 테스트 전략 (DoD)

- **MSW 핸들러**로 P1 admin 엔드포인트 목킹. 핵심 케이스:
  - 로그인 성공→토큰 저장/이동, 실패 401→에러.
  - 검색: q 전달·결과 카드 렌더(실내위치 표시, 좌표 폴백, 대여자 없음).
  - 상세: 최근 보고·이력 렌더; 벨울리기 버튼→ring POST 호출·성공 토스트.
  - 무응답: stale 목록 렌더.
  - AP매핑: CSV 업로드→upserted 표시.
  - 401 인터셉트→로그아웃.
- **DoD**: `npm run test`(vitest run) 그린 + `npm run typecheck`(tsc --noEmit) + `npm run build`(vite build) 성공.
- (선택) Chrome 자동화로 실제 P1 서버 대상 로그인→검색→상세→벨울리기 스모크.

## 9. 완료 기준 (Definition of Done)

1. `dashboard/` Vite+React+TS+Tailwind 프로젝트가 `vite build`로 빌드된다.
2. `vitest run` 전 테스트 그린, `tsc --noEmit` 에러 0.
3. 화면 ①~④ + 로그인 구현, MSW 목으로 시나리오 검증.
4. `<DeviceMap>` 추상화, 좌표 없음 우아하게 처리.
5. `.env.example` + README(로컬 기동·서버 연동 절차).
6. 시크릿 없음(토큰은 런타임 localStorage). `.gitignore`에 node_modules/dist/.env.

## 10. 자동화 수준

**완전 자동.** 외부 하드웨어·키 의존 0. Claude Code가 `test-driven-development`로 구현하고 `verification-before-completion`으로 vitest/tsc/build 그린을 스스로 증명. 실서버 대상 브라우저 스모크는 선택(Chrome 자동화 가능).
