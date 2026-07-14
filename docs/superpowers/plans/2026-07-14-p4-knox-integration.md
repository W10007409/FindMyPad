# P4 — Knox 실기기 통합 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** P2 knox 플레이버의 `KnoxDeviceControl` 스텁을 확보된 `knoxsdk.jar`(API 28) 실 API로 구현하고, Device Admin·Knox 권한·라이선스 키 주입을 배선해 `assembleKnoxDebug`가 실 Knox 시그니처로 컴파일되게 한다. 런타임 동작은 삼성 실기기+KPE 키 게이트(수동 체크리스트).

**Architecture:** Knox 코드는 `android.*` + `com.samsung.android.knox.*` 프레임워크 의존이라 **JVM 유닛테스트 불가**(에뮬레이터에서도 Knox 미동작). 따라서 각 태스크의 검증 게이트는 **`./gradlew :app:assembleKnoxDebug` 컴파일 성공**(실 jar와 시그니처 정합) + dev 플레이버/유닛테스트 무회귀. 런타임 검증은 `docs/knox-device-test.md` 실기기 체크리스트.

**Tech Stack:** Kotlin, Android(AGP 8.5.2, minSdk 26), knoxsdk.jar(API 28 rev5), kotlinx-coroutines(suspendCancellableCoroutine/withTimeoutOrNull). (P2 프로젝트 위에 추가.)

## Global Constraints

- **Base**: `feat/p2-android` → `feat/p4-knox`. android-agent 프로젝트(패키지 `com.wjtb.padtracker`)는 이미 존재. **dev 플레이버·기존 유닛테스트는 절대 깨지 않는다**(무회귀).
- **NO JVM 유닛테스트 for Knox 코드**: Knox/android 프레임워크 의존이라 테스트 불가. 검증은 컴파일. (기존 dev 유닛테스트만 유지.)
- **빌드 시간**: Android 빌드는 수 분. Gradle 호출은 600000ms(10분) 타임아웃.
- **시크릿/restricted**: `knoxsdk.jar`(Samsung restricted)와 `local.properties`(KPE 키)는 **커밋 금지** — 루트 `.gitignore`가 `android-agent/app/libs/knoxsdk.jar`·`android-agent/local.properties`를 이미 무시. 커밋 전 `git status`로 확인.
- **확인된 실 jar API**(javap, 컴파일 근거):
  - `KnoxEnterpriseLicenseManager.getInstance(Context)` · `void activateLicense(String)` · 상수 `ACTION_LICENSE_STATUS="com.samsung.android.knox.intent.action.KNOX_LICENSE_STATUS"`, `EXTRA_LICENSE_ERROR_CODE`, `ERROR_NONE=0`, `ERROR_UNKNOWN=102`, `ERROR_INTERNAL=301`.
  - `EnterpriseDeviceManager.getInstance(Context)` · `getApplicationPolicy()` (Kotlin `.applicationPolicy`).
  - `ApplicationPolicy.setApplicationUninstallationDisabled(String)`(void) · `int applyRuntimePermissions(AppIdentity, List<String>, int)` · `PERMISSION_POLICY_STATE_GRANT`.
  - `AppIdentity(String, String)`.
  - **WifiPolicy에 MAC 랜덤화 API 없음** → `disableMacRandomization`은 no-op(false+로그, KSP 안내).
  - 시리얼: `android.os.Build.getSerial()`(READ_PHONE_STATE 필요).
- **KnoxDeviceControl 시그니처 변경**: `KnoxDeviceControl(context: Context, licenseKey: String)` — knox `KnoxBindings.provideDeviceControl(context)`가 `BuildConfig.KPE_LICENSE_KEY`로 주입.
- **컴파일 에러는 실제 jar 기준으로 조정**(정의서 §4.1.2): 시그니처가 미세하게 다르면 컴파일 에러를 근거로 맞춘다. jar 조사는 위 상수/시그니처로 확정.

---

## 파일 구조 (P2 위에 추가/변경)

```
FindMyPad/android-agent/
├── app/libs/knoxsdk.jar                       # (신규) 확보 jar 복사, gitignore
├── local.properties                           # (변경) KPE_LICENSE_KEY 추가 (gitignore)
├── app/build.gradle.kts                        # (변경) knoxImplementation jar + knox buildConfigField
└── app/src/knox/
    ├── AndroidManifest.xml                     # (신규) Knox 권한 + Device Admin 리시버 + READ_PHONE_STATE
    ├── res/xml/device_admin.xml                # (신규) Device Admin 정책
    └── java/com/wjtb/padtracker/
        ├── core/KnoxDeviceControl.kt           # (변경) 스텁 → 실구현
        ├── KnoxBindings.kt                     # (변경) KnoxDeviceControl(context, KPE key) 주입
        └── admin/AgentAdminReceiver.kt, admin/DeviceAdminHelper.kt   # (신규)
docs/knox-device-test.md                         # (신규) 실기기 수동 체크리스트
```

> 참고: Device Admin 산출물(AgentAdminReceiver/device_admin.xml/Manifest 리시버)은 **knox 소스셋**에 둔다 → dev 플레이버는 Device Admin 선언 footprint 0.

---

## Task 1: 빌드 배선 — jar 편입 + KPE 키 주입 (스텁 유지 컴파일)

**Files:**
- Create: `android-agent/app/libs/knoxsdk.jar` (확보 jar 복사; gitignore — 커밋 안 함)
- Modify: `android-agent/app/build.gradle.kts` (knox 플레이버 의존성 + buildConfigField)
- Modify: `android-agent/local.properties` (KPE_LICENSE_KEY; gitignore — 커밋 안 함)

**Interfaces:**
- Produces: knox 플레이버 컴파일 클래스패스에 knoxsdk.jar, `BuildConfig.KPE_LICENSE_KEY`(knox 플레이버).

- [ ] **Step 1: jar 복사**

```bash
cp "F:/MyWorkSpace/FindMyPad/addon_knox_api_level_28_samsung_electronics/libs/knoxsdk.jar" \
   "F:/MyWorkSpace/FindMyPad/android-agent/app/libs/knoxsdk.jar"
```
확인: `ls android-agent/app/libs/knoxsdk.jar`. (루트 `.gitignore`가 이 경로를 무시 → 커밋되지 않음.)

- [ ] **Step 2: local.properties에 KPE 키 자리 추가**

`android-agent/local.properties`에 한 줄 추가(빌드 검증용 더미; 실 키는 사람이 교체):
```properties
KPE_LICENSE_KEY=
```
(빈 값이어도 빌드는 통과 — 런타임에만 필요. gitignore.)

- [ ] **Step 3: app/build.gradle.kts 수정**

파일 상단(plugins 위 또는 android 블록 앞)에 local.properties에서 키 읽기:
```kotlin
import java.util.Properties

val kpeLicenseKey: String = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}.getProperty("KPE_LICENSE_KEY", "")
```
`android { productFlavors { create("knox") { ... } } }`의 knox 플레이버에 buildConfig 필드 추가:
```kotlin
create("knox") {
    dimension = "target"
    buildConfigField("String", "KPE_LICENSE_KEY", "\"$kpeLicenseKey\"")
}
```
`dependencies { }`에 knox 플레이버 한정 jar 의존성 추가(문자열 config 이름 사용):
```kotlin
"knoxImplementation"(files("libs/knoxsdk.jar"))
```
> 정의서 §4.1은 `implementation files('libs/knoxsdk.jar')`를 명시. dex 충돌 발생 시 `"knoxCompileOnly"`로 폴백(디바이스 프레임워크가 런타임 클래스 제공) — 컴파일에는 둘 다 충분.

- [ ] **Step 4: 빌드 검증 (스텁 상태로 무회귀)**

Run:
```bash
cd android-agent && ./gradlew :app:assembleKnoxDebug :app:assembleDevDebug :app:testDevDebugUnitTest --no-daemon
```
Expected: 셋 다 BUILD SUCCESSFUL. (KnoxDeviceControl은 아직 스텁 — jar가 클래스패스에 있어도 미참조라 컴파일 OK. dev·유닛테스트 무회귀.)

- [ ] **Step 5: 커밋 (jar·local.properties 제외 확인)**

```bash
git add android-agent/app/build.gradle.kts
git status   # app/libs/knoxsdk.jar, local.properties 가 staged 아님을 확인
git commit -m "build(android): wire knoxsdk.jar into knox flavor + KPE_LICENSE_KEY buildConfig"
```

---

## Task 2: Device Admin (리시버 + 정책 xml + 헬퍼) — knox 소스셋

**Files:**
- Create: `android-agent/app/src/knox/java/com/wjtb/padtracker/admin/AgentAdminReceiver.kt`
- Create: `android-agent/app/src/knox/java/com/wjtb/padtracker/admin/DeviceAdminHelper.kt`
- Create: `android-agent/app/src/knox/res/xml/device_admin.xml`

**Interfaces:**
- Produces: `AgentAdminReceiver : DeviceAdminReceiver`, `DeviceAdminHelper.isAdminActive(ctx)`/`adminActivationIntent(ctx)`/`componentName(ctx)`.

- [ ] **Step 1: AgentAdminReceiver.kt**

```kotlin
package com.wjtb.padtracker.admin
import android.app.admin.DeviceAdminReceiver
/** Knox 라이선스 활성화 전 기기 관리자로 활성화되어야 한다(최초 1회 사용자 탭). */
class AgentAdminReceiver : DeviceAdminReceiver()
```

- [ ] **Step 2: device_admin.xml**

`app/src/knox/res/xml/device_admin.xml`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<device-admin xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-policies>
        <force-lock />
    </uses-policies>
</device-admin>
```

- [ ] **Step 3: DeviceAdminHelper.kt**

```kotlin
package com.wjtb.padtracker.admin
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent

object DeviceAdminHelper {
    fun componentName(ctx: Context): ComponentName = ComponentName(ctx, AgentAdminReceiver::class.java)

    fun isAdminActive(ctx: Context): Boolean {
        val dpm = ctx.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        return dpm.isAdminActive(componentName(ctx))
    }

    fun adminActivationIntent(ctx: Context): Intent =
        Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN)
            .putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, componentName(ctx))
            .putExtra(
                DevicePolicyManager.EXTRA_ADD_EXPLANATION,
                "패드 위치추적 에이전트가 기기 관리 정책(앱 삭제 방지 등)을 적용하려면 기기 관리자 권한이 필요합니다.",
            )
}
```

- [ ] **Step 4: 컴파일 검증**

Run: `cd android-agent && ./gradlew :app:compileKnoxDebugKotlin --no-daemon` → BUILD SUCCESSFUL.
> Manifest에 리시버 등록은 Task 4에서. 이 태스크는 클래스 컴파일만 검증(리시버 미등록이어도 컴파일됨).

- [ ] **Step 5: 커밋**

```bash
git add android-agent/app/src/knox/java/com/wjtb/padtracker/admin android-agent/app/src/knox/res/xml/device_admin.xml
git commit -m "feat(android/knox): Device Admin receiver + policy xml + admin helper"
```

---

## Task 3: KnoxDeviceControl 실구현 (확보 jar API)

**Files:**
- Modify: `android-agent/app/src/knox/java/com/wjtb/padtracker/core/KnoxDeviceControl.kt` (스텁 → 실구현)

**Interfaces:**
- Produces: `KnoxDeviceControl(context, licenseKey)` — DeviceControl 실구현.
- Consumes: `DeviceAdminHelper`(Task 2), Knox jar 클래스(Task 1).

- [ ] **Step 1: KnoxDeviceControl.kt 실구현**

```kotlin
package com.wjtb.padtracker.core

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.util.Log
import com.samsung.android.knox.AppIdentity
import com.samsung.android.knox.EnterpriseDeviceManager
import com.samsung.android.knox.application.ApplicationPolicy
import com.samsung.android.knox.license.KnoxEnterpriseLicenseManager
import com.wjtb.padtracker.admin.DeviceAdminHelper
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.coroutines.resume

class KnoxDeviceControl(
    private val context: Context,
    private val licenseKey: String,
) : DeviceControl {

    private val pkg: String get() = context.packageName

    override suspend fun activateLicense(): Result<Unit> {
        if (!DeviceAdminHelper.isAdminActive(context)) {
            return Result.failure(IllegalStateException("Device Admin not active"))
        }
        if (licenseKey.isBlank()) {
            return Result.failure(IllegalStateException("KPE license key not configured"))
        }
        val errorCode: Int? = withTimeoutOrNull(LICENSE_TIMEOUT_MS) {
            suspendCancellableCoroutine { cont ->
                val receiver = object : BroadcastReceiver() {
                    override fun onReceive(ctx: Context, intent: Intent) {
                        if (intent.action == KnoxEnterpriseLicenseManager.ACTION_LICENSE_STATUS) {
                            val code = intent.getIntExtra(
                                KnoxEnterpriseLicenseManager.EXTRA_LICENSE_ERROR_CODE,
                                KnoxEnterpriseLicenseManager.ERROR_UNKNOWN,
                            )
                            runCatching { context.unregisterReceiver(this) }
                            if (cont.isActive) cont.resume(code)
                        }
                    }
                }
                context.registerReceiver(receiver, IntentFilter(KnoxEnterpriseLicenseManager.ACTION_LICENSE_STATUS))
                cont.invokeOnCancellation { runCatching { context.unregisterReceiver(receiver) } }
                try {
                    KnoxEnterpriseLicenseManager.getInstance(context).activateLicense(licenseKey)
                } catch (e: Exception) {
                    runCatching { context.unregisterReceiver(receiver) }
                    if (cont.isActive) cont.resume(KnoxEnterpriseLicenseManager.ERROR_INTERNAL)
                }
            }
        }
        return when (errorCode) {
            KnoxEnterpriseLicenseManager.ERROR_NONE -> Result.success(Unit)
            null -> Result.failure(IllegalStateException("License activation timed out"))
            else -> Result.failure(IllegalStateException("License activation failed (code=$errorCode)"))
        }
    }

    override fun lockUninstall(): Boolean = try {
        EnterpriseDeviceManager.getInstance(context).applicationPolicy
            .setApplicationUninstallationDisabled(pkg)
        true
    } catch (e: Exception) {
        Log.w(TAG, "lockUninstall failed", e); false
    }

    override fun grantPermissionsSilently(perms: List<String>): Boolean = try {
        EnterpriseDeviceManager.getInstance(context).applicationPolicy
            .applyRuntimePermissions(
                AppIdentity(pkg, null),
                perms,
                ApplicationPolicy.PERMISSION_POLICY_STATE_GRANT,
            )
        true
    } catch (e: Exception) {
        Log.w(TAG, "grantPermissionsSilently failed", e); false
    }

    override fun disableMacRandomization(ssid: String): Boolean {
        // 이 Knox SDK(API 28, 2019)에는 WifiPolicy MAC 랜덤화 API가 없다.
        // 실제 MAC 랜덤화 해제는 Knox Service Plugin(KSP) 프로파일(관리자 설정)로 처리한다.
        Log.w(TAG, "disableMacRandomization not supported by this Knox SDK; use KSP profile for ssid=$ssid")
        return false
    }

    override fun readSerial(): String? = try {
        Build.getSerial()
    } catch (e: Exception) {
        Log.w(TAG, "readSerial failed", e); null
    }

    companion object {
        private const val TAG = "KnoxDeviceControl"
        private const val LICENSE_TIMEOUT_MS = 30_000L
    }
}
```
> `applyRuntimePermissions`는 int 결과코드를 반환하나, 성공 판정 세부는 실기기에서 확정(체크리스트) — 여기선 예외 없으면 true. 컴파일 에러 시 실제 시그니처(예: `AppIdentity` 두 번째 인자 nullability, 반환형)에 맞게 조정.

- [ ] **Step 2: 컴파일 검증 (실 jar 시그니처 정합)**

Run: `cd android-agent && ./gradlew :app:compileKnoxDebugKotlin --no-daemon` → BUILD SUCCESSFUL.
컴파일 에러가 나면 실제 jar API에 맞게 최소 수정(§Global Constraints의 확정 시그니처 참조). `assembleKnoxDebug`까지 확인.

- [ ] **Step 3: dev 무회귀 확인 + 커밋**

Run: `./gradlew :app:testDevDebugUnitTest --no-daemon` → 여전히 전부 PASS.
```bash
git add android-agent/app/src/knox/java/com/wjtb/padtracker/core/KnoxDeviceControl.kt
git commit -m "feat(android/knox): implement KnoxDeviceControl against real knoxsdk.jar"
```

---

## Task 4: knox Manifest 오버레이 + KnoxBindings 키 주입 (전체 assembleKnoxDebug)

**Files:**
- Create: `android-agent/app/src/knox/AndroidManifest.xml`
- Modify: `android-agent/app/src/knox/java/com/wjtb/padtracker/KnoxBindings.kt`

**Interfaces:**
- Produces: knox 플레이버 Manifest(Knox 권한 + Device Admin 리시버 + READ_PHONE_STATE), `provideDeviceControl(context)`가 `KnoxDeviceControl(context, BuildConfig.KPE_LICENSE_KEY)` 반환.

- [ ] **Step 1: knox AndroidManifest.xml (flavor 오버레이)**

`app/src/knox/AndroidManifest.xml`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <uses-permission android:name="android.permission.READ_PHONE_STATE" />
    <uses-permission android:name="com.samsung.android.knox.permission.KNOX_APP_MGMT" />
    <uses-permission android:name="com.samsung.android.knox.permission.KNOX_RESTRICTION_MGMT" />

    <application>
        <receiver
            android:name=".admin.AgentAdminReceiver"
            android:permission="android.permission.BIND_DEVICE_ADMIN"
            android:exported="true">
            <meta-data
                android:name="android.app.device_admin"
                android:resource="@xml/device_admin" />
            <intent-filter>
                <action android:name="android.app.action.DEVICE_ADMIN_ENABLED" />
                <action android:name="com.samsung.android.knox.intent.action.KNOX_LICENSE_STATUS" />
            </intent-filter>
        </receiver>
    </application>
</manifest>
```
> flavor Manifest는 main Manifest와 병합된다. dev 플레이버에는 이 선언이 없다.

- [ ] **Step 2: KnoxBindings.kt 수정 (키 주입)**

`app/src/knox/java/com/wjtb/padtracker/KnoxBindings.kt`:
```kotlin
package com.wjtb.padtracker
import android.content.Context
import com.wjtb.padtracker.core.*
fun provideDeviceControl(context: Context): DeviceControl =
    KnoxDeviceControl(context, BuildConfig.KPE_LICENSE_KEY)
fun providePushService(): PushService = object : PushService { override suspend fun currentToken(): String? = null }
```
> `BuildConfig`는 `com.wjtb.padtracker.BuildConfig`(같은 패키지라 import 불필요). `KPE_LICENSE_KEY`는 knox 플레이버 buildConfigField(Task 1).

- [ ] **Step 3: 전체 knox 빌드 + dev 무회귀**

Run:
```bash
cd android-agent && ./gradlew :app:assembleKnoxDebug :app:assembleDevDebug :app:testDevDebugUnitTest --no-daemon
```
Expected: `assembleKnoxDebug` BUILD SUCCESSFUL(실 Knox API 컴파일 + Manifest 병합 + 리시버 등록), dev·유닛테스트 무회귀. Manifest 병합 에러(권한/리시버) 시 로그 기준 조정.

- [ ] **Step 4: 커밋 (jar·local.properties 제외 확인)**

```bash
git add android-agent/app/src/knox/AndroidManifest.xml android-agent/app/src/knox/java/com/wjtb/padtracker/KnoxBindings.kt
git status   # knoxsdk.jar / local.properties staged 아님 재확인
git commit -m "feat(android/knox): knox manifest (Knox perms + device admin) + inject KPE key"
```

---

## Task 5: 실기기 수동 검증 체크리스트 + DoD 마감

**Files:**
- Create: `docs/knox-device-test.md`

- [ ] **Step 1: docs/knox-device-test.md 작성**

정의서 §7 Knox 경로 + §0 준비물 기반, 실기기 검증 절차:
- **선행 준비물**: Knox 파트너 계정, KPE 라이선스 키(개발용 무료), 삼성 실기기(렌탈 패드 동일 모델 권장), `android-agent/local.properties`에 `KPE_LICENSE_KEY=<발급키>`, `app/libs/knoxsdk.jar` 배치.
- **빌드/설치**: `./gradlew :app:assembleKnoxDebug` → `adb install app-knox-debug.apk`.
- **체크리스트**(각 항목 PASS 기준):
  ① 앱 최초 실행 → 기기 관리자 활성화 프롬프트(`DeviceAdminHelper.adminActivationIntent`) 수락 → `isAdminActive` true.
  ② 라이선스 활성화 → `ACTION_LICENSE_STATUS` 브로드캐스트 `EXTRA_LICENSE_ERROR_CODE == ERROR_NONE(0)` → `activateLicense()` Result.success.
  ③ `lockUninstall()` 후 설정에서 앱 삭제 시도 → 차단됨.
  ④ `grantPermissionsSilently([ACCESS_FINE_LOCATION, READ_PHONE_STATE, ...])` → 권한 무음 부여(사용자 프롬프트 없이) 확인.
  ⑤ `readSerial()` → 실 시리얼 문자열 반환(널 아님) → 서버 enroll 반영.
  ⑥ 재부팅 → `BootReceiver`가 `ReportWorker` 재등록 → 15분(또는 강제) 보고 서버 도달.
  ⑦ **MAC 고정**: 이 SDK 미지원 → **KSP 프로파일**(Knox Service Plugin, 관리자 설정)로 사내 SSID MAC 랜덤화 해제(정의서 §9 KBA-358). 앱 밖 절차 안내.
- **문제 해결**: 라이선스 실패 코드표(`ERROR_INVALID_LICENSE=201`, `ERROR_INVALID_PACKAGE_NAME=204`, `ERROR_NETWORK_*` 등)와 대응.

- [ ] **Step 2: DoD 최종 검증**

Run:
```bash
cd android-agent && ./gradlew clean :app:assembleKnoxDebug :app:assembleDevDebug :app:testDevDebugUnitTest --no-daemon
```
Expected: `assembleKnoxDebug`(실 Knox API 컴파일) + `assembleDevDebug` + 유닛테스트 전부 그린. `app-knox-debug.apk` 생성.

- [ ] **Step 3: 최종 커밋**

```bash
git add docs/knox-device-test.md
git commit -m "docs(android): Knox real-device test checklist; P4 DoD complete"
```

---

## Self-Review (스펙 대비 커버리지)

| 스펙 §5 KnoxDeviceControl 메서드 | 태스크 |
|---|---|
| activateLicense (브로드캐스트 await) | 3 |
| lockUninstall | 3 |
| grantPermissionsSilently | 3 |
| disableMacRandomization (no-op+KSP) | 3 |
| readSerial | 3 |

| 스펙 §6 Device Admin & Manifest | 태스크 |
|---|---|
| AgentAdminReceiver + device_admin.xml | 2 |
| DeviceAdminHelper | 2 |
| knox Manifest(Knox 권한 + 리시버 + READ_PHONE_STATE) | 4 |

| 스펙 §7 빌드/키 | 태스크 |
|---|---|
| knoxsdk.jar knox 의존성 | 1 |
| KPE_LICENSE_KEY 주입 | 1, 4 |

| 스펙 §8 검증 | 태스크 |
|---|---|
| assembleKnoxDebug 실 jar 컴파일 | 1,3,4,5 |
| dev 무회귀 | 1,3,4,5 |
| 실기기 수동 체크리스트 | 5 |

**미해결/주의:**
- KnoxDeviceControl은 **JVM 유닛테스트 불가**(프레임워크 의존) — 검증은 컴파일 + 실기기 체크리스트가 전부. 이는 Knox의 본질적 제약.
- `applyRuntimePermissions` 반환코드 성공 판정 세부, `Build.getSerial()` 권한 타이밍은 실기기에서 확정.
- `knoxsdk.jar`·`local.properties`는 커밋 금지 — 각 커밋 후 `git status`로 재확인.
- Device Admin 프롬프트의 온보딩 UI 실배선(EnrollmentScreen에 knox 스텝)은 범위 밖(체크리스트로 안내). 필요 시 후속 knox-UI 태스크.
- jar 의존성이 dex 충돌 시 `knoxImplementation`→`knoxCompileOnly` 폴백.
