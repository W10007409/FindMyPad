# P2 — 안드로이드 에이전트 앱 (dev 플레이버) 설계 (spec)

> **Phase**: P2. 에이전트 앱 전체 흐름을 Mock DeviceControl·Mock Push로 구현. Knox 실기기·실 FCM 없이 자동 개발.
> **완료 기준**: `./gradlew assembleDevDebug` 빌드 성공 + `./gradlew testDevDebugUnitTest` 전부 그린.
> **선행 문서**: 「구현 정의서」 §4.1, 「개발 실행 설계서」(2026-07-10), P1 완료(서버 API 계약 고정).
> **작성일**: 2026-07-12

---

## 1. 목표 & 범위

GPS 미탑재 렌탈 패드에 설치되는 Kotlin 에이전트 앱. Knox 자산 없이 **dev 플레이버 + Mock**으로 전 흐름(온보딩→체크아웃→주기보고→FCM 벨울리기→반납)을 개발·검증한다. P1 서버 API를 소비한다.

**범위(In)**
- Gradle 프로젝트(`android-agent/`), 플레이버 `dev`/`knox` 분리.
- `DeviceControl`·`PushService` 인터페이스 + `MockDeviceControl`·`MockPushService`.
- 온보딩(`EnrollmentActivity` 상당), 체크아웃+위치정보 동의, 주기 보고(WorkManager+Room 큐), FCM 벨울리기(RING/LOCATE_NOW), 반납.
- Retrofit 클라이언트(P1 API), 오프라인 큐잉·재시도, 부팅 재등록.
- JVM 단위테스트(Android-free 로직 중심).

**범위 밖(Out — 사람/키/후속 게이트)**
- **실 FCM 발송·수신** → `google-services.json` 필요. dev는 MockPushService, 키 존재 시 조건부 실 FCM.
- **에뮬레이터 E2E** → AVD·시스템이미지 필요. 수동 검증 체크리스트를 `docs/`에 산출.
- **KnoxDeviceControl 실구현** → P4(삼성 실기기+라이선스). P2는 knox 플레이버에 컴파일되는 스텁만.
- 위치정보 동의 **문구 법무본** → 서버 설정/기본 문구로 대체(정의서 §8).

## 2. 결정 사항 (brainstorming 확정)

| 항목 | 결정 |
|---|---|
| 언어/UI | Kotlin + **Jetpack Compose(Material3)** |
| SDK | minSdk 26, target·compileSdk 34, AGP 8.x, Kotlin 2.0, Gradle 래퍼 |
| 아키텍처 | MVVM. **비즈니스 로직은 Android 프레임워크 비의존(순수 Kotlin)** → JVM JUnit 테스트 |
| DI | 경량 수동 DI(`AppContainer` 서비스로케이터) |
| 네트워킹 | Retrofit + OkHttp + kotlinx-serialization |
| 주기 작업 | WorkManager(15분) + `BOOT_COMPLETED` 재등록 |
| 오프라인 큐 | Room(보고 큐잉·재시도) |
| 로컬 상태 | DataStore(디바이스 토큰, 현재 체크아웃, baseUrl) |
| 위치 | FusedLocationProviderClient (`PRIORITY_BALANCED_POWER_ACCURACY`) |
| 푸시 | firebase-messaging + `PushService` 추상화(실/Mock), google-services 플러그인 **조건부 적용** |
| 테스트 | JUnit + kotlinx-coroutines-test + Turbine + MockWebServer |

## 3. 프로젝트 구조

```
FindMyPad/android-agent/
├── settings.gradle.kts, build.gradle.kts, gradle.properties, gradlew(.bat), gradle/wrapper/
└── app/
    ├── build.gradle.kts            # productFlavors: dev, knox (dimension "target")
    ├── google-services.json        # (커밋 금지, 없으면 플러그인 미적용)
    └── src/
        ├── main/java/com/wjtb/padtracker/
        │   ├── PadTrackerApp.kt         # Application, AppContainer 생성
        │   ├── AppContainer.kt          # 수동 DI
        │   ├── core/
        │   │   ├── DeviceControl.kt      # 인터페이스 (§4.1.5)
        │   │   └── PushService.kt        # 인터페이스 (토큰/명령 콜백)
        │   ├── domain/                   # Android-free
        │   │   ├── CheckoutStateMachine.kt
        │   │   ├── ReportBuilder.kt      # 스냅샷→ReportRequest 매핑
        │   │   └── FcmCommand.kt         # RING/LOCATE_NOW 파싱
        │   ├── data/
        │   │   ├── api/                  # Retrofit 인터페이스 + DTO (P1 계약)
        │   │   ├── queue/                # Room: ReportQueueDao, Entity, DB
        │   │   ├── DeviceStore.kt        # DataStore (토큰/체크아웃/baseUrl)
        │   │   └── PadRepository.kt      # enroll/checkout/report/return 오케스트레이션
        │   ├── work/
        │   │   ├── ReportWorker.kt
        │   │   └── BootReceiver.kt
        │   ├── push/
        │   │   └── PadMessagingService.kt  # FirebaseMessagingService
        │   └── ui/
        │       ├── enrollment/ checkout/ home/   # Compose 화면 + ViewModel
        │       └── ring/RingActivity.kt          # 전체화면 벨울리기
        ├── dev/java/.../core/
        │   ├── MockDeviceControl.kt      # 항상 성공, ANDROID_ID→시리얼
        │   └── MockPushService.kt
        └── knox/java/.../core/
            └── KnoxDeviceControl.kt      # 스텁(TODO P4, knoxsdk.jar 미참조)
```

## 4. 핵심 추상화 (정의서 §4.1.5)

```kotlin
interface DeviceControl {
  suspend fun activateLicense(): Result<Unit>
  fun lockUninstall(): Boolean
  fun grantPermissionsSilently(perms: List<String>): Boolean
  fun disableMacRandomization(ssid: String): Boolean
  fun readSerial(): String?
}
// dev: MockDeviceControl — 모두 성공, readSerial()=ANDROID_ID
// knox: KnoxDeviceControl — P2에선 NotImplementedError 스텁(컴파일만), P4에서 knoxsdk.jar로 구현

interface PushService {
  suspend fun currentToken(): String?
  // 수신 명령은 PadMessagingService가 도메인 FcmCommand로 파싱해 처리
}
```

플레이버가 `AppContainer`에 어떤 구현을 주입할지 결정한다(dev→Mock, knox→Knox).

## 5. FCM을 키 없이 빌드 (핵심 제약 대응)

- `firebase-messaging` 의존성 추가(컴파일 가능).
- `app/build.gradle.kts`에서 **`com.google.gms.google-services` 플러그인은 `app/google-services.json`이 존재할 때만 적용**(`if (file("google-services.json").exists())`).
- 런타임 Firebase 초기화 가드: 키 없으면 MockPushService 경로. 크래시 없음.
- 키 투입 시 코드 변경 없이 실 FCM 활성화.
- `google-services.json`은 `.gitignore`(이미 등록됨).

## 6. 앱 흐름 (정의서 §4.1)

1. **온보딩**: 기기관리자 활성화 요청(dev=스킵/즉시) → `DeviceControl.activateLicense()` → `lockUninstall`/`grantPermissionsSilently`(dev=no-op true) → `readSerial()` → `POST /api/devices/enroll {serial,model,wifiMac,fcmToken}` → 디바이스 토큰 DataStore 저장 → 완료 화면(자산번호 + "대여자 없음").
2. **체크아웃**: 사번 입력 → **위치정보 수집 동의 화면**(목적·항목·보유기간 고지, 동의 시각) → `POST /api/checkouts {empNo,consentAt}` (활성 대여 시 409 → 안내). 성공 시 현재 체크아웃 로컬 저장.
3. **주기 보고**(`ReportWorker`, 15분): Fused 위치(`PRIORITY_BALANCED_POWER_ACCURACY`) + `WifiManager` SSID/BSSID + 배터리% + 로컬 체크아웃 → `POST /api/reports`(Bearer 디바이스 토큰). 실패 시 Room 큐잉 후 다음 실행에 재전송. `BOOT_COMPLETED`에서 Worker 재등록.
4. **벨울리기**: `PadMessagingService`가 `RING` 수신 → `AudioManager` 최대음량 강제 + 알람 사운드 반복 + 전체화면 `RingActivity`("이 패드는 {부서} {이름} 님 기기입니다…" + 중지). `LOCATE_NOW` 수신 → 즉시 1회 보고.
5. **반납**: 반납 버튼 → `POST /api/checkouts/:id/return` → 로컬 체크아웃 해제.

## 7. P1 API 연동

Retrofit 인터페이스가 P1 계약을 그대로 소비: `POST /api/devices/enroll`(→ deviceToken), `POST /api/reports`(Bearer), `POST /api/checkouts`(409), `POST /api/checkouts/:id/return`. baseUrl은 설정값(dev 기본 `http://10.0.2.2:3000`, 실기기는 서버 IP). 인증 인터셉터가 디바이스 토큰을 Bearer로 부착.

## 8. 테스트 전략 (DoD)

Android 프레임워크 비의존 로직을 JVM JUnit으로:
- **체크아웃 상태머신**: 미대여→동의→대여, 반납→미대여, 활성 대여 중 재체크아웃 차단/409 매핑.
- **ReportBuilder**: 스냅샷(위치/BSSID/배터리/사용자)→`ReportRequest` 매핑, 값 없음 시 null.
- **오프라인 큐**: 전송 실패→큐 적재, 다음 실행 시 큐 flush·성공 시 제거·재실패 시 유지(재시도).
- **MockDeviceControl**: 온보딩 시퀀스 전부 성공, `readSerial()` 비어있지 않음.
- **FcmCommand 파싱**: RING/LOCATE_NOW/알수없음 처리.
- **API 계약**(MockWebServer): enroll→토큰 파싱, checkout 409→도메인 에러, report Bearer 헤더 부착.

**DoD**: `./gradlew assembleDevDebug` 성공 + `./gradlew testDevDebugUnitTest` 전부 통과. (필요 시 `assembleKnoxDebug`도 컴파일되는지 확인 — knox 스텁.)

## 9. 완료 기준 (Definition of Done)

1. `android-agent/` Gradle 프로젝트가 `./gradlew assembleDevDebug`로 빌드된다(google-services.json 없이).
2. `./gradlew testDevDebugUnitTest` 단위테스트 전부 그린.
3. §6 전 흐름의 앱 코드 존재(온보딩·체크아웃·보고·벨울리기·반납), Mock으로 동작.
4. `google-services.json`·keystore·`local.properties`가 `.gitignore` 처리, 하드코딩 시크릿 없음.
5. `docs/`에 에뮬레이터 E2E + 실 FCM 수동 검증 체크리스트(`p2-emulator-checklist.md`).

## 10. 자동화 수준 & 사람 게이트

**높음.** Mock 격리로 Knox·실FCM·에뮬레이터 없이 전 흐름 코드+로직 테스트. **사람/키 필요(이 세션 제외)**: `google-services.json`(실 FCM 발송·수신), AVD·에뮬레이터 E2E 실행. 이들은 `docs/` 체크리스트로 안내.
