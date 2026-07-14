# P4 — Knox 실기기 통합 설계 (spec)

> **Phase**: P4. P2 knox 플레이버의 `KnoxDeviceControl` 스텁을 확보된 `knoxsdk.jar`(API 28) 실 API로 구현. **반자동** — 코드는 자동 작성·컴파일 검증, 런타임 동작은 삼성 실기기 + KPE 라이선스 키에서만 검증(사람 게이트).
> **완료 기준**: `./gradlew :app:assembleKnoxDebug` 가 확보된 실 jar로 컴파일 성공 + dev 플레이버·유닛테스트 무회귀 + `docs/knox-device-test.md` 수동 체크리스트.
> **선행 문서**: 「구현 정의서」 §4.1.2·§4.1.5·§7·§9, 「개발 실행 설계서」(2026-07-10), P2 완료(knox 플레이버·DeviceControl 인터페이스).
> **작성일**: 2026-07-14

---

## 1. 목표 & 범위

P2에서 Mock으로 격리했던 Knox 경로를 실 SDK로 구현한다. `knoxsdk.jar`(API 28, rev5, 2019)가 이미 확보되어 있고, jar 조사 결과 필요한 클래스·시그니처가 실제로 존재함을 확인했다(§4).

**범위(In)**
- `KnoxDeviceControl`(knox 소스셋) 실구현: 라이선스 활성화(비동기 브로드캐스트 await), 앱 삭제 방지, 런타임 권한 무음 부여, 실 시리얼 조회.
- `AgentAdminReceiver`(Device Admin) + `res/xml/device_admin.xml` + `DeviceAdminHelper`.
- knox 플레이버 Manifest 오버레이(Knox 권한 + Device Admin 리시버 + READ_PHONE_STATE).
- `knoxsdk.jar`를 knox 플레이버 컴파일 의존성으로 편입, `KPE_LICENSE_KEY` 주입(local.properties→BuildConfig).
- `docs/knox-device-test.md` 실기기 수동 검증 체크리스트.

**범위 밖(Out — 게이트/미지원)**
- **MAC 랜덤화 해제**: 이 jar(API 28, 2019)에 WifiPolicy MAC 랜덤화 API **없음**(§4 확인). `disableMacRandomization`은 문서화된 no-op(false+로그); 실제 해제는 **Knox Service Plugin(KSP) 프로파일 = 관리자 설정**으로 처리(정의서 §9 KBA-358). 앱 SDK 코드 아님.
- **런타임 동작 검증**: 라이선스 활성화·삭제 차단·권한 부여·시리얼·재부팅 보고 재개 → 삼성 실기기 + KPE 키 필요(사람 체크리스트).
- **Device Admin 프롬프트의 온보딩 UI 실배선**: 최초 1회 사용자 탭은 실기기 스텝. P4는 `DeviceAdminHelper`(활성 여부/활성화 인텐트)까지 제공, UI 프롬프트 연결은 체크리스트로 안내(선택적 knox-UI 후속).
- Knox 파트너 계정·KPE 키·실기기 확보(정의서 §0 사람 준비물).

## 2. 결정 사항 (brainstorming 확정)

| 항목 | 결정 |
|---|---|
| Base 브랜치 | `feat/p2-android` → `feat/p4-knox` |
| jar 편입 | `android-agent/app/libs/knoxsdk.jar`(gitignore됨) + **knox 플레이버 한정** `knoxImplementation files("libs/knoxsdk.jar")` |
| 라이선스 키 | `local.properties`의 `KPE_LICENSE_KEY` → knox `buildConfigField BuildConfig.KPE_LICENSE_KEY`, 없으면 빈 문자열 기본(빌드 통과) |
| MAC 랜덤화 | 문서화된 no-op + KSP 가이드 |
| 라이선스 활성화 | 비동기 — `ACTION_LICENSE_STATUS` 브로드캐스트를 suspend로 await(타임아웃 포함) |
| DoD | assembleKnoxDebug 실 jar 컴파일 + dev 무회귀 + 수동 체크리스트 |

## 3. 프로젝트 구조 (P2 위에 추가/변경)

```
FindMyPad/android-agent/
├── app/libs/knoxsdk.jar                      # 확보 jar 복사 (gitignore)
├── app/build.gradle.kts                      # knoxImplementation files(libs/knoxsdk.jar) + KPE buildConfigField
├── local.properties                          # KPE_LICENSE_KEY=... (gitignore)
└── app/src/
    ├── main/
    │   ├── java/com/wjtb/padtracker/admin/AgentAdminReceiver.kt   # DeviceAdminReceiver (표준 Android)
    │   └── res/xml/device_admin.xml
    ├── knox/
    │   ├── AndroidManifest.xml               # Knox 권한 + <receiver> + READ_PHONE_STATE
    │   └── java/com/wjtb/padtracker/
    │       ├── core/KnoxDeviceControl.kt     # 스텁 → 실구현
    │       └── admin/DeviceAdminHelper.kt     # isAdminActive / adminActivationIntent
docs/knox-device-test.md                       # 수동 검증 체크리스트
```

## 4. Knox API 조사 결과 (확보 jar 기준 — 컴파일 근거)

`javap`로 `knoxsdk.jar` 확인(실제 존재 확인됨):
- `KnoxEnterpriseLicenseManager.getInstance(Context)` · `void activateLicense(String)` · 상수 `ACTION_LICENSE_STATUS`, `EXTRA_LICENSE_STATUS`, `EXTRA_LICENSE_ERROR_CODE`, `EXTRA_LICENSE_RESULT_TYPE`.
- `EnterpriseDeviceManager.getInstance(Context)` · `getApplicationPolicy()` · `getWifiPolicy()` · `getRestrictionPolicy()`.
- `ApplicationPolicy.setApplicationUninstallationDisabled(String)`(**void**) · `int applyRuntimePermissions(AppIdentity, List<String>, int)` · 상수 `PERMISSION_POLICY_STATE_GRANT`.
- `AppIdentity(String, String)` 생성자.
- **WifiPolicy에 MAC 랜덤화 메서드 없음** → §1 범위 밖.
- 시리얼: `android.os.Build.getSerial()`(READ_PHONE_STATE 필요; Knox가 무음 부여).

> 시그니처가 실제 jar와 정확히 맞물리는지는 `assembleKnoxDebug` 컴파일로 검증한다(정의서 §4.1.2 주의: "컴파일 에러를 기준으로 조정").

## 5. KnoxDeviceControl 실구현 명세

```kotlin
class KnoxDeviceControl(private val context: Context, private val licenseKey: String) : DeviceControl {
  override suspend fun activateLicense(): Result<Unit>          // ↓ §5.1
  override fun lockUninstall(): Boolean                          // setApplicationUninstallationDisabled(pkg) → true; SecurityException → false
  override fun grantPermissionsSilently(perms: List<String>): Boolean  // applyRuntimePermissions(AppIdentity(pkg,null), perms, GRANT) 성공코드 → true
  override fun disableMacRandomization(ssid: String): Boolean    // no-op: false + 로그(KSP 안내)
  override fun readSerial(): String?                             // Build.getSerial(); SecurityException → null
}
```

### 5.1 activateLicense (비동기 브로드캐스트)
1. `DeviceAdminHelper.isAdminActive(context)` 아니면 `Result.failure(IllegalStateException("Device Admin not active"))`.
2. `licenseKey` 비어있으면 `Result.failure`("KPE key not configured").
3. `suspendCancellableCoroutine`: `ACTION_LICENSE_STATUS` 리시버 등록 → `KnoxEnterpriseLicenseManager.getInstance(context).activateLicense(licenseKey)` → 브로드캐스트 수신 시 `EXTRA_LICENSE_STATUS`/`EXTRA_LICENSE_ERROR_CODE`로 성공/실패 판정, 리시버 해제, resume. 타임아웃(예 30s) 시 실패.

### 5.2 플레이버 바인딩
`KnoxDeviceControl`이 `context`+`licenseKey`를 받도록 변경 → knox 소스셋 `KnoxBindings.provideDeviceControl(context)`가 `KnoxDeviceControl(context, BuildConfig.KPE_LICENSE_KEY)` 주입. (dev는 무관.)

## 6. Device Admin & Manifest

- `AgentAdminReceiver : DeviceAdminReceiver`(main) — 표준. `res/xml/device_admin.xml`에 정책(force-lock 등 최소).
- `DeviceAdminHelper`(knox): `isAdminActive(ctx): Boolean`, `adminActivationIntent(ctx): Intent`(`ACTION_ADD_DEVICE_ADMIN` + EXTRA_DEVICE_ADMIN + 설명).
- `app/src/knox/AndroidManifest.xml`(flavor 오버레이, main과 병합):
  - `<uses-permission>` Knox: `com.samsung.android.knox.permission.KNOX_APP_MGMT`, `KNOX_WIFI`, `KNOX_RESTRICTION_MGMT`(사용 API 최소), `android.permission.READ_PHONE_STATE`.
  - `<receiver android:name=".admin.AgentAdminReceiver" permission="BIND_DEVICE_ADMIN">` + meta-data device_admin + intent-filter(DEVICE_ADMIN_ENABLED, ACTION_LICENSE_STATUS).
- dev 플레이버는 Knox 권한/리시버 선언 없음(에뮬레이터에서 무해).

## 7. 빌드 & 키 주입

- `app/build.gradle.kts`: `productFlavors { knox { ... } }`에 `buildConfigField("String", "KPE_LICENSE_KEY", "\"${...}\"")`(local.properties에서 읽되 없으면 `""`). `dependencies { knoxImplementation(files("libs/knoxsdk.jar")) }`.
- `knoxsdk.jar`는 `app/libs/`에 로컬 배치(gitignore). CI는 별도 프로비저닝(문서화).

## 8. 테스트 & 검증 (DoD)

- **자동(이 세션)**:
  1. `./gradlew :app:assembleKnoxDebug` — 확보된 실 jar로 KnoxDeviceControl·리시버·헬퍼가 **컴파일**됨(Knox 시그니처 정합성 검증). 컴파일 에러 시 실제 API에 맞게 조정(§4.1.2).
  2. `./gradlew :app:assembleDevDebug :app:testDevDebugUnitTest` — dev 플레이버·기존 유닛테스트 무회귀.
- **한계**: KnoxDeviceControl은 android.*/Knox 프레임워크 의존 → JVM 유닛테스트 불가, 에뮬레이터에서도 Knox 미동작. 따라서 런타임 검증은 실기기 체크리스트가 유일.
- **수동(사람+실기기+KPE 키)** — `docs/knox-device-test.md`:
  ① Device Admin 활성화 → 라이선스 활성화(ACTION_LICENSE_STATUS 성공) ② 앱 삭제 시도 차단 ③ 위치/전화상태 권한 자동(무음) 부여 확인 ④ `Build.getSerial()` 실 시리얼 확보 ⑤ 재부팅 후 ReportWorker 보고 재개 ⑥ MAC 고정은 KSP 프로파일 안내(앱 밖).

## 9. 완료 기준 (Definition of Done)

1. `knoxsdk.jar`가 knox 플레이버 컴파일에 편입되고 `assembleKnoxDebug`가 **실 Knox API로 컴파일 성공**.
2. `assembleDevDebug` + `testDevDebugUnitTest` 무회귀.
3. `KnoxDeviceControl`이 §5 전 메서드 실구현(activateLicense 브로드캐스트 await 포함), `AgentAdminReceiver`+`device_admin.xml`+knox Manifest 존재.
4. `KPE_LICENSE_KEY` 미주입 시에도 빌드 통과(런타임에만 필요), 시크릿 커밋 없음(local.properties·jar gitignore).
5. `docs/knox-device-test.md` 실기기 체크리스트 완비.

## 10. 자동화 수준 & 사람 게이트

**반자동.** 코드·컴파일 검증은 자동(확보 jar 덕분에 시그니처 정합성까지 확인). 런타임 동작은 **삼성 실기기 + KPE 라이선스 키 + Device Admin 최초 탭**이 필요한 사람 게이트. MAC 랜덤화는 이 SDK 미지원 → KSP 관리자 설정.
