# P1 — 백엔드 서버 + DB 설계 (spec)

> **Phase**: P1 (마일스톤 첫 조각). Knox·실기기·외부 키 없이 100% 자동 개발·검증.
> **완료 기준**: `docker compose up` 후 통합 테스트 전부 통과.
> **선행 문서**: 「구현 정의서」 §3·§4.2·§7, 「개발 실행 설계서」 (2026-07-10).
> **작성일**: 2026-07-10

---

## 1. 목표 & 범위

패드 추적 시스템의 **API·스키마 계약을 고정**하는 백엔드. 이후 P2(앱)·P3(대시보드)가 이 계약을 소비한다.

**이번 Phase 범위(In)**
- 모노레포 스캐폴드(`server/` 중심), docker-compose(PostgreSQL).
- Drizzle 스키마 + 마이그레이션(정의서 §3).
- 정의서 §4.2 전체 REST API.
- 실내위치 해석(bssid→ap_map), stale 감지, retention(90일) 배치.
- Testcontainers 기반 유닛/통합 테스트.

**범위 밖(Out — 후속 Phase)**
- 실제 FCM 발송 → **P1은 인터페이스 + 스텁**만. 실발송은 P2(Firebase 키 투입 후).
- 사내 SSO → 관리자 인증은 ID/PW + JWT.
- WLC 연동 → 인터페이스 미도입(2차).
- 이메일/웹 알림 발송 → stale은 조회 API·배치까지만.

## 2. 결정 사항 (brainstorming 확정)

| 항목 | 결정 | 비고 |
|---|---|---|
| repo 구조 | `FindMyPad/` 독립 git repo | 상위 F:/MyWorkSpace와 분리 (R7 해소) |
| 서버 프레임워크 | **Fastify** | 경량·저보일러플레이트 |
| 언어/런타임 | TypeScript + Node.js 20 | |
| DB 접근·마이그레이션 | **Drizzle ORM + drizzle-kit** | PG 부분 유니크 인덱스·INET·TIMESTAMPTZ 지원 |
| 통합 테스트 DB | **Testcontainers** (일회성 PG) | Docker 필요, CI 동일 |
| 스키마 검증 | zod (요청/응답) | Fastify type provider |
| 배치 스케줄 | node-cron (경량) | stale 일 1회, retention 일 1회 |
| 패키지 매니저 | pnpm | (팀 표준 있으면 교체) |

## 3. 프로젝트 구조

```
FindMyPad/
├── server/
│   ├── src/
│   │   ├── app.ts              # Fastify 인스턴스 빌더 (테스트 재사용, app.inject())
│   │   ├── server.ts           # 부팅 엔트리포인트
│   │   ├── config.ts           # env 로딩·검증 (zod)
│   │   ├── db/
│   │   │   ├── schema.ts        # Drizzle 스키마 (§4)
│   │   │   ├── client.ts        # 커넥션 풀
│   │   │   └── migrations/      # drizzle-kit 생성
│   │   ├── plugins/
│   │   │   ├── error-handler.ts # 도메인 에러→HTTP 매핑, {code,message} 포맷
│   │   │   ├── auth-device.ts   # 디바이스 Bearer 토큰
│   │   │   └── auth-admin.ts    # 관리자 JWT
│   │   ├── routes/
│   │   │   ├── devices.ts       # POST /api/devices/enroll
│   │   │   ├── reports.ts       # POST /api/reports
│   │   │   ├── checkouts.ts     # POST /api/checkouts, POST /api/checkouts/:id/return
│   │   │   └── admin/
│   │   │       ├── devices.ts   # GET 검색·상세, POST ring·locate
│   │   │       ├── ap-map.ts    # PUT ap-map (CSV 업서트)
│   │   │       └── alerts.ts    # GET stale
│   │   ├── services/
│   │   │   ├── fcm.ts           # FcmSender 인터페이스 + StubFcmSender (P1)
│   │   │   ├── location.ts      # bssid→ap_map 해석
│   │   │   └── auth.ts          # 토큰 발급/검증, 비밀번호 해시
│   │   └── jobs/
│   │       ├── stale-scan.ts
│   │       └── retention.ts
│   └── test/                    # Testcontainers 통합 테스트
├── docker-compose.yml           # postgres + (선택) server
├── .env.example
├── docs/
└── addon_knox_..._samsung/      # 기존 유지
```

## 4. 데이터 모델

정의서 §3 스키마를 Drizzle로 그대로 옮긴다(테이블: `devices`, `users`, `checkouts`, `reports`, `ap_map`). PG 고유 요소를 유지한다:
- `checkouts`: 부분 유니크 인덱스 `one_active_checkout_per_device ON checkouts(device_id) WHERE returned_at IS NULL` — 이중 대여 차단의 핵심.
- `reports`: `public_ip INET`, 인덱스 `reports_device_time (device_id, reported_at DESC)`.
- `devices`: `serial` UNIQUE, `last_seen_at`(무응답 기준), `fcm_token`, `knox_licensed`.

**추가(P1 필요)**: 디바이스 토큰·관리자 계정 저장.
- `devices.device_token_hash TEXT` — enroll 시 발급한 토큰의 해시(원문은 응답으로 1회 반환).
- `admin_users(id, username UNIQUE, password_hash, role)` — 관리자/직원 권한 분리. seed 스크립트로 초기 관리자 1명.

## 5. API 계약 (정의서 §4.2)

| Method | Path | 인증 | 핵심 규칙 |
|---|---|---|---|
| POST | `/api/devices/enroll` | 없음(등록) | {serial,model,wifiMac,fcmToken} → serial 업서트, 디바이스 토큰 발급·반환 |
| POST | `/api/reports` | device | public_ip=소스 IP 서버 기록, bssid→ap_map 조인 응답, last_seen_at 갱신 |
| POST | `/api/checkouts` | device | {empNo,consentAt} — 활성 대여 존재 시 **409** |
| POST | `/api/checkouts/:id/return` | device | returned_at 세팅(반납) |
| GET | `/api/admin/devices?q=` | admin | 이름/사번/자산번호/시리얼 통합 검색, 현재 사용자·마지막 위치 포함 |
| GET | `/api/admin/devices/:id` | admin | 최근 보고 N건, 대여 이력, ap_map 실내위치 |
| POST | `/api/admin/devices/:id/ring` | admin | FcmSender.send(RING) — P1은 스텁(큐잉됨 200) |
| POST | `/api/admin/devices/:id/locate` | admin | FcmSender.send(LOCATE_NOW) — 스텁 |
| PUT | `/api/admin/ap-map` | admin | CSV 업서트(bssid PK) |
| GET | `/api/admin/alerts/stale?days=7` | admin | last_seen_at N일 초과 목록 |

응답/요청은 zod 스키마로 검증, 400 표준화. 관리자 인증(직원용 조회는 본인 기기 한정)은 role로 분기.

## 6. 핵심 로직 & 에러 처리

- **이중 체크아웃(409)**: INSERT 시 부분 유니크 인덱스 위반 → error-handler가 `ConflictError`→409로 매핑. 레이스 컨디션도 DB가 보장.
- **실내위치 해석**(`services/location.ts`): report의 bssid를 ap_map과 조인해 building/floor/zone 부여. 매칭 없으면 null + 네트워크 좌표(lat/lng)로 폴백.
- **public_ip**: 클라이언트가 아니라 서버가 요청 소스 IP(`X-Forwarded-For` 신뢰 설정 포함)로 기록.
- **stale**: `last_seen_at < now()-days` 목록 조회 API + node-cron 일 1회 로깅 배치.
- **retention**: `reports.reported_at < now()-RETENTION_DAYS(기본 90)` 삭제 배치. 기간은 env 설정값(정의서 §8).
- **에러 포맷**: 전 응답 `{ error: { code, message } }` 일관. Fastify 전역 error handler.

## 7. 설정 (env)

`.env.example` 제공. `DATABASE_URL`, `JWT_SECRET`, `RETENTION_DAYS=90`, `STALE_DAYS=7`, `CORP_SSIDS`, `TRUST_PROXY`. 시크릿은 `.gitignore` 처리(R8), `FIREBASE_SERVICE_ACCOUNT`는 P2에서 추가.

## 8. 테스트 전략 (정의서 §7)

- Testcontainers로 일회성 PG → 마이그레이션 적용 → 테스트별 격리(트랜잭션 롤백 또는 truncate).
- `app.ts`를 주입식으로 만들어 `app.inject()`로 라우트까지 검증(실서버 포트 불필요).
- **필수 케이스**: ① 이중 체크아웃 409 ② ap_map 조인 정확성 ③ stale 경계(정확히 N일) ④ 디바이스 토큰 인증 실패 401 ⑤ enroll 업서트(재등록 시 갱신) ⑥ report의 public_ip 서버 기록 ⑦ retention 삭제.
- FcmSender는 스텁을 주입해 ring/locate가 스텁 호출을 기록하는지 검증.

## 9. 완료 기준 (Definition of Done)

1. `docker compose up` 으로 PG + 마이그레이션 적용.
2. `pnpm test` — Testcontainers 통합 테스트 전부 그린.
3. §5 모든 엔드포인트 구현 + zod 검증.
4. `.gitignore`에 §6 시크릿 전부 포함, 하드코딩 시크릿 없음.
5. `.env.example` + README(로컬 기동 절차) 존재.

## 10. 자동화 수준

**완전 자동.** 외부 하드웨어·키 의존 0. Claude Code가 `superpowers:test-driven-development`로 구현하고 `superpowers:verification-before-completion`으로 스스로 완료 증명.
