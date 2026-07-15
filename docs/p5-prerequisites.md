# P5 — 사람 준비물 체크리스트 (정의서 §0)

> 파일럿(10~20대) 배포·운영에 필요한 항목 중 **코드로 자동화할 수 없는 것들**. 각 항목을 완료 기준
> 체크박스와 함께 정리했다. Claude Code/자동화가 만들 수 있는 산출물(서버 이미지, compose, AP CSV
> 템플릿, 런북)은 이미 이 브랜치에 있다 — 아래는 **사람이 발급·구매·검토·확보**해야 하는 것만 다룬다.
>
> 참고: `addon_knox_api_level_28_samsung_electronics/libs/knoxsdk.jar`(Knox SDK jar 자체)는 이미
> 확보되어 저장소에 포함돼 있다(정의서 §0 준비물 #2 — 해결됨). 아래 목록에는 포함하지 않는다.

---

## 0. 항목 요약

| # | 준비물 | 필요 Phase | 담당 | 완료 |
|---|---|---|---|---|
| 1 | Knox 파트너 계정 | P4 이전 | 앱/인프라 담당 | ⬜ |
| 2 | KPE 라이선스 키 | P4 / 파일럿(P5) | 앱 담당 | ⬜ |
| 3 | 앱 서명 keystore | P5(서명 빌드) | 앱/보안 담당 | ⬜ |
| 4 | 서버 인프라(도메인·HTTPS·리버스 프록시) | P5(배포) | 인프라 담당 | ⬜ |
| 5 | Firebase 프로젝트(`google-services.json` + 서비스계정 JSON) | P2(FCM 확인) / P5(실배포) | 앱+서버 담당 | ⬜ |
| 6 | 위치정보 수집 동의 문구 법무 검토본 | 배포 전 | 법무 담당 | ⬜ |
| 7 | 삼성 실기기(파일럿 10~20대) | P4(검증) / P5(파일럿) | 구매/자산관리 담당 | ⬜ |

---

## 1. Knox 파트너 계정

- **무엇**: Samsung Knox 파트너 포털 계정. KPE 라이선스 키 발급·앱 패키지명 등록의 전제 조건.
- **발급처·절차**: [samsungknox.com](https://www.samsungknox.com) 파트너 포털에서 **회사 계정**으로
  가입(개인 계정 아님 — 라이선스가 조직에 귀속되어야 향후 인수인계·재발급이 가능). 사업자 정보로
  가입 승인 대기(무료).
- **소요**: 가입 자체는 수 분, 조직 계정 승인은 통상 1~3영업일.
- **필요 시점**: P4(Knox 통합) 착수 이전 — KPE 키 발급이 이 계정에 종속됨.
- **담당**: 앱/인프라 담당(사내 Samsung B2B 담당자와 협업).
- **교차 참조**: `docs/knox-device-test.md` §1 Prerequisites — 같은 계정으로 발급한 KPE 키를
  `android-agent/local.properties`의 `KPE_LICENSE_KEY`에 넣는 절차가 그 문서에 있다.

- [ ] 완료 기준: 파트너 포털에 회사 계정으로 로그인 가능, 조직 하위에 담당자 초대 완료.

---

## 2. KPE(Knox Platform for Enterprise) 라이선스 키

- **무엇**: 앱(`com.wjtb.padtracker`)이 Knox API(`EnterpriseDeviceManager`,
  `KnoxEnterpriseLicenseManager`, `ApplicationPolicy`)를 호출하려면 필요한 라이선스 키. 패키지명 단위로
  발급된다.
- **발급처·절차**: Knox 파트너 포털(§1 계정 필요) → License Portal에서 **개발용 평가 키(무료)**를
  패키지명 `com.wjtb.padtracker`로 발급 → 파일럿/상용 단계에서는 **KPE Standard(무료 티어)**로
  전환·재발급. 개발 키와 상용 키는 별도 SKU이므로 파일럿 직전 재확인 필요.
- **소요**: 포털 신청 후 즉시~수 시간(자동 발급인 경우가 많음).
- **필요 시점**: P4 실기기 검증(개발 키) / 파일럿 착수 전(KPE Standard로 전환) — P5.
- **담당**: 앱 담당.
- **교차 참조**: `docs/knox-device-test.md` §1(키를 `android-agent/local.properties`의
  `KPE_LICENSE_KEY=`에 기록, `assembleKnoxDebug`가 `BuildConfig.KPE_LICENSE_KEY`로 굽는다), §4(라이선스
  활성화 에러 코드표 — 키 문제 진단용).

- [ ] 완료 기준: 개발 키로 `docs/knox-device-test.md` §3 ② 라이선스 활성화 체크리스트 통과. 파일럿
      착수 전 KPE Standard 상용 키로 재발급·교체 완료.

---

## 3. 앱 서명 keystore

- **무엇**: 파일럿용 릴리즈 APK(`assembleKnoxRelease`)에 서명할 keystore. 디버그 키로는 배포 불가.
- **발급처·절차**: 사내 표준 keystore 생성 절차를 따른다(사내 보안팀 표준이 있으면 그것을 우선). 표준이
  없다면:
  ```bash
  keytool -genkeypair -v -keystore padtracker-release.keystore \
    -alias padtracker -keyalg RSA -keysize 2048 -validity 10000
  ```
  생성된 `.keystore`/`.jks`와 그 비밀번호(store/key password)는 **`local.properties`에만 기록하고
  절대 커밋하지 않는다** — 저장소 루트 `.gitignore`에 이미 `*.keystore`, `*.jks`,
  `android-agent/local.properties`가 등록돼 있다. 안전한 사내 시크릿 저장소(비밀번호 관리자, 사내
  Vault 등)에 백업 보관 — 분실 시 이후 업데이트를 기존 설치본에 배포할 수 없다.
- **소요**: keytool 실행 자체는 수 분. 사내 승인 절차가 있다면 별도 리드타임.
- **필요 시점**: P5 — 서명 릴리즈 빌드(`assembleKnoxRelease`) 직전. `docs/p5-deployment.md`의 앱
  배포 절차(release `signingConfig` 스니펫)가 이 keystore를 전제로 한다.
- **담당**: 앱/보안 담당.
- **교차 참조**: `feat/p4-knox` 브랜치의 `android-agent/app/build.gradle.kts` — release
  `signingConfig` 실배선은 그 브랜치 소관(이 태스크의 범위 밖, `docs/p5-deployment.md`가 스니펫 안내).

- [ ] 완료 기준: keystore 파일 생성 완료, 비밀번호 사내 시크릿 저장소에 보관, `git status`로 커밋되지
      않았음을 확인.

---

## 4. 서버 인프라 — 도메인·HTTPS(사내 리버스 프록시)

- **무엇**: 서버(`docker-compose.prod.yml`의 `server`, `HTTP:3000` 노출)를 실제 도메인·HTTPS로 노출할
  인프라. 이 서버 이미지 자체는 TLS를 종단하지 않는다 — **사내 리버스 프록시/LB가 TLS를 종단하고**
  `HTTP:3000`으로 프록시한다.
- **발급처·절차**: 사내 인프라팀에 다음을 요청:
  1. 도메인/서브도메인 할당(예: `padtracker.internal.company.com`).
  2. 리버스 프록시/LB(사내 표준 — Nginx, ALB 등)에서 해당 도메인 → 서버 컨테이너 `HTTP:3000`으로
     프록시, TLS 인증서 발급·종단.
  3. 프록시가 `X-Forwarded-For`/`X-Forwarded-Proto` 헤더를 전달하도록 설정 — 서버는
     `.env.prod`의 `TRUST_PROXY=true`로 이 헤더를 신뢰해 클라이언트 IP·프로토콜을 기록한다
     (`docs/superpowers/specs/2026-07-10-p1-server-db-design.md` public_ip 기록 로직).
- **소요**: 사내 인프라팀 티켓 처리 시간에 따름(통상 수일~수주, 조직마다 상이).
- **필요 시점**: P5 — 실 배포 시점. 로컬/사내망 IP 직접 접속으로 파일럿을 시작할 수도 있으나, HTTPS
  없이는 위치정보 등 민감 데이터가 평문으로 오가므로 **파일럿 시작 전 필수**.
  `docs/p5-deployment.md`의 배포 런북이 "사내 리버스 프록시 뒤" 단계로 이 항목을 전제한다.
- **담당**: 인프라 담당.
- **교차 참조**: `.env.prod.example`의 `TRUST_PROXY=true` 항목, `docker-compose.prod.yml`(리버스
  프록시는 compose에 미포함 — 사내 인프라가 그 앞단).

- [ ] 완료 기준: 도메인이 HTTPS로 서버에 연결되고, 서버 로그의 요청 IP가 프록시 IP가 아닌 실제
      클라이언트 IP로 기록됨을 확인.

---

## 5. Firebase 프로젝트 — `google-services.json` + 서비스계정 JSON

- **무엇**: 벨울리기(FCM push)를 실제로 동작시키는 데 필요한 두 산출물. 하나의 Firebase 프로젝트에서
  둘 다 나온다.
  - **앱 쪽**: `google-services.json` — 앱 모듈에 배치.
  - **서버 쪽**: 서비스계정(service account) JSON — FCM 서버 발송용.
- **발급처·절차**: [Firebase Console](https://console.firebase.google.com)에서 프로젝트 생성(또는
  기존 사내 Firebase 조직에 프로젝트 추가) → Android 앱 등록(패키지명 `com.wjtb.padtracker`) →
  `google-services.json` 다운로드 → **`feat/p4-knox` 브랜치의 `android-agent/app/google-services.json`
  에 배치**(그 브랜치의 `build.gradle.kts`가 이 파일 존재 시에만 `google-services` 플러그인을
  적용하도록 이미 조건부 처리돼 있음 — 없어도 P2 dev 빌드는 계속 성공). 이어서 Firebase Console →
  프로젝트 설정 → 서비스 계정 → **새 비공개 키 생성**으로 서비스계정 JSON을 발급 → 서버 배포 시
  `.env.prod`의 `FIREBASE_SERVICE_ACCOUNT`가 가리키는 경로(예: `/run/secrets/firebase-service-account.json`,
  `.env.prod.example` 기본값)에 배치.
- **서버측 미구현(교차 브랜치 주의)**: 위 서비스계정 JSON을 배치해도, 이 파일럿 배포 베이스
  (`main`)의 서버는 아직 이를 소비하지 않는다 — `server/src/server.ts`는
  `new StubFcmSender()`(인메모리 no-op, `server/src/services/fcm.ts`)를 사용하며, 저장소 어디에도
  `FIREBASE_SERVICE_ACCOUNT`를 읽는 코드가 없다. 즉 이 파일을 배치해도 `ring`/`locate` 호출은
  `{queued:true}`만 반환할 뿐 실제 푸시가 발송되지 않는다. `firebase-admin` 기반 실 FCM 발송 로직
  구현은 **서버 측 필수 후속 작업(아직 미구현)**이며, 파일럿에서 실제 벨울리기가 동작하려면 이
  작업이 먼저 배포돼야 한다.
- **소요**: 프로젝트 생성·앱 등록·키 발급 모두 수 분 내 완료(Firebase 콘솔 자가서비스).
- **필요 시점**: P2 시점에 FCM 스텁 동작 확인용으로 있으면 좋지만 필수는 아님(스텁으로 개발 가능).
  **실제 벨울리기가 동작해야 하는 시점은 P5 파일럿 착수 전** — 두 파일 모두 필요하되, 위 서버측
  미구현 캐비앗대로 서버의 실 FCM 발송 로직도 함께 배포되어야 한다.
- **담당**: 앱 담당(`google-services.json`) + 서버/인프라 담당(서비스계정 JSON 배치, 시크릿 관리).
- **교차 참조**: `.env.prod.example`의 `FIREBASE_SERVICE_ACCOUNT=/run/secrets/firebase-service-account.json`,
  `.gitignore`의 `**/google-services.json`·`**/FIREBASE_SERVICE_ACCOUNT*.json`·
  `*firebase*serviceaccount*.json` 항목(둘 다 커밋 금지 대상으로 이미 등록됨).

- [ ] 완료 기준: `android-agent/app/google-services.json` 배치 후 `assembleKnoxRelease`(또는
      `assembleKnoxDebug`)가 `google-services` 플러그인 적용 상태로 빌드 성공. 서버 쪽은 서비스계정
      JSON을 배치해 두는 것까지가 이 준비물의 완료 기준이다 — **서버가 실제로 그 파일을 읽어 FCM을
      발송하는지는 위 서버측 미구현 캐비앗대로 현재 검증 불가**(`StubFcmSender`만 배선돼 있음). 실
      FCM 발송 로직이 배포된 뒤에 재확인한다.

---

## 6. 위치정보 수집 동의 문구 법무 검토본

- **무엇**: 앱 체크아웃 시 사용자에게 노출하는 위치정보 수집·이용 동의 문구의 법무 검토 완료본
  (위치정보의 보호 및 이용 등에 관한 법률 대응).
- **발급처·절차**: 사내 법무팀에 현재 기본 문구(서버 설정값)를 전달해 검토 요청 → 검토 완료본으로
  **서버 설정값을 교체**(코드 변경 불필요 — 정의서 §8에 따라 동의 문구는 서버 설정으로 관리되도록
  이미 설계되어 있어, 법무본이 나오는 대로 배포 전 값만 바꾸면 됨).
- **소요**: 사내 법무팀 검토 사이클에 따름(통상 수일~수주).
- **필요 시점**: 배포 전(파일럿 착수 전) 필수. 코드/설계 관점에서는 P1~P2 단계에 이미 "서버 설정으로
  교체 가능"하게 준비되어 있으므로 이 항목 자체가 개발 일정을 막지는 않는다 — 법무 승인만 남은
  상태로 병행 진행 가능.
- **담당**: 법무 담당(검토), 서버/운영 담당(설정값 교체 배포).
- **교차 참조**: `docs/superpowers/specs/2026-07-12-p2-android-agent-design.md`(동의 문구를 서버
  설정/기본 문구로 대체 — 정의서 §8), `docs/superpowers/specs/2026-07-10-p1-server-db-design.md`
  (retention 등 §8 관련 env 설정).

- [ ] 완료 기준: 법무 검토 완료본 확보, 배포 전 서버 설정값을 검토본으로 교체하고 실제 체크아웃
      화면에서 노출 문구 확인.

---

## 7. 삼성 실기기 (파일럿 10~20대)

- **무엇**: Knox API는 실제 Samsung 하드웨어 + 활성 Knox 라이선스에서만 동작(JVM 유닛테스트·비삼성
  에뮬레이터 불가). 파일럿 규모(10~20대)만큼 실기기가 필요.
- **발급처·절차**: 사내 자산관리/구매를 통해 확보. **렌탈 패드와 동일 모델을 우선 권장**(실제
  운영 환경과 동일한 하드웨어에서 Knox 동작·MAC 랜덤화·배터리 특성을 검증하기 위함) — 최소 API 26+의
  Knox 지원 모델(Galaxy Tab A/S 시리즈 등)이면 P4 체크리스트는 통과 가능하나, 파일럿 자체는 동일
  모델이 리스크를 가장 줄인다.
- **소요**: 사내 구매/자산관리 리드타임에 따름(재고 있으면 즉시, 신규 구매 시 수주).
- **필요 시점**: P4 실기기 검증에 최소 1대, **파일럿(P5) 착수 시 10~20대 전량**.
- **담당**: 구매/자산관리 담당 + 앱 담당(검증).
- **교차 참조**: `docs/knox-device-test.md` §1 Prerequisites("A Samsung real device"), 이 문서가
  요구하는 `adb`·Developer Mode·USB 디버깅 활성화도 파일럿 기기 전체에 동일하게 적용해야 함.

- [ ] 완료 기준: P4 검증용 1대는 `docs/knox-device-test.md`의 체크리스트 전체(①~⑦) 통과. 파일럿용
      10~20대는 모두 확보·개통·자산 태깅 완료.

---

## 8. Phase 타임라인 표

각 항목이 어느 Phase에서 처음 필요해지는지(가장 이른 시점 기준) 정리. "P4 이전"은 P4 착수 전에
끝나 있어야 한다는 뜻이고, "P5"는 파일럿 착수 직전이 데드라인이라는 뜻이다.

| Phase | 이 시점에 반드시 완료돼 있어야 하는 준비물 |
|---|---|
| P2(Android agent, dev 빌드) | (선택) Firebase 프로젝트 — FCM 스텁 검증용. 없어도 dev 빌드는 진행 가능. |
| P4 이전(Knox 통합 착수) | ① Knox 파트너 계정 |
| P4(Knox 통합, 실기기 검증) | ② KPE 라이선스 키(개발용), ⑦ 삼성 실기기 최소 1대 |
| 배포 전(파일럿 착수 전, P5) | ③ 앱 서명 keystore, ④ 서버 인프라(도메인·HTTPS), ⑤ Firebase
`google-services.json`+서비스계정 JSON(실 FCM), ⑥ 위치정보 동의 문구 법무 검토본 |
| P5(파일럿 착수) | ② KPE 라이선스 키를 KPE Standard(상용)로 전환, ⑦ 삼성 실기기 10~20대 전량 |

---

## 9. 관련 문서

- `docs/knox-device-test.md` — Knox 파트너 계정·KPE 키·실기기 사용 절차의 상세(§1 Prerequisites,
  §4 라이선스 에러 코드표). (`feat/p4-knox` 브랜치)
- `docs/ap-map-template.csv` — 이 태스크에서 함께 생성한 AP 매핑 CSV 템플릿(별개 준비물 — 사람이
  아니라 사내 WLC/AP 관리 콘솔에서 BSSID를 확보해 채워 넣는 데이터 작업).
- `docs/p5-deployment.md` — 서버·대시보드·앱 배포 런북(keystore·Firebase·리버스 프록시를 실제로
  사용하는 절차).
- `docs/p5-pilot-runbook.md` — 파일럿 실행 순서 + 수용 기준(정의서 §7) 측정 방법.
- `.env.prod.example` — `FIREBASE_SERVICE_ACCOUNT`, `TRUST_PROXY` 등 서버 프로덕션 env 키.
