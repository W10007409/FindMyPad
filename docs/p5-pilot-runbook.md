# P5 — 파일럿 런북 (10~20대) + 수용 기준(정의서 §7)

> 파일럿 실행 순서. `docs/p5-prerequisites.md`(사람 준비물)와 `docs/p5-deployment.md`(배포 절차)가
> 이미 끝났다는 전제로, **파일럿 착수부터 1주 모니터링 + 수용 기준 측정까지**를 다룬다. 이 문서
> 자체는 실행 순서·측정 방법·기록 표를 제공할 뿐 — 실제 배포·서명·설치·측정 행위는 사람이 수행하는
> 게이트다(`docs/superpowers/specs/2026-07-15-p5-pilot-prep-design.md` §9).

---

## 0. 전체 흐름

```
① 준비물 완료 → ② 서버 배포+초기 관리자 → ③ AP 매핑 적재 → ④ 서명 앱 빌드+설치
→ ⑤ 패드별 설정(Knox+등록) → ⑥ 대시보드 검증 → ⑦ 1주 모니터링 → ⑧ 수용 기준 측정
```

각 단계는 이전 단계가 완료된 상태를 전제한다. 아래 순서대로 진행한다.

---

## 1. 준비물 완료 확인

`docs/p5-prerequisites.md`의 7개 항목이 **전부 체크 완료**돼 있어야 파일럿을 시작할 수 있다:

| # | 준비물 | 확인 방법 |
|---|---|---|
| 1 | Knox 파트너 계정 | 파트너 포털 로그인 가능 |
| 2 | KPE 라이선스 키(파일럿 = **상용(운영)용 KPE Standard 키(무료 티어)**로 전환 완료) | 개발 키가 아닌 상용(운영)용 키인지 재확인(`docs/p5-prerequisites.md` §2) |
| 3 | 앱 서명 keystore | 파일 존재 + 비밀번호 사내 시크릿 저장소 보관 + `git status`에 미노출 |
| 4 | 서버 인프라(도메인·HTTPS·리버스 프록시) | 인프라팀 티켓 완료 |
| 5 | Firebase(`google-services.json` + 서비스계정 JSON) | 두 파일 모두 배치 확인 |
| 6 | 위치정보 동의 문구 법무 검토본 | 법무 승인 완료본 확보 |
| 7 | 삼성 실기기 10~20대 | 구매/자산 태깅 완료, P4 검증용 1대는 `docs/knox-device-test.md` 체크리스트(①~⑦) 통과 |

하나라도 미완료면 해당 항목이 막는 후속 단계(예: ③은 ④·⑤ 전, keystore는 ④ 전)까지만 진행하고
대기한다. `docs/p5-prerequisites.md` §8 Phase 타임라인 표 참고.

---

## 2. 서버 배포 + 초기 관리자

전체 절차는 `docs/p5-deployment.md` §1 참고. 요약:

```bash
cp .env.prod.example .env.prod   # JWT_SECRET·POSTGRES_PASSWORD를 openssl rand -hex 로 교체
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.prod -f docker-compose.prod.yml ps
curl -f https://<도메인>/health   # {"status":"ok"}
```

초기 관리자 계정 시딩(`docs/p5-deployment.md` §1.3):

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml exec server \
  node dist/db/seed-cli.js <username> <password> admin
```

대시보드도 함께 배포한다(`docs/p5-deployment.md` §2 — `feat/p3-dashboard` 브랜치, `VITE_API_BASE_URL`
설정 후 `npm run build` → `dist/`를 리버스 프록시 `/`에 서빙). 관리자 계정으로 대시보드 로그인
(`POST /api/admin/login` → `{ token }`)이 되는지 확인한 뒤 다음 단계로 진행한다.

- [ ] 완료 기준: `/health` 200 확인, 관리자 로그인 성공, `reports.public_ip`가 실제 클라이언트 IP로
      기록됨(`docs/p5-prerequisites.md` §4 완료 기준과 동일 — 리버스 프록시 `TRUST_PROXY` 점검).

---

## 3. AP 매핑 적재

1. **WLC/AP 콘솔에서 BSSID→구역 확보**: 사내 무선랜 컨트롤러(WLC) 또는 AP 관리 콘솔에서 각 건물·층·
   구역별 AP의 BSSID(MAC 주소) 목록을 뽑는다.
2. **`docs/ap-map-template.csv` 형식으로 작성**: 헤더는 정확히 `bssid,building,floor,zone,note`
   (서버 파서 `server/src/routes/admin/ap-map.ts`의 `parseCsv()`가 이 5개 컬럼명을 그대로 찾는다 —
   순서는 바뀌어도 되지만 컬럼명 오타는 해당 행이 조용히 누락되는 원인이 된다).
   ```csv
   bssid,building,floor,zone,note
   AA:BB:CC:DD:EE:01,본관,3,동측,정문 근처
   ```
3. **적재**: 대시보드 AP매핑 화면에서 CSV 업로드(있는 경우) 또는 API 직접 호출:
   ```bash
   curl -X PUT https://<도메인>/api/admin/ap-map \
     -H "Authorization: Bearer <ADMIN_JWT>" \
     -H "Content-Type: application/json" \
     -d "{\"csv\": \"$(cat ap-map.csv | sed ':a;N;$!ba;s/\n/\\n/g')\"}"
   ```
   `bssid`가 PK이므로 재업로드 시 기존 행은 `building`/`floor`/`zone`/`note`가 덮어써진다
   (`onConflictDoUpdate`) — 구역 재배치 시 전체 CSV를 다시 올리면 된다.

- [ ] 완료 기준: 응답 `{ "upserted": N }`의 `N`이 업로드한 행 수와 일치. 파일럿 배치 예정 구역의
      AP가 전부 매핑됨(사각지대 없이) — 실내위치 정확도(§8 수용 기준 ③)가 이 매핑 완결성에 직접
      의존한다.

---

## 4. 서명 앱 빌드 → 각 패드 설치

`docs/p5-deployment.md` §3 참고(`feat/p4-knox` 브랜치). 요약:

```bash
cd android-agent
./gradlew :app:assembleKnoxRelease
```

전제: `local.properties`에 `KEYSTORE_FILE`/`KEYSTORE_PASSWORD`/`KEY_ALIAS`/`KEY_PASSWORD`(§1의 keystore
준비물) + `KPE_LICENSE_KEY`(§1의 KPE 상용 키), `app/google-services.json`(§1의 Firebase) 배치 완료.
산출물 `app-knox-release.apk`를 파일럿 기기(10~20대)에 설치:

- **MDM 사용 시**: 사내 MDM(Knox Manage 등)으로 일괄 푸시.
- **수동 설치 시**: `adb install -r app-knox-release.apk`(기기별 반복).

- [ ] 완료 기준: 전 기기(10~20대)에 서명된 릴리즈 APK 설치 완료. 설치 직후에는 아직 Device Admin·
      Knox 라이선스가 비활성 상태 — §5에서 기기별로 활성화한다.

---

## 5. 패드별 설정 (기기 1대당 반복)

각 패드마다 아래 순서를 수행한다. 상세 체크리스트·PASS 기준·에러 코드는
`docs/knox-device-test.md`(**`feat/p4-knox` 브랜치**)를 그대로 따른다:

1. **Device Admin 활성화** — 설정 → 보안/생체인식 → 기기 관리자 앱 → PadTracker → 활성화
   (`docs/knox-device-test.md` §3 ①). `adb shell dumpsys device_policy | grep -i padtracker`로 등록
   확인.
2. **Knox 라이선스 활성화** — 앱의 등록 화면에서 **등록 시작**을 누르면
   `KnoxDeviceControl.activateLicense()`가 호출된다(`docs/knox-device-test.md` §3 ②). 실패 시 §9
   롤백/이슈 대응의 에러 코드표 참고.
3. **앱에서 사번 등록 + 위치정보 동의** — 라이선스 활성화 성공 후 이어지는 등록 흐름에서 사번을
   입력하고, 법무 검토 완료본(§1 준비물 #6)이 반영된 위치정보 수집 동의 문구에 동의한다. 등록
   완료 시 "등록이 완료되었습니다."가 표시되고, 서버 기기 목록에 이 기기의 `serial`이 나타난다.

기기별 진행 상황을 아래 표에 기록해 전 대수(10~20대) 완료를 추적한다:

| 자산번호/시리얼 | Device Admin | 라이선스 활성화 | 사번 등록+동의 | 비고 |
|---|---|---|---|---|
| (예: TAB-001) | ✅ | ✅ | ✅ | |
| ... | | | | |

- [ ] 완료 기준: 파일럿 대상 전 기기가 표의 3개 항목 모두 ✅.

---

## 6. 대시보드 검증

전 기기 설정 완료 후, 대시보드에서 기본 흐름이 정상 동작하는지 확인한다:

1. **이름/사번 검색** — `GET /api/admin/devices?q=<이름 또는 사번>`(대시보드 검색창). 활성 대여
   중인 사용자의 이름/사번으로 검색 시 해당 기기가 결과에 나타나야 한다.
2. **상세 확인** — 검색 결과 클릭 → `GET /api/admin/devices/:id` → 현재 사용자(`currentUser`),
   실내위치(`indoor` — AP매핑 조인 결과), 마지막 보고(`recentReports[0]`), 배터리
   (`recentReports[0].batteryPct`)가 모두 표시되는지 확인.
3. **벨 울리기** — 상세 화면에서 벨 울리기 버튼 → `POST /api/admin/devices/:id/ring` → 대상 기기가
   FCM `RING` 메시지를 수신해 벨소리를 울리는지 확인(§8 수용 기준 ②의 사전 리허설). **주의**: 이
   배포 베이스(`main`)의 서버는 `StubFcmSender`(인메모리 no-op, `server/src/services/fcm.ts`)를
   쓰므로 이 호출은 `{queued:true}`만 반환할 뿐 실제 푸시를 보내지 않는다 — 벨소리 확인은 실 FCM
   발송 로직이 배포된 뒤에만 가능하다(`docs/p5-prerequisites.md` §5 참고). 그 전까지는 이 단계를
   생략하거나 "미구현으로 보류"로 기록한다.
4. **상세 지도** — 기기 상세의 지도 뷰에서 최근 보고의 `lat`/`lng`(네트워크 좌표, 보조 신호) 및
   AP매핑 기반 실내위치(건물/층/구역, 1차 신뢰 소스)가 함께 표시되는지 확인.

- [ ] 완료 기준: 파일럿 기기 중 무작위 3~5대를 골라 위 4개 항목 전부 정상 확인. 문제 발견 시
      §9 롤백/이슈 대응 참고 또는 §3(AP 매핑 누락)·§5(기기 등록 누락)로 돌아가 원인 파악.

---

## 7. 1주 모니터링

파일럿 착수 후 최소 1주간 아래를 매일 점검한다(`docs/p5-deployment.md` §1.5 운영 절차 그대로 사용):

> **NOTE**: 이 배포 베이스(main의 P1 서버)는 `Fastify({ logger: false })`로 빌드된다
> (`server/src/app.ts`) — 스케줄러의 `app.log.info(...)` 출력(`retention purged N reports`,
> `stale devices: N`)은 컨테이너 로그에 **나타나지 않는다**(마이그레이션 로그·`listening on ...`은
> `console.log`라 정상 출력됨). 아래 stale/retention 점검은 로그 grep이 아니라 API/DB로 직접
> 확인한다.

- **주기 보고 도달**: 각 기기가 예정된 주기로 보고를 보내고 있는지 — 대시보드 기기 목록의
  `lastSeenAt`이 갱신되고 있는지 확인.
- **무응답 기기(stale devices)**: `GET /api/admin/alerts/stale?days=7`(기본 `STALE_DAYS`, 관리자
  Bearer 토큰 필요)을 매일 직접 조회한다 — 서버가 매일 09:00 자동 스캔하지만 위 NOTE대로 결과가
  로그에 남지 않으므로, 반드시 이 API를 대시보드에서 조회하거나 직접 `curl`로 호출해 실제 대응
  (연락·회수)을 트리거해야 한다.
- **배터리**: 기기 목록의 `batteryPct`를 육안 점검(자동 알림 없음 — P5 범위 밖).
- **retention**: 매일 03:00 자동 배치(`RETENTION_DAYS`, 기본 90일 이상 지난 보고 삭제) — 이 빌드는
  로그로 실행 여부를 확인할 방법이 없다(`retention purged N reports`는 `logger:false`에서 출력
  안 됨). DB에서 `RETENTION_DAYS`보다 오래된 `reports` 행이 없는지 쿼리하는 등 간접 확인으로
  대체하거나, 후속 조치로 프로덕션 로거 활성화를 고려한다. 파일럿 1주 기간 중에는 삭제 대상이 없는
  것이 정상이므로 이 기간에는 확인 우선순위가 낮다.

| 일자 | 주기 보고 정상 대수 | stale 기기 수 | 배터리 이슈 | 비고 |
|---|---|---|---|---|
| D+1 | | | | |
| D+2 | | | | |
| ... | | | | |
| D+7 | | | | |

- [ ] 완료 기준: 1주간 표를 채우고, stale/배터리 이슈가 발생한 기기는 회수·재설치 등 조치 완료.

---

## 8. 수용 기준 측정 (정의서 §7)

1주 모니터링과 병행하거나 그 종료 시점에 아래 4개 기준을 측정한다. 각 기준은 **측정 방법**과
**기록 표**를 따른다.

### ① 관리자 검색 → 10초 내 마지막 위치·사용자

- **측정 방법**: 대시보드에서 임의 기기를 이름/사번으로 검색(`GET /api/admin/devices?q=`)한 시점부터
  결과 화면에 현재 사용자·실내위치·마지막 보고 시각이 표시되는 시점까지 스톱워치로 측정. 최소
  10회(서로 다른 기기·검색어) 반복.
- **기준**: 매 회 10초 이내.

| 회차 | 검색어(이름/사번) | 소요 시간(초) | 통과(Y/N) |
|---|---|---|---|
| 1 | | | |
| ... | | | |
| 10 | | | |

**결과**: 10회 중 __회 통과 (기준: 10/10, 최소 1회라도 실패 시 원인 조사 — 네트워크 지연/DB 인덱스
등).

### ② 벨 울리기 도달률(Wi-Fi 연결 기기) 95%+

> **주의**: 이 기준은 서버가 실제로 FCM을 발송해야 측정 가능하다. 현재 배포 베이스(`main`의 P1
> 서버)는 `server/src/server.ts`에서 `new StubFcmSender()`(인메모리 no-op,
> `server/src/services/fcm.ts`)를 쓰므로 `ring`/`locate` 호출이 `{queued:true}`를 반환해도 실제
> 기기로 푸시가 가지 않는다 — 이 기준은 `firebase-admin` 기반 실 FCM 발송 로직(`FIREBASE_SERVICE_ACCOUNT`
> 소비, 아직 미구현인 서버 측 필수 후속 작업)이 배포되기 전까지 **측정 불가**하다(`docs/p5-prerequisites.md`
> §5 참고).

- **측정 방법**: 파일럿 기기 중 **사내 Wi-Fi에 연결된 상태**의 기기를 대상으로
  `POST /api/admin/devices/:id/ring`을 호출하고, 해당 기기에서 실제 벨소리가 울리는지 확인. 파일럿
  전 대수(10~20대) 또는 최소 20회 시도를 기록.
- **기준**: (벨 울림 성공 횟수 / 총 시도 횟수) ≥ 95%.

| 기기 | Wi-Fi 연결 상태 | ring 호출 시각 | 벨 울림 확인(Y/N) |
|---|---|---|---|
| | | | |

**결과**: __ / __ 성공 = __% (기준: 95%+). 실패 사례는 FCM 토큰 갱신 여부·기기 절전모드(Doze)
설정을 우선 점검.

### ③ 실내위치(층 단위) 정확도 90%+

- **측정 방법**: 기기를 알려진 실제 위치(건물/층)에 두고 최신 보고의 `bssid`가 AP매핑
  (`ap_map` 테이블, §3에서 적재)과 조인된 `indoor.floor`가 실제 층과 일치하는지 확인. 파일럿
  공간의 여러 층·구역을 순회하며 최소 20회 측정(같은 층에서도 여러 지점).
- **기준**: (층 일치 횟수 / 총 측정 횟수) ≥ 90%. (좌표 기반 `lat`/`lng`는 보조 신호이며 이 기준의
  판정 대상이 아님 — AP매핑 조인 결과만 판정.)

| 측정 위치(실제 건물/층/구역) | 대시보드 표시 층 | 일치(Y/N) |
|---|---|---|
| | | |

**결과**: __ / __ 일치 = __% (기준: 90%+). 불일치가 많은 구역은 §3 AP매핑 누락/오기재 우선 점검
(해당 구역 BSSID가 `ap-map-template.csv` 형식으로 정확히 적재됐는지).

### ④ 사용자 임의 앱 삭제 불가

- **측정 방법**: 파일럿 기기 중 무작위 몇 대에서 설정 → 앱 → PadTracker → 제거 시도.
  `docs/knox-device-test.md` §3 ③(`lockUninstall()`) PASS 기준과 동일:
  `adb shell pm list packages | grep padtracker`로 제거 시도 후에도 앱이 여전히 설치돼 있는지 확인.
- **기준**: 시도한 전 기기에서 제거가 차단됨(회색 처리/정책 오류 토스트, 실제 제거 실패).

| 기기 | 제거 시도 결과 | 앱 여전히 설치됨(Y/N) |
|---|---|---|
| | | |

**결과**: __ / __ 차단 성공 (기준: 전수 통과).

### 종합 판정

| 기준 | 목표 | 측정 결과 | PASS/FAIL |
|---|---|---|---|
| ① 검색→10초 내 위치/사용자 | 10/10 | | |
| ② 벨 울리기 도달률 | 95%+ | | |
| ③ 실내위치 층 단위 정확도 | 90%+ | | |
| ④ 앱 삭제 차단 | 전수 | | |

4개 전부 PASS해야 파일럿 성공으로 간주(정의서 §7). FAIL 항목이 있으면 §9 롤백/이슈 대응 절차를
참고해 원인 조치 후 재측정.

---

## 9. MAC 고정 (정의서 §9, KBA-358)

`KnoxDeviceControl.disableMacRandomization()`은 이 Knox SDK(API 28) 버전에서 **미지원**(no-op) —
`docs/knox-device-test.md` §3 ⑦ 참고. MAC 고정은 앱이 아니라 **앱 외부, 관리자 측**에서 처리한다:

1. Knox 관리 콘솔(예: Knox Manage)에서 **KSP(Knox Service Plugin) Wi-Fi 프로파일**을 생성.
2. 대상 사내 SSID(`.env.prod`의 `CORP_SSIDS`와 동일한 SSID 목록)에 대해 **MAC 랜덤화 해제** 옵션을
   설정.
3. 이 KSP 프로파일을 파일럿 기기 전체에 푸시.
4. 기기가 사내 SSID에 재연결한 후, AP/WLC 콘솔의 클라이언트 테이블에서 해당 기기의 MAC이 팩토리
   (비랜덤) MAC으로 고정 표시되는지 확인 — `adb shell cmd wifi status` 또는 설정 → 휴대전화 정보 →
   상태 → Wi-Fi MAC 주소와 대조(랜덤화된 MAC은 두 번째 16진수 자리가 `2`/`6`/`a`/`e`인 지역 관리
   주소 형태를 띤다).

- [ ] 완료 기준: 파일럿 전 기기에 KSP 프로파일 적용, AP/WLC 콘솔에서 각 기기의 MAC이 재연결 후에도
      동일하게(비랜덤) 유지됨을 확인.

---

## 10. 롤백 / 이슈 대응

### Knox 라이선스 활성화 실패

`docs/knox-device-test.md` §4 에러 코드표를 참고한다. 자주 보는 원인:

| 코드 | 원인 | 조치 |
|---|---|---|
| 101 `ERROR_NULL_PARAMS` | `KPE_LICENSE_KEY` 비어있음 | `local.properties` 재확인 후 재빌드 |
| 201 `ERROR_INVALID_LICENSE` | 키가 잘못됐거나 다른 패키지명으로 발급 | 파트너 포털에서 재발급 |
| 203 `ERROR_LICENSE_TERMINATED` | 키가 포털에서 폐기됨 | 신규 키 발급 |
| 204 `ERROR_INVALID_PACKAGE_NAME` | 키-패키지명 불일치 | `com.wjtb.padtracker`로 발급된 키인지 확인 |
| 205 `ERROR_NOT_CURRENT_DATE` | 기기 시각 오류 또는 키 유효기간 종료 | 기기 시각 동기화, 키 만료 확인 |
| 208 `ERROR_INVALID_BINDING` | 계정 바인딩 불일치 | 올바른 파트너 계정으로 재활성화 |
| 301 `ERROR_INTERNAL` | SDK 내부 오류 | 재시도, logcat 확인 |

전체 코드표는 `docs/knox-device-test.md` §4 원본 참고(개발 키 기준 작성됐지만 상용 KPE Standard
키에도 동일 코드 체계 적용).

### 서버 롤백 (compose 이전 이미지)

`docker-compose.prod.yml`의 `server` 서비스는 `image: pad-tracker-server`(고정 태그)로
`docker compose up -d --build`할 때마다 최신 빌드로 덮어써진다. **배포 전 현재 이미지를 반드시
날짜/버전 태그로 백업**해 두면 문제 발생 시 되돌릴 수 있다:

```bash
# 배포 직전: 현재 실행 중인 이미지를 백업 태그로 보존
docker tag pad-tracker-server pad-tracker-server:pre-$(date +%Y%m%d)

# 새 버전 배포
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build

# 문제 발생 시 롤백: 백업 태그를 다시 pad-tracker-server로 되돌리고 재기동
docker tag pad-tracker-server:pre-20260710 pad-tracker-server
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --no-build
```

DB 스키마가 새 버전에서 마이그레이션됐다면 애플리케이션 롤백만으로 부족할 수 있다 — 마이그레이션이
하위 호환(추가 컬럼 등)인지 먼저 확인하고, 필요하면 아래 데이터 백업에서 복구한다.

### 데이터 백업/복구

`docs/p5-deployment.md` §1.5 백업 절차를 그대로 사용:

```bash
# 백업 (호스트 cron, 매일 02:30 권장)
docker compose --env-file .env.prod -f docker-compose.prod.yml \
  exec -T db pg_dump -U pad padtracker | gzip > /backup/padtracker_$(date +%Y%m%d).sql.gz

# 복구
gunzip -c /backup/padtracker_20260710.sql.gz | \
  docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T db psql -U pad -d padtracker
```

`--env-file .env.prod -f docker-compose.prod.yml`을 생략하면 저장소의 개발용 `docker-compose.yml`을
잘못 대상으로 하게 되므로 항상 명시한다(`docs/p5-deployment.md` §1.5 동일 경고).

---

## 11. 관련 문서

- `docs/p5-prerequisites.md` — 이 런북 §1이 참조하는 사람 준비물 체크리스트.
- `docs/p5-deployment.md` — 이 런북 §2~§4가 참조하는 서버·대시보드·앱 배포 절차.
- `docs/knox-device-test.md`(`feat/p4-knox` 브랜치) — 이 런북 §5·§9·§10이 참조하는 Knox 기기별
  체크리스트 및 라이선스 에러 코드표.
- `docs/ap-map-template.csv` — 이 런북 §3이 사용하는 AP 매핑 CSV 형식(`bssid,building,floor,zone,note`).
- `.env.prod.example` — 이 런북 §2·§10이 참조하는 서버 프로덕션 env 키(`CORP_SSIDS`는 §9 MAC 고정
  대상 SSID와 동일해야 함).
