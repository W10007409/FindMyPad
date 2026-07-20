# 직원 포털 · 확장 텔레메트리 · IP/실내 위치 · UI 세련화 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사번 로그인·RBAC(이미 구현됨)을 현재 브랜치로 통합하고, 그 위에 확장 텔레메트리(B)·IP/실내 위치(C)·관리자 가이드(D)·대시보드 UI 세련화(E)를 완성한다.

**Architecture:** 세 형제 브랜치(server=`feat/server-fcm-logger`, dashboard=`feat/p3-dashboard`, android=현재 `feat/p4-knox`)를 `feat/p4-knox`로 병합해 단일 트리를 만든다(Phase 0). 이후 안드로이드 `SnapshotCollector`가 최대 텔레메트리를 수집→`reports` 테이블 확장 컬럼으로 전송→대시보드 상세에 표시(B). 서버는 공인 IP를 사내/외부망으로 판정하고 주변 AP 스캔의 최강 신호 BSSID로 실내 위치를 보강(C). 대시보드에 관리자 도움말 패널(D)과 디자인 토큰 기반 라이트/다크 UI(E)를 얹는다.

**Tech Stack:** 서버 Fastify + Drizzle(PostgreSQL) + zod + vitest(Testcontainers). 대시보드 React + Vite + TS + Tailwind v3 + react-query + vitest(jsdom+MSW). 앱 Kotlin + WorkManager + Retrofit + kotlinx.serialization + JUnit4(+MockWebServer).

## Global Constraints

- **브랜치**: 모든 작업은 `feat/p4-knox`에서 수행. Phase 0에서 다른 두 브랜치를 이 브랜치로 병합한다(사용자 결정: "현재 브랜치에서 통합"). 병합 후에는 세 코드베이스가 한 트리에 공존한다.
- **하위호환**: `reports` 신규 컬럼은 모두 nullable. `ReportRequest`(앱 DTO)·`Body`(서버 zod) 신규 필드는 모두 optional/nullable-with-default. 구버전 앱 보고가 계속 200으로 수용돼야 한다.
- **추가 런타임 권한 최소화**: 주변 Wi-Fi 스캔에만 `CHANGE_WIFI_STATE`(+ API33+ 고려사항) 추가. 배터리/저장/OS/가동시간은 권한 불필요. 위치 권한은 이미 부여됨.
- **비밀번호 해시**: scrypt(`server/src/services/auth.ts`의 `hashPassword`/`verifyPassword`). 신규 해시 로직 금지 — 기존 함수 재사용.
- **PII/시크릿**: `개인별 패드 지급 현황.xlsx`, `google-services.json`, 서비스계정, `*.mmdb`는 `.gitignore` 유지. employee는 본인 소유 데이터만.
- **테스트 우선(TDD)**: 각 태스크는 실패하는 테스트 → 최소 구현 → 통과 → 커밋. 서버=vitest, 대시보드=vitest+MSW, 앱=JUnit4.
- **DRY/YAGNI**: 기존 함수(`resolveIndoorLocation`, `assertCanAccessDevice`, `apiFetch`, `SnapshotCollector`)를 확장하되 재작성하지 않는다.
- **다크모드 카피/색**: 의미색(정상=녹/경고=황/위험=적)은 브랜드 악센트와 분리. 카피는 사용자 언어(‘무응답 기기’ 등).

---

## 기존 구현 현황 (사전 조사 결과 — 재구현 금지)

**서브프로젝트 A는 이미 구현되어 있다.** 계획에 포함하지 않으며 Phase 0에서 병합으로 편입한다.

| A 항목 | 위치 | 상태 |
|---|---|---|
| 사번 로그인(`POST /api/admin/login` empNo) | `feat/server-fcm-logger` `server/src/routes/admin/*` | ✅ |
| users 인증 컬럼(`password_hash`,`must_change_password`,`role`,`is_active`) | `server/src/db/schema.ts` | ✅ |
| 강제 비번변경(`POST /api/auth/change-password`) | server | ✅ |
| employee RBAC 스코핑(`ownedSerials`/`assertCanAccessDevice`) | `server/src/routes/admin/devices.ts` | ✅ |
| 자산 대장(`assets` 테이블 + import + `PUT /admin/assets`) | server | ✅ |
| 대시보드 로그인/강제변경/역할 네비/내 패드 | `feat/p3-dashboard` `dashboard/src/*` | ✅ |

**B/C/D/E는 미구현** — 이 계획의 대상.

---

## File Structure (신규/수정 대상)

### 서버 (`server/`)
- Modify: `server/src/db/schema.ts` — `reports`에 확장 텔레메트리 컬럼(B).
- Create: `server/src/db/migrations/00NN_*.sql` — `drizzle-kit generate` 산출(B).
- Modify: `server/src/routes/reports.ts` — `Body` zod에 신규 필드 + insert(B).
- Modify: `server/src/config.ts` — `CORP_PUBLIC_IPS`, `MAXMIND_MMDB_PATH`(C).
- Create: `server/src/services/network-location.ts` — `resolveNetworkLocation`(C).
- Modify: `server/src/services/location.ts` — `resolveIndoorLocationFromReport`(주변 스캔 최강 BSSID)(C).
- Modify: `server/src/routes/admin/devices.ts` — 상세 응답에 `network` + 확장 report 필드 + 주변 AP 반영(C).
- Test: `server/test/reports.test.ts`, `server/test/network-location.test.ts`, `server/test/location.test.ts`, `server/test/admin-devices.test.ts`.

### 대시보드 (`dashboard/`)
- Modify: `dashboard/src/api/types.ts` — `Report`/`DeviceDetail`에 텔레메트리·`network`·`nearbyAps` 타입(B,C).
- Modify: `dashboard/src/pages/DeviceDetail.tsx` — 텔레메트리 표 + 주변 AP 접이식 + 위치 섹션(B,C).
- Create: `dashboard/src/components/TelemetryTable.tsx`, `NearbyAps.tsx`, `LocationSection.tsx`, `HelpPanel.tsx`(B,C,D).
- Modify: `dashboard/src/pages/StaleDevices.tsx`, `dashboard/src/pages/ApMapManage.tsx` — 도움말 패널 + 샘플 CSV(D).
- Modify: `dashboard/tailwind.config.ts`, `dashboard/src/index.css` — 디자인 토큰, `darkMode:'class'`(E).
- Create: `dashboard/src/theme/ThemeToggle.tsx` + `dashboard/src/theme/useTheme.ts`(E).
- Modify: `dashboard/src/components/Layout.tsx`, `DeviceCard.tsx`, `Battery.tsx`, `auth/LoginPage.tsx` 등 — 토큰 적용(E).

### 앱 (`android-agent/`)
- Modify: `app/src/main/java/com/wjtb/padtracker/domain/ReportSnapshot.kt` — 신규 필드(B).
- Modify: `app/src/main/java/com/wjtb/padtracker/work/SnapshotCollector.kt` — 수집 확장(B).
- Modify: `app/src/main/java/com/wjtb/padtracker/data/api/dto.kt` — `ReportRequest` 확장(B).
- Modify: `app/src/main/java/com/wjtb/padtracker/domain/ReportBuilder.kt` — 매핑 확장(B).
- Modify: `app/src/main/AndroidManifest.xml` — `CHANGE_WIFI_STATE`(+ API33+ `NEARBY_WIFI_DEVICES`)(B).
- Test: `app/src/test/java/com/wjtb/padtracker/domain/ReportBuilderTest.kt`, `data/api/PadApiTest.kt`.

---

## Phase 0 — 브랜치 통합 (병합)

세 형제 브랜치는 공통 조상 `50c693a`에서 갈라졌고, 서로 다른 디렉터리(server/dashboard/android)를 주로 수정해 **dry-run 병합에서 충돌 없음**을 확인했다(겹치는 P3 docs 2건은 공유 커밋이라 충돌 아님). 순서대로 병합한다.

### Task 0.1: server-fcm-logger 병합 (서버 A + 자산대장 + 실FCM)

**Files:** (병합 — 개별 파일 편집 아님)
- Merge into: `feat/p4-knox` ← `feat/server-fcm-logger`

**Interfaces:**
- Produces: `reports`/`users`/`assets`/`ap_map` 스키마, `POST /api/admin/login`(empNo), `resolveIndoorLocation`, `requireAdmin`, `services/auth.ts`(`hashPassword`/`verifyPassword`), `services/location.ts`. 이후 B/C 서버 태스크가 이 위에서 동작.

- [ ] **Step 1: 사전 검증 — 워킹트리 클린 + 병합 dry-run**

```bash
cd /f/MyWorkSpace/FindMyPad
git status --porcelain    # scratch png / xlsx 외 추적 변경 없어야 함
git merge-tree --write-tree --name-only feat/p4-knox feat/server-fcm-logger | grep -i conflict || echo "NO CONFLICTS"
```
Expected: `NO CONFLICTS`

- [ ] **Step 2: 병합 실행**

```bash
git checkout feat/p4-knox
git merge --no-ff feat/server-fcm-logger -m "merge(integrate): server 사번 login + RBAC + assets inventory + real FCM into p4-knox"
```
Expected: 충돌 없이 커밋 생성.

- [ ] **Step 3: 서버 테스트 그린 확인 (증거 우선)**

```bash
pnpm install
pnpm test    # vitest (Testcontainers: Docker 필요)
```
Expected: 모든 서버 테스트 PASS. 실패 시 systematic-debugging.

- [ ] **Step 4: 커밋** (병합 커밋이 Step 2에서 이미 생성됨 — 추가 커밋 불필요)

### Task 0.2: p3-dashboard 병합 (대시보드 A + P3 전체)

**Files:** (병합)
- Merge into: `feat/p4-knox` ← `feat/p3-dashboard`

**Interfaces:**
- Produces: `dashboard/src/*` 전체 — `apiFetch`(`api/client.ts`), `api/types.ts`, `api/hooks.ts`, `pages/DeviceDetail.tsx`, `pages/StaleDevices.tsx`, `pages/ApMapManage.tsx`, `components/Layout.tsx`, `auth/*`, `tailwind.config.ts`. 이후 B/C/D/E 대시보드 태스크가 이 위에서 동작.

- [ ] **Step 1: 병합 dry-run**

```bash
git merge-tree --write-tree --name-only feat/p4-knox feat/p3-dashboard | grep -i conflict || echo "NO CONFLICTS"
```
Expected: `NO CONFLICTS` (공유된 P3 docs 2건은 동일 커밋이라 자동 처리).

- [ ] **Step 2: 병합 실행**

```bash
git merge --no-ff feat/p3-dashboard -m "merge(integrate): P3 dashboard + 사번 login/RBAC UI + 내 패드 into p4-knox"
```

- [ ] **Step 3: 대시보드 테스트 그린 확인**

```bash
cd /f/MyWorkSpace/FindMyPad/dashboard
npm install
npm run typecheck
npm run test    # vitest + MSW
```
Expected: typecheck 0 error, 모든 테스트 PASS.

- [ ] **Step 4: 안드로이드 빌드 회귀 확인** (병합이 android-agent를 건드리지 않았음을 검증)

```bash
cd /f/MyWorkSpace/FindMyPad/android-agent
./gradlew :app:testDevDebugUnitTest
```
Expected: BUILD SUCCESSFUL. (Windows: `./gradlew.bat` 또는 `gradlew` 사용)

- [ ] **Step 5: 통합 완료 커밋** (병합 커밋은 Step 2에서 생성됨. 통합 검증 로그를 별도 남기려면 docs만 커밋)

**체크포인트(리뷰 게이트):** Phase 0 종료 후 3개 코드베이스가 한 트리에서 각각 테스트 그린인지 확인하고 다음 Phase로.

---

## Phase B — 확장 텔레메트리 (앱 → 서버 → 대시보드)

수집 항목: 배터리(상태/플러그/온도℃/건강/전압mV), Wi-Fi(RSSI/링크Mbps/주파수MHz/내부IP), 주변 Wi-Fi 스캔 목록, 저장공간 free/total MB, OS 버전, 가동시간 sec. 모두 하위호환(nullable).

### Task B.1: 서버 `reports` 확장 컬럼 + 마이그레이션

**Files:**
- Modify: `server/src/db/schema.ts` (reports 정의에 컬럼 추가)
- Create: `server/src/db/migrations/00NN_*.sql` (drizzle-kit generate)
- Test: `server/test/reports.test.ts`

**Interfaces:**
- Consumes: 기존 `reports` 테이블(Task 0.1).
- Produces: `reports`에 컬럼 — `batteryStatus text`, `batteryPlug text`, `batteryTempC real`, `batteryHealth text`, `batteryVoltageMv int`, `wifiRssi smallint`, `wifiLinkMbps smallint`, `wifiFreqMhz int`, `localIp text`, `storageFreeMb int`, `storageTotalMb int`, `osVersion text`, `uptimeSec bigint`, `nearbyAps jsonb`.

- [ ] **Step 1: 실패 테스트 작성** — `server/test/reports.test.ts`에 확장 필드 왕복 케이스 추가.

```ts
it('persists extended telemetry fields', async () => {
  const token = await enrollDevice(ctx); // 기존 헬퍼 패턴(reports.test.ts 참조)
  const res = await ctx.app.inject({
    method: 'POST', url: '/api/reports',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      batteryPct: 55, batteryStatus: 'charging', batteryPlug: 'ac', batteryTempC: 31.5,
      batteryHealth: 'good', batteryVoltageMv: 4123, wifiRssi: -47, wifiLinkMbps: 433,
      wifiFreqMhz: 5180, localIp: '10.0.0.12', storageFreeMb: 20480, storageTotalMb: 65536,
      osVersion: 'Android 13 (SDK 33)', uptimeSec: 86400,
      nearbyAps: [{ bssid: 'aa:bb:cc:dd:ee:01', rssi: -50, ssid: 'CORP', frequency: 5180 }],
    },
  });
  expect(res.statusCode).toBe(200);
  const [row] = await ctx.db.select().from(reports).orderBy(desc(reports.id)).limit(1);
  expect(row.batteryStatus).toBe('charging');
  expect(row.storageFreeMb).toBe(20480);
  expect((row.nearbyAps as any[])[0].bssid).toBe('aa:bb:cc:dd:ee:01');
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
pnpm vitest run server/test/reports.test.ts
```
Expected: FAIL — zod가 unknown key를 무시하거나 컬럼 없음(insert 오류/undefined).

- [ ] **Step 3: 스키마에 컬럼 추가** — `server/src/db/schema.ts` `reports` 정의(`byDeviceTime` 인덱스 앞)에 삽입. import에 `integer`, `jsonb` 추가.

```ts
// import 줄에 integer, jsonb 추가:
// import { pgTable, bigserial, text, timestamp, boolean, doublePrecision, real, smallint, bigint, inet, integer, jsonb, uniqueIndex, index } from 'drizzle-orm/pg-core';

  batteryStatus: text('battery_status'),
  batteryPlug: text('battery_plug'),
  batteryTempC: real('battery_temp_c'),
  batteryHealth: text('battery_health'),
  batteryVoltageMv: integer('battery_voltage_mv'),
  wifiRssi: smallint('wifi_rssi'),
  wifiLinkMbps: smallint('wifi_link_mbps'),
  wifiFreqMhz: integer('wifi_freq_mhz'),
  localIp: text('local_ip'),
  storageFreeMb: integer('storage_free_mb'),
  storageTotalMb: integer('storage_total_mb'),
  osVersion: text('os_version'),
  uptimeSec: bigint('uptime_sec', { mode: 'number' }),
  nearbyAps: jsonb('nearby_aps'),
```

- [ ] **Step 4: 마이그레이션 생성 + 적용 확인**

```bash
pnpm db:generate    # server/src/db/migrations/00NN_*.sql 생성
```
Expected: 신규 마이그레이션 파일 생성(테스트는 `runMigrations`로 자동 적용).

- [ ] **Step 5: reports 라우트 zod 확장** — `server/src/routes/reports.ts` `Body`에 필드 추가 + insert에 매핑.

```ts
const NearbyAp = z.object({ bssid: z.string(), rssi: z.number().int(), ssid: z.string().optional(), frequency: z.number().int().optional() });
const Body = z.object({
  lat: z.number().optional(), lng: z.number().optional(), accuracyM: z.number().optional(),
  bssid: z.string().optional(), ssid: z.string().optional(), batteryPct: z.number().int().min(0).max(100).optional(),
  batteryStatus: z.string().optional(), batteryPlug: z.string().optional(), batteryTempC: z.number().optional(),
  batteryHealth: z.string().optional(), batteryVoltageMv: z.number().int().optional(),
  wifiRssi: z.number().int().optional(), wifiLinkMbps: z.number().int().optional(), wifiFreqMhz: z.number().int().optional(),
  localIp: z.string().optional(), storageFreeMb: z.number().int().optional(), storageTotalMb: z.number().int().optional(),
  osVersion: z.string().optional(), uptimeSec: z.number().int().optional(),
  nearbyAps: z.array(NearbyAp).optional(),
});
```
insert의 `.values({ ... })`에 위 필드를 그대로 나열(`batteryStatus: b.batteryStatus, ... nearbyAps: b.nearbyAps`).

- [ ] **Step 6: 테스트 통과 확인**

```bash
pnpm vitest run server/test/reports.test.ts
```
Expected: PASS

- [ ] **Step 7: 커밋**

```bash
git add server/src/db/schema.ts server/src/db/migrations server/src/routes/reports.ts server/test/reports.test.ts
git commit -m "feat(server): expand reports with battery/wifi/storage/os/nearby-aps telemetry"
```

### Task B.2: 앱 `ReportSnapshot`/`ReportRequest`/`ReportBuilder` 확장 (순수 로직)

**Files:**
- Modify: `app/src/main/java/com/wjtb/padtracker/domain/ReportSnapshot.kt`
- Modify: `app/src/main/java/com/wjtb/padtracker/data/api/dto.kt`
- Modify: `app/src/main/java/com/wjtb/padtracker/domain/ReportBuilder.kt`
- Test: `app/src/test/java/com/wjtb/padtracker/domain/ReportBuilderTest.kt`, `app/src/test/java/com/wjtb/padtracker/data/api/PadApiTest.kt`

**Interfaces:**
- Consumes: 서버 `ReportRequest` 계약(Task B.1의 필드명 그대로, camelCase).
- Produces: 확장된 `ReportSnapshot`(named defaults), `ReportRequest`(nullable defaults), `ReportBuilder.build` 매핑.

- [ ] **Step 1: 실패 테스트 작성** — `ReportBuilderTest.kt`에 확장 매핑 케이스.

```kotlin
@Test fun maps_all_extended_fields() {
  val snap = ReportSnapshot(
    lat = null, lng = null, accuracyM = null, bssid = "b", ssid = "s", batteryPct = 55,
    batteryStatus = "charging", batteryPlug = "ac", batteryTempC = 31.5f, batteryHealth = "good", batteryVoltageMv = 4123,
    wifiRssi = -47, wifiLinkMbps = 433, wifiFreqMhz = 5180, localIp = "10.0.0.12",
    storageFreeMb = 20480, storageTotalMb = 65536, osVersion = "Android 13 (SDK 33)", uptimeSec = 86400L,
    nearbyAps = listOf(NearbyAp("aa:bb:cc:dd:ee:01", -50, "CORP", 5180)),
  )
  val req = ReportBuilder().build(snap)
  assertEquals("charging", req.batteryStatus)
  assertEquals(20480, req.storageFreeMb)
  assertEquals("aa:bb:cc:dd:ee:01", req.nearbyAps?.first()?.bssid)
}
```

- [ ] **Step 2: 실패 확인**

```bash
cd android-agent && ./gradlew :app:testDevDebugUnitTest --tests "*ReportBuilderTest*"
```
Expected: 컴파일 실패(필드/`NearbyAp` 없음).

- [ ] **Step 3: `ReportSnapshot.kt` 확장** (named + 기본값으로 기존 positional 호출부 보호).

```kotlin
data class NearbyAp(val bssid: String, val rssi: Int, val ssid: String? = null, val frequency: Int? = null)

data class ReportSnapshot(
  val lat: Double? = null, val lng: Double? = null, val accuracyM: Float? = null,
  val bssid: String? = null, val ssid: String? = null, val batteryPct: Int? = null,
  val batteryStatus: String? = null, val batteryPlug: String? = null, val batteryTempC: Float? = null,
  val batteryHealth: String? = null, val batteryVoltageMv: Int? = null,
  val wifiRssi: Int? = null, val wifiLinkMbps: Int? = null, val wifiFreqMhz: Int? = null, val localIp: String? = null,
  val storageFreeMb: Int? = null, val storageTotalMb: Int? = null, val osVersion: String? = null, val uptimeSec: Long? = null,
  val nearbyAps: List<NearbyAp>? = null,
)
```

- [ ] **Step 4: `dto.kt` `ReportRequest` 확장** + `NearbyApDto` 직렬화 타입.

```kotlin
@Serializable
data class NearbyApDto(val bssid: String, val rssi: Int, val ssid: String? = null, val frequency: Int? = null)

@Serializable
data class ReportRequest(
  val lat: Double? = null, val lng: Double? = null, val accuracyM: Float? = null,
  val bssid: String? = null, val ssid: String? = null, val batteryPct: Int? = null,
  val batteryStatus: String? = null, val batteryPlug: String? = null, val batteryTempC: Float? = null,
  val batteryHealth: String? = null, val batteryVoltageMv: Int? = null,
  val wifiRssi: Int? = null, val wifiLinkMbps: Int? = null, val wifiFreqMhz: Int? = null, val localIp: String? = null,
  val storageFreeMb: Int? = null, val storageTotalMb: Int? = null, val osVersion: String? = null, val uptimeSec: Long? = null,
  val nearbyAps: List<NearbyApDto>? = null,
)
```

- [ ] **Step 5: `ReportBuilder.kt` 매핑 확장**

```kotlin
class ReportBuilder {
  fun build(s: ReportSnapshot): ReportRequest = ReportRequest(
    lat = s.lat, lng = s.lng, accuracyM = s.accuracyM, bssid = s.bssid, ssid = s.ssid, batteryPct = s.batteryPct,
    batteryStatus = s.batteryStatus, batteryPlug = s.batteryPlug, batteryTempC = s.batteryTempC,
    batteryHealth = s.batteryHealth, batteryVoltageMv = s.batteryVoltageMv,
    wifiRssi = s.wifiRssi, wifiLinkMbps = s.wifiLinkMbps, wifiFreqMhz = s.wifiFreqMhz, localIp = s.localIp,
    storageFreeMb = s.storageFreeMb, storageTotalMb = s.storageTotalMb, osVersion = s.osVersion, uptimeSec = s.uptimeSec,
    nearbyAps = s.nearbyAps?.map { NearbyApDto(it.bssid, it.rssi, it.ssid, it.frequency) },
  )
}
```

- [ ] **Step 6: `PadApiTest.kt`에 직렬화 검증 추가** — `ReportRequest(batteryStatus="charging", storageFreeMb=20480)`가 POST 본문 JSON에 포함되는지 MockWebServer로 확인.

- [ ] **Step 7: 테스트 통과**

```bash
./gradlew :app:testDevDebugUnitTest --tests "*ReportBuilderTest*" --tests "*PadApiTest*"
```
Expected: PASS

- [ ] **Step 8: 커밋**

```bash
git add android-agent/app/src/main/java/com/wjtb/padtracker/domain android-agent/app/src/main/java/com/wjtb/padtracker/data/api/dto.kt android-agent/app/src/test
git commit -m "feat(padtracker): extend ReportSnapshot/ReportRequest/Builder with full telemetry"
```

### Task B.3: 앱 `SnapshotCollector` 수집 확장 + 매니페스트 권한

**Files:**
- Modify: `app/src/main/java/com/wjtb/padtracker/work/SnapshotCollector.kt`
- Modify: `app/src/main/AndroidManifest.xml`

**Interfaces:**
- Consumes: `ReportSnapshot`(Task B.2).
- Produces: `collect()`가 배터리(ACTION_BATTERY_CHANGED sticky)·Wi-Fi(connectionInfo)·주변 스캔(scanResults 캐시)·StatFs·Build·SystemClock를 채운 스냅샷 반환. 수집 실패 항목은 각 `runCatching{}.getOrNull()`로 null.

- [ ] **Step 1: 매니페스트에 권한 추가** — `app/src/main/AndroidManifest.xml`.

```xml
<uses-permission android:name="android.permission.CHANGE_WIFI_STATE" />
<!-- API 33+ 주변 Wi-Fi 스캔(위치 미도출) -->
<uses-permission android:name="android.permission.NEARBY_WIFI_DEVICES"
    android:usesPermissionFlags="neverForLocation" tools:targetApi="33" />
```
(루트 `<manifest>`에 `xmlns:tools` 없으면 추가.)

- [ ] **Step 2: `SnapshotCollector.collect()` 확장** — 각 블록 `runCatching`. 배터리는 sticky intent, 스캔은 캐시된 `scanResults` 사용(배터리 절약; 강제 `startScan()`은 매 주기 하지 않음).

```kotlin
// 배터리 상세: ACTION_BATTERY_CHANGED sticky intent
val batt = runCatching {
  val i = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
  val status = when (i?.getIntExtra(BatteryManager.EXTRA_STATUS, -1)) {
    BatteryManager.BATTERY_STATUS_CHARGING -> "charging"; BatteryManager.BATTERY_STATUS_DISCHARGING -> "discharging"
    BatteryManager.BATTERY_STATUS_FULL -> "full"; BatteryManager.BATTERY_STATUS_NOT_CHARGING -> "not_charging"; else -> null }
  val plug = when (i?.getIntExtra(BatteryManager.EXTRA_PLUGGED, -1)) {
    BatteryManager.BATTERY_PLUGGED_AC -> "ac"; BatteryManager.BATTERY_PLUGGED_USB -> "usb"; BatteryManager.BATTERY_PLUGGED_WIRELESS -> "wireless"; else -> null }
  // temp: 0.1℃ 단위, voltage: mV
  Triple(status, plug, i)
}.getOrNull()
// wifi: connectionInfo (RSSI/linkSpeed/frequency/ipAddress)
// storage: StatFs(Environment.getDataDirectory().path) → availableBytes/totalBytes / 1MB
// os: "Android ${Build.VERSION.RELEASE} (SDK ${Build.VERSION.SDK_INT})"
// uptime: SystemClock.elapsedRealtime()/1000
// nearbyAps: (wifi as WifiManager).scanResults.map { NearbyAp(it.BSSID, it.level, it.SSID, it.frequency) }
```
(전체 구현은 각 시스템 서비스 호출을 위 주석대로 채운다. 위치권한 필요 항목만 스캔; 실패는 null.)

- [ ] **Step 3: 컴파일 + dev 유닛테스트 그린** (수집 자체는 실기기 검증 대상 — `testOptions{ unitTests.isReturnDefaultValues=true }`라 유닛에서는 기본값 반환).

```bash
./gradlew :app:assembleDevDebug :app:testDevDebugUnitTest
```
Expected: BUILD SUCCESSFUL.

- [ ] **Step 4: 커밋**

```bash
git add android-agent/app/src/main/java/com/wjtb/padtracker/work/SnapshotCollector.kt android-agent/app/src/main/AndroidManifest.xml
git commit -m "feat(padtracker): collect battery/wifi/scan/storage/os telemetry (+ CHANGE_WIFI_STATE)"
```

> **실기기 게이트(B DoD):** 실 삼성기기에서 최대 항목이 채워져 전송되는지 `docs/knox-device-test.md`에 체크 항목 추가·확인(사람).

### Task B.4: 대시보드 DeviceDetail 텔레메트리 표 + 주변 AP

**Files:**
- Modify: `dashboard/src/api/types.ts` (`Report`에 필드, `NearbyAp` 타입)
- Create: `dashboard/src/components/TelemetryTable.tsx`, `dashboard/src/components/NearbyAps.tsx`
- Modify: `dashboard/src/pages/DeviceDetail.tsx`
- Test: `dashboard/src/pages/DeviceDetail.test.tsx`(있으면 확장) + MSW 핸들러

**Interfaces:**
- Consumes: 서버 상세 응답의 `recentReports[]`(확장 필드) + `nearbyAps`(Task C.3에서 상세 응답에 최신 스캔을 노출).
- Produces: 최근보고 표(배터리 상태/온도, Wi-Fi SSID/RSSI/링크, 내부IP, 저장공간, OS, 가동시간)와 접이식 주변 AP 목록.

- [ ] **Step 1: 타입 확장** — `dashboard/src/api/types.ts`.

```ts
export interface NearbyAp { bssid: string; rssi: number; ssid?: string | null; frequency?: number | null;
  indoor?: Indoor | null; }
export interface Report {
  id: number; reportedAt: string | null; lat: number | null; lng: number | null;
  bssid: string | null; ssid: string | null; batteryPct: number | null;
  batteryStatus: string | null; batteryPlug: string | null; batteryTempC: number | null;
  batteryHealth: string | null; batteryVoltageMv: number | null;
  wifiRssi: number | null; wifiLinkMbps: number | null; wifiFreqMhz: number | null; localIp: string | null;
  storageFreeMb: number | null; storageTotalMb: number | null; osVersion: string | null; uptimeSec: number | null;
  nearbyAps: NearbyAp[] | null;
}
```

- [ ] **Step 2: 실패 테스트** — DeviceDetail이 확장 필드를 렌더하는지(예: 배터리 상태·저장공간·주변 AP 개수) MSW 목 데이터로 검증하는 테스트 작성 후 실패 확인.

- [ ] **Step 3: `TelemetryTable.tsx` + `NearbyAps.tsx` 작성** — 최근 보고 1건의 확장 필드를 라벨/값 그리드로, 주변 AP는 `<details>` 접이식(bssid·rssi·매핑 위치 있으면 건물/층).

- [ ] **Step 4: DeviceDetail에 삽입** — 기존 ‘최근 보고’ 섹션 아래에 `<TelemetryTable report={recentReports[0]} />`, `<NearbyAps aps={recentReports[0]?.nearbyAps ?? []} />`.

- [ ] **Step 5: 테스트 통과 + typecheck**

```bash
cd dashboard && npm run typecheck && npm run test
```

- [ ] **Step 6: 커밋**

```bash
git add dashboard/src/api/types.ts dashboard/src/components/TelemetryTable.tsx dashboard/src/components/NearbyAps.tsx dashboard/src/pages/DeviceDetail.tsx dashboard/src/test
git commit -m "feat(dashboard): telemetry table + nearby-AP list on device detail"
```

---

## Phase C — IP 기반 위치 + 실내(AP) 위치 (서버 → 대시보드)

두 축: (1) 공인 IP를 `CORP_PUBLIC_IPS`와 매칭해 사내망/외부망 판정(+ 선택적 mmdb 도시), (2) 주변 스캔의 매핑 존재 BSSID 중 RSSI 최강을 실내 위치로.

### Task C.1: config에 `CORP_PUBLIC_IPS` / `MAXMIND_MMDB_PATH` + `resolveNetworkLocation`

**Files:**
- Modify: `server/src/config.ts`
- Create: `server/src/services/network-location.ts`
- Test: `server/test/network-location.test.ts`

**Interfaces:**
- Consumes: `Config`(env), 보고의 `publicIp`(=`req.ip`).
- Produces:
```ts
export type NetworkLocation = { publicIp: string | null; onCorpNetwork: boolean; city?: string | null; region?: string | null };
export function resolveNetworkLocation(ip: string | null, opts: { corpCidrs: string[]; mmdbPath?: string }): NetworkLocation;
```
CIDR/단일 IP 매칭(IPv4). mmdb 없으면 city/region 생략. 외부 API 미사용(사내망).

- [ ] **Step 1: config zod 확장** — `CORP_PUBLIC_IPS: z.string().default('')`(콤마 CIDR/IP), `MAXMIND_MMDB_PATH: z.string().optional()`. `.env.example`에 예시 추가.

- [ ] **Step 2: 실패 테스트** — `network-location.test.ts`.

```ts
it('flags corp IP inside CIDR as onCorpNetwork', () => {
  const r = resolveNetworkLocation('10.20.30.40', { corpCidrs: ['10.20.0.0/16'] });
  expect(r.onCorpNetwork).toBe(true); expect(r.publicIp).toBe('10.20.30.40');
});
it('flags outside IP as not on corp', () => {
  expect(resolveNetworkLocation('8.8.8.8', { corpCidrs: ['10.20.0.0/16'] }).onCorpNetwork).toBe(false);
});
it('null ip → not corp, publicIp null', () => {
  expect(resolveNetworkLocation(null, { corpCidrs: [] })).toEqual({ publicIp: null, onCorpNetwork: false });
});
```

- [ ] **Step 3: 실패 확인** → `pnpm vitest run server/test/network-location.test.ts` (모듈 없음).

- [ ] **Step 4: `network-location.ts` 구현** — 순수 IPv4 CIDR 매칭(비트마스크). mmdb는 `MAXMIND_MMDB_PATH` 존재 시에만 `maxmind` 조회(패키지 미설치면 city/region undefined; 의존성 추가는 선택 — 없으면 IP만). **YAGNI: mmdb 조회는 파일 존재 시에만 lazy-load, 없으면 스킵.**

- [ ] **Step 5: 통과 + 커밋**

```bash
pnpm vitest run server/test/network-location.test.ts
git add server/src/config.ts server/src/services/network-location.ts server/test/network-location.test.ts .env.example
git commit -m "feat(server): CORP_PUBLIC_IPS corp/external network resolution (+optional mmdb)"
```

### Task C.2: `resolveIndoorLocation` 확장 — 주변 스캔 최강 매핑 BSSID

**Files:**
- Modify: `server/src/services/location.ts`
- Test: `server/test/location.test.ts`

**Interfaces:**
- Consumes: `ap_map`, 보고의 `bssid` + `nearbyAps`(jsonb 배열).
- Produces:
```ts
export async function resolveIndoorLocationFromReport(
  db: DbClient,
  report: { bssid: string | null; nearbyAps?: { bssid: string; rssi: number }[] | null },
): Promise<IndoorLocation | null>;
```
연결 BSSID가 매핑되면 그것, 아니면 주변 스캔 중 `ap_map`에 존재하는 BSSID들 가운데 RSSI 최강을 사용. 기존 `resolveIndoorLocation(db, bssid)`는 유지(하위호환).

- [ ] **Step 1: 실패 테스트** — 연결 BSSID 미매핑 + 주변 스캔에 매핑 BSSID 2개(강/약) → 강한 쪽 위치 반환.

- [ ] **Step 2: 실패 확인** → `pnpm vitest run server/test/location.test.ts`.

- [ ] **Step 3: 구현** — 후보 BSSID 집합(`[report.bssid, ...nearby]`)을 `inArray`로 한 번에 조회, 매핑된 것 중 nearby RSSI 최강(연결 BSSID는 최우선) 선택.

- [ ] **Step 4: 통과 + 커밋**

```bash
git add server/src/services/location.ts server/test/location.test.ts
git commit -m "feat(server): indoor location from strongest mapped nearby-AP"
```

### Task C.3: 상세 응답에 `network` + 확장 report 필드 + 주변 AP 매핑

**Files:**
- Modify: `server/src/routes/admin/devices.ts`
- Test: `server/test/admin-devices.test.ts`

**Interfaces:**
- Consumes: `resolveNetworkLocation`(C.1), `resolveIndoorLocationFromReport`(C.2), `config.CORP_PUBLIC_IPS`/`MAXMIND_MMDB_PATH`.
- Produces: `GET /api/admin/devices/:id` 응답에 `network: NetworkLocation` 추가; `indoor`는 `resolveIndoorLocationFromReport`로 계산; `recentReports`는 확장 컬럼 그대로 포함(이미 `select().from(reports)` 전체 select이라 자동 포함); 각 `nearbyAps` 항목에 `ap_map` 매핑 위치 부착.

- [ ] **Step 1: 실패 테스트** — 최신 보고의 `publicIp`가 CORP CIDR 안이면 `network.onCorpNetwork===true`; 밖이면 false. `indoor`가 주변 스캔 최강 매핑을 반영.

- [ ] **Step 2: 실패 확인** → `pnpm vitest run server/test/admin-devices.test.ts`.

- [ ] **Step 3: 상세 핸들러 수정** — `latestReport`/`recentReports[0]`의 `publicIp`·`nearbyAps` 사용:
```ts
const corpCidrs = app.deps.config.CORP_PUBLIC_IPS.split(',').map(s=>s.trim()).filter(Boolean);
const top = recentReports[0] ?? null;
const network = resolveNetworkLocation(top?.publicIp ?? null, { corpCidrs, mmdbPath: app.deps.config.MAXMIND_MMDB_PATH });
const indoor = await resolveIndoorLocationFromReport(db, { bssid: top?.bssid ?? null, nearbyAps: (top?.nearbyAps as any) ?? null });
return { device, currentUser, indoor, network, recentReports, history, asset };
```
(list 뷰의 `indoor`도 `resolveIndoorLocationFromReport`로 통일 — 선택.)

- [ ] **Step 4: 통과 + 커밋**

```bash
git add server/src/routes/admin/devices.ts server/test/admin-devices.test.ts
git commit -m "feat(server): device detail returns corp/external network + scan-based indoor"
```

### Task C.4: 대시보드 위치 섹션 (실내 + 네트워크 배지)

**Files:**
- Modify: `dashboard/src/api/types.ts` (`DeviceDetail`에 `network`)
- Create: `dashboard/src/components/LocationSection.tsx`
- Modify: `dashboard/src/pages/DeviceDetail.tsx`
- Test: DeviceDetail 테스트 확장

**Interfaces:**
- Consumes: 상세 응답 `network`/`indoor`.
- Produces: 위치 섹션 — 실내(건물·층·zone 또는 “실내 위치 미확인 — AP매핑 필요”), 네트워크 배지(**사내망/외부망** + 공인 IP + mmdb 있을 때 도시), GPS 부재 설명 문구.

- [ ] **Step 1: 타입 추가** — `export interface NetworkLoc { publicIp: string|null; onCorpNetwork: boolean; city?: string|null; region?: string|null }` + `DeviceDetail.network: NetworkLoc | null`.
- [ ] **Step 2: 실패 테스트** — 사내망 응답 → “사내망” 배지, 외부망 → “외부망” + IP, indoor null → 안내 문구.
- [ ] **Step 3: `LocationSection.tsx` 구현** + DeviceDetail 상단(지도 위/아래)에 삽입. “이 패드는 GPS가 없어 Wi-Fi/IP 기반으로 위치를 추정합니다” 문구 포함.
- [ ] **Step 4: 통과 + 커밋**

```bash
git add dashboard/src/api/types.ts dashboard/src/components/LocationSection.tsx dashboard/src/pages/DeviceDetail.tsx dashboard/src/test
git commit -m "feat(dashboard): location section — indoor + corp/external network badge"
```

---

## Phase D — 관리자 기능 가이드 (대시보드, 관리자 전용)

### Task D.1: 공통 `HelpPanel` + 무응답/AP매핑 도움말

**Files:**
- Create: `dashboard/src/components/HelpPanel.tsx`
- Modify: `dashboard/src/pages/StaleDevices.tsx`, `dashboard/src/pages/ApMapManage.tsx`
- Test: 각 페이지 테스트에 도움말/샘플 노출 검증

**Interfaces:**
- Consumes: 없음(정적 카피). AP매핑은 현재 등록 건수(`useApMap`/기존 훅 또는 업로드 응답 count).
- Produces: 접이식 도움말 패널 컴포넌트 `<HelpPanel title>{children}</HelpPanel>`.

- [ ] **Step 1: 실패 테스트** — StaleDevices에 “무응답” 도움말 문구, ApMapManage에 샘플 CSV(`bssid,building,floor,zone,note`)와 단계 안내가 렌더되는지.
- [ ] **Step 2: `HelpPanel.tsx` 작성**(`<details>` 기반, E의 토큰 적용 대비 클래스 최소화).
- [ ] **Step 3: 무응답 페이지 패널** — “최근 N일 이상 보고가 없는 패드. 방전·분실·반납 누락 점검용. 오래된 순 정렬.” + 임계일수 입력 설명.
- [ ] **Step 4: AP매핑 페이지 패널** — 설명 + 샘플 CSV 블록 + “BSSID는 패드 상세의 주변 AP 목록에서 확인” 안내 + 현재 등록 건수.
- [ ] **Step 5: 통과 + 커밋**

```bash
git add dashboard/src/components/HelpPanel.tsx dashboard/src/pages/StaleDevices.tsx dashboard/src/pages/ApMapManage.tsx dashboard/src/test
git commit -m "feat(dashboard): admin help panels (stale + ap-map) with sample CSV"
```

---

## Phase E — 대시보드 UI 세련화 (디자인 토큰, 라이트/다크)

frontend-design 원칙: 토큰화된 색/타이포/간격, 상태의 시각적 인코딩, 실용 관리도구 톤(과장 히어로 지양).

### Task E.1: 디자인 토큰 + `darkMode:'class'` + 테마 토글

**Files:**
- Modify: `dashboard/tailwind.config.ts`, `dashboard/src/index.css`
- Create: `dashboard/src/theme/useTheme.ts`, `dashboard/src/theme/ThemeToggle.tsx`
- Modify: `dashboard/src/components/Layout.tsx`

**Interfaces:**
- Produces: CSS 변수 팔레트(중립 + 악센트 + 의미색 정상/경고/위험), `theme.extend.colors`가 변수를 참조, `darkMode:'class'`, 루트 `data-theme`/`.dark` 토글 훅.

- [ ] **Step 1: `darkMode:'class'`로 변경 + `theme.extend.colors`가 CSS 변수 참조**하도록 `tailwind.config.ts` 수정.
- [ ] **Step 2: `index.css`에 `:root`/`.dark` CSS 변수** — 중립 배경/표면/테두리/텍스트, 악센트, 의미색. `prefers-color-scheme` 기본 + 클래스 오버라이드.
- [ ] **Step 3: `useTheme.ts`**(localStorage `pad_theme`, 시스템 기본) + `ThemeToggle.tsx`, Layout 헤더에 배치.
- [ ] **Step 4: 스모크 테스트** — 토글이 루트 클래스를 바꾸는지, 기존 테스트 무회귀.

```bash
cd dashboard && npm run typecheck && npm run test
```

- [ ] **Step 5: 커밋**

```bash
git add dashboard/tailwind.config.ts dashboard/src/index.css dashboard/src/theme dashboard/src/components/Layout.tsx
git commit -m "feat(dashboard): design tokens + class-based dark mode + theme toggle"
```

### Task E.2: 상태의 시각적 인코딩 + 컴포넌트 리프레시

**Files:**
- Modify: `dashboard/src/components/DeviceCard.tsx`, `Battery.tsx`, `StaleBadge.tsx`, `IndoorLabel.tsx`, `LastSeen.tsx`, `pages/DeviceDetail.tsx`, `auth/LoginPage.tsx`, `auth/ChangePasswordPage.tsx`
- Test: 기존 컴포넌트 테스트 무회귀

**Interfaces:**
- Consumes: E.1 토큰.
- Produces: 배터리/온라인/무응답/사내망을 칩·상태줄·심각도 스트라이프로 인코딩. 포커스 가시화, `prefers-reduced-motion` 존중.

- [ ] **Step 1: 배터리/무응답/사내망 상태 칩** — 의미색 토큰으로. 위험(저배터리/외부망)은 스트라이프/아이콘 동반(색만 의존 금지 — 접근성).
- [ ] **Step 2: 카드/상세 헤더/로그인·비번변경 화면 토큰 적용** — 일관 스타일, 상호작용 요소는 상호작용처럼.
- [ ] **Step 3: 라이트/다크 육안 확인**(chrome 자동화 또는 `npm run dev`) + 가로 스크롤 없음(반응형).
- [ ] **Step 4: 테스트 무회귀 + 커밋**

```bash
cd dashboard && npm run test
git add dashboard/src
git commit -m "feat(dashboard): status encoding (chips/stripes) + component refresh (light/dark)"
```

---

## Self-Review (계획 ↔ 스펙 대조)

- **A(인증/RBAC)**: 스펙 §A → 이미 구현(현황 표). Phase 0에서 병합 편입. ✅ 커버.
- **B(텔레메트리)**: 스펙 §B 수집 항목·스키마 → Task B.1~B.4. 배터리/Wi-Fi/스캔/저장/OS/가동시간 모두 컬럼·DTO·수집·표시. ✅
- **C(IP/실내)**: 스펙 §C 두 축(공인IP 사내/외부, AP 최강 매핑) → Task C.1~C.4. mmdb 선택적. ✅
- **D(관리자 가이드)**: 스펙 §D → Task D.1(무응답·AP매핑 패널 + 샘플 CSV + 건수 + employee 비노출은 기존 네비 게이트로 충족). ✅
- **E(UI 세련화)**: 스펙 §E → Task E.1~E.2(토큰·라이트/다크·상태 인코딩·컴포넌트 리프레시). ✅
- **보안/PII**: Global Constraints에 반영(scrypt 재사용, mmdb/xlsx/서비스계정 gitignore, employee 스코핑). ✅
- **자동화/게이트**: 서버·대시보드 자동 검증. 앱 텔레메트리 수집은 실기기 게이트(B.3 주석), CORP_PUBLIC_IPS·mmdb·관리자 계정은 운영자 값. ✅

**타입 일관성**: `resolveIndoorLocationFromReport`(C.2)를 C.3에서 동일 시그니처로 사용. `NetworkLocation`(C.1) ↔ 대시보드 `NetworkLoc`(C.4) 필드명 일치(`publicIp`,`onCorpNetwork`,`city`,`region`). `ReportRequest` 필드명(B.2) ↔ 서버 `Body`(B.1) ↔ 대시보드 `Report`(B.4) camelCase 일치.

**미결/운영자 입력**: mmdb 파일(선택), `CORP_PUBLIC_IPS` 실값, 실기기 텔레메트리 검증.
