# P2 — 안드로이드 에이전트 앱 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GPS 미탑재 렌탈 패드용 Kotlin 에이전트 앱을 Mock DeviceControl·Mock Push로 구현 — 온보딩→체크아웃→주기보고→FCM 벨울리기→반납 — Knox·실FCM·에뮬레이터 없이 `assembleDevDebug` 빌드 + JVM 단위테스트로 검증.

**Architecture:** Kotlin + Jetpack Compose(Material3) + MVVM. 비즈니스 로직은 Android 프레임워크 비의존(순수 Kotlin)으로 분리해 JVM JUnit으로 테스트하고, Android 글루(WorkManager/FCM/Activity/Compose)는 얇게 유지하며 빌드 컴파일로 검증한다. 경량 수동 DI(`AppContainer`). productFlavor `dev`(Mock) / `knox`(P4 스텁).

**Tech Stack:** Kotlin 2.0.20, AGP 8.5.2, Gradle 8.7, Compose BOM 2024.09.00, compileSdk 34 / minSdk 26 / targetSdk 34, Retrofit 2.11 + OkHttp 4.12 + kotlinx-serialization 1.7.1, Room 2.6.1(KSP), DataStore 1.1.1, WorkManager 2.9.1, play-services-location 21.3, firebase-bom 33.3 (messaging), JUnit4 + kotlinx-coroutines-test 1.8.1 + Turbine 1.1 + MockWebServer.

## Global Constraints

- **모듈/패키지**: 단일 `:app` 모듈, base 패키지 `com.wjtb.padtracker`. 프로젝트 루트 `android-agent/`.
- **언어**: Kotlin 2.0.20. **비즈니스 로직(domain/, 큐·리포지토리 오케스트레이션)은 `android.*` import 금지** → JVM JUnit으로 테스트 가능해야 함.
- **SDK**: minSdk 26, target·compileSdk 34.
- **플레이버**: dimension `"target"`, flavors `dev`·`knox`. `assembleDevDebug`가 1차 DoD. `knox` 소스셋의 `KnoxDeviceControl`은 **P2에선 `knoxsdk.jar`를 참조하지 않는 스텁**(NotImplementedError).
- **FCM/키**: `firebase-messaging` 의존성은 추가하되 **`com.google.gms.google-services` 플러그인은 `app/google-services.json`이 존재할 때만 적용**(`if (file("google-services.json").exists())`). dev는 키 없이 빌드/실행되어야 하며 MockPushService 경로로 동작.
- **시크릿**: `google-services.json`·`local.properties`·keystore는 `.gitignore`(루트 `.gitignore`에 android 항목 이미 존재). 하드코딩 금지.
- **P1 API 계약**(이미 배포됨, 소비 대상): `POST /api/devices/enroll {serial,model?,wifiMac?,fcmToken?}`→`{deviceId,assetNo,deviceToken}`; `POST /api/reports`(Bearer deviceToken) body `{lat?,lng?,accuracyM?,bssid?,ssid?,batteryPct?}`→`{reportId,indoor}`; `POST /api/checkouts`(Bearer) `{empNo,consentAt(ISO)}`→`{checkoutId,userId}` 또는 409 `{error:{code:"CONFLICT",...}}`; `POST /api/checkouts/{id}/return`(Bearer)→`{checkoutId,returnedAt}`.
- **빌드 시간 주의**: Android 빌드는 수 분 소요될 수 있음. Gradle 호출 시 긴 타임아웃(최대 10분) 사용. 첫 빌드는 Gradle 배포판(~130MB) + 의존성 다운로드로 특히 느림.
- **환경**: JDK 21, ANDROID_HOME=`D:\SDK\Android`(platforms;android-34, build-tools 34.0.0 존재). `local.properties`에 `sdk.dir` 지정 필요.

---

## 파일 구조 (책임)

```
FindMyPad/android-agent/
├── settings.gradle.kts, build.gradle.kts, gradle.properties, local.properties(gitignored)
├── gradlew, gradlew.bat, gradle/wrapper/{gradle-wrapper.jar,gradle-wrapper.properties}
└── app/
    ├── build.gradle.kts, proguard-rules.pro
    └── src/
        ├── main/AndroidManifest.xml
        ├── main/java/com/wjtb/padtracker/
        │   ├── PadTrackerApp.kt, AppContainer.kt
        │   ├── core/DeviceControl.kt, core/PushService.kt
        │   ├── domain/FcmCommand.kt, domain/CheckoutStateMachine.kt, domain/ReportBuilder.kt,
        │   │        domain/ReportSnapshot.kt, domain/model.kt (CheckoutState, ConsentInfo 등)
        │   ├── data/api/PadApi.kt, data/api/dto.kt, data/api/ApiResult.kt, data/api/AuthInterceptor.kt,
        │   │        data/queue/ReportQueue*.kt, data/DeviceStore.kt, data/PadRepository.kt
        │   ├── work/ReportWorker.kt, work/BootReceiver.kt
        │   ├── push/PadMessagingService.kt
        │   ├── admin/AgentAdminReceiver.kt
        │   └── ui/... (enrollment/checkout/home Compose + ViewModel), ui/ring/RingActivity.kt, ui/ring/RingController.kt
        ├── dev/java/com/wjtb/padtracker/core/MockDeviceControl.kt, core/MockPushService.kt, DevContainerBindings.kt
        ├── knox/java/com/wjtb/padtracker/core/KnoxDeviceControl.kt (stub)
        └── test/java/com/wjtb/padtracker/... (JVM unit tests)
```

## 공유 계약 (모든 태스크가 참조 — 이름 정확히 사용)

```kotlin
// core/DeviceControl.kt
interface DeviceControl {
  suspend fun activateLicense(): Result<Unit>
  fun lockUninstall(): Boolean
  fun grantPermissionsSilently(perms: List<String>): Boolean
  fun disableMacRandomization(ssid: String): Boolean
  fun readSerial(): String?
}
// core/PushService.kt
interface PushService { suspend fun currentToken(): String? }

// domain/FcmCommand.kt
sealed interface FcmCommand { data object Ring: FcmCommand; data object LocateNow: FcmCommand
  companion object { fun fromData(data: Map<String,String>): FcmCommand? } }

// domain/model.kt
data class ConsentInfo(val empNo: String, val consentAtIso: String)
sealed interface CheckoutState {
  data object NotCheckedOut: CheckoutState
  data class CheckedOut(val checkoutId: Long, val empNo: String): CheckoutState
}

// domain/ReportSnapshot.kt
data class ReportSnapshot(val lat: Double?, val lng: Double?, val accuracyM: Float?,
                          val bssid: String?, val ssid: String?, val batteryPct: Int?)

// data/api/dto.kt (kotlinx.serialization @Serializable)
EnrollRequest(serial,model?,wifiMac?,fcmToken?) / EnrollResponse(deviceId:Long,assetNo:String?,deviceToken:String)
ReportRequest(lat?,lng?,accuracyM?,bssid?,ssid?,batteryPct?) / ReportResponse(reportId:Long, indoor: Indoor?)
CheckoutRequest(empNo,consentAt) / CheckoutResponse(checkoutId:Long,userId:Long)
ReturnResponse(checkoutId:Long, returnedAt:String?)

// data/api/ApiResult.kt
sealed interface ApiResult<out T> { data class Ok<T>(val value:T):ApiResult<T>
  data object Conflict: ApiResult<Nothing>; data class Error(val cause:Throwable):ApiResult<Nothing> }

// data/PadRepository.kt (오케스트레이션; 순수-ish, Android 비의존)
class PadRepository(api, store: DeviceStore, queue: ReportQueue) {
  suspend fun enroll(serial:String, model:String?, wifiMac:String?, fcmToken:String?): ApiResult<EnrollResponse>
  suspend fun checkout(info: ConsentInfo): ApiResult<CheckoutResponse>
  suspend fun returnDevice(): ApiResult<ReturnResponse>
  suspend fun sendReport(snap: ReportSnapshot): ApiResult<ReportResponse>  // 실패 시 queue에 적재
  suspend fun flushQueue()  // 큐의 보고 재전송, 성공분 제거
}
// DeviceStore/ReportQueue 는 인터페이스로 두어 테스트에서 fake 주입
```

---

## Task 1: Gradle 스캐폴드 + 플레이버 + 그린 빌드/테스트

**Files:**
- Create: `android-agent/settings.gradle.kts`, `android-agent/build.gradle.kts`, `android-agent/gradle.properties`, `android-agent/local.properties`
- Create: `android-agent/gradle/wrapper/gradle-wrapper.properties`, `gradle-wrapper.jar`, `android-agent/gradlew`, `android-agent/gradlew.bat`
- Create: `android-agent/app/build.gradle.kts`, `android-agent/app/proguard-rules.pro`, `android-agent/app/src/main/AndroidManifest.xml`
- Create: `android-agent/app/src/main/java/com/wjtb/padtracker/PadTrackerApp.kt`
- Test: `android-agent/app/src/test/java/com/wjtb/padtracker/SmokeTest.kt`

**Interfaces:**
- Produces: 빌드 가능한 Gradle 프로젝트, `dev`/`knox` 플레이버, `PadTrackerApp: Application`.

- [ ] **Step 1: Gradle 래퍼 부트스트랩**

전역 `gradle`이 없다. 래퍼를 수동 부트스트랩한다.
`android-agent/gradle/wrapper/gradle-wrapper.properties`:
```properties
distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=https\://services.gradle.org/distributions/gradle-8.7-bin.zip
networkTimeout=10000
validateDistributionUrl=true
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
```
`gradle-wrapper.jar` 획득(택1, 성공하는 것):
```bash
cd android-agent
curl -fsSL -o gradle/wrapper/gradle-wrapper.jar \
  https://raw.githubusercontent.com/gradle/gradle/v8.7.0/gradle/wrapper/gradle-wrapper.jar
```
`gradlew`/`gradlew.bat`는 Gradle 표준 래퍼 스크립트를 사용한다(동일 v8.7 태그의 `gradlew`/`gradlew.bat`를 curl로 받아 배치):
```bash
curl -fsSL -o gradlew     https://raw.githubusercontent.com/gradle/gradle/v8.7.0/gradlew
curl -fsSL -o gradlew.bat https://raw.githubusercontent.com/gradle/gradle/v8.7.0/gradlew.bat
chmod +x gradlew
```
Expected: 4개 래퍼 파일 존재. (네트워크 필요)

- [ ] **Step 2: 루트 Gradle 파일 작성**

`android-agent/settings.gradle.kts`:
```kotlin
pluginManagement {
  repositories { google(); mavenCentral(); gradlePluginPortal() }
}
dependencyResolutionManagement {
  repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
  repositories { google(); mavenCentral() }
}
rootProject.name = "PadTracker"
include(":app")
```
`android-agent/build.gradle.kts`:
```kotlin
plugins {
  id("com.android.application") version "8.5.2" apply false
  id("org.jetbrains.kotlin.android") version "2.0.20" apply false
  id("org.jetbrains.kotlin.plugin.compose") version "2.0.20" apply false
  id("org.jetbrains.kotlin.plugin.serialization") version "2.0.20" apply false
  id("com.google.devtools.ksp") version "2.0.20-1.0.24" apply false
}
```
`android-agent/gradle.properties`:
```properties
org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
android.useAndroidX=true
kotlin.code.style=official
org.gradle.caching=true
```
`android-agent/local.properties` (gitignored — write literally):
```properties
sdk.dir=D\:\\SDK\\Android
```

- [ ] **Step 3: app 모듈 build.gradle.kts (플레이버 + 의존성)**

`android-agent/app/build.gradle.kts`:
```kotlin
plugins {
  id("com.android.application")
  id("org.jetbrains.kotlin.android")
  id("org.jetbrains.kotlin.plugin.compose")
  id("org.jetbrains.kotlin.plugin.serialization")
  id("com.google.devtools.ksp")
}
// FCM: apply google-services only if the key is present (P2 builds without it)
if (file("google-services.json").exists()) {
  apply(plugin = "com.google.gms.google-services")
}
android {
  namespace = "com.wjtb.padtracker"
  compileSdk = 34
  defaultConfig {
    applicationId = "com.wjtb.padtracker"
    minSdk = 26
    targetSdk = 34
    versionCode = 1
    versionName = "0.1.0"
    testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
  }
  flavorDimensions += "target"
  productFlavors {
    create("dev") { dimension = "target" }
    create("knox") { dimension = "target" }
  }
  buildFeatures { compose = true; buildConfig = true }
  compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
  kotlinOptions { jvmTarget = "17" }
  testOptions { unitTests { isReturnDefaultValues = true } }
  packaging { resources { excludes += "/META-INF/{AL2.0,LGPL2.1}" } }
}
dependencies {
  val composeBom = platform("androidx.compose:compose-bom:2024.09.00")
  implementation(composeBom)
  implementation("androidx.core:core-ktx:1.13.1")
  implementation("androidx.activity:activity-compose:1.9.2")
  implementation("androidx.compose.ui:ui")
  implementation("androidx.compose.material3:material3")
  implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.6")
  implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.6")
  implementation("com.squareup.retrofit2:retrofit:2.11.0")
  implementation("com.squareup.okhttp3:okhttp:4.12.0")
  implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
  implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.1")
  implementation("com.jakewharton.retrofit:retrofit2-kotlinx-serialization-converter:1.0.0")
  implementation("androidx.room:room-runtime:2.6.1")
  implementation("androidx.room:room-ktx:2.6.1")
  ksp("androidx.room:room-compiler:2.6.1")
  implementation("androidx.datastore:datastore-preferences:1.1.1")
  implementation("androidx.work:work-runtime-ktx:2.9.1")
  implementation("com.google.android.gms:play-services-location:21.3.0")
  implementation(platform("com.google.firebase:firebase-bom:33.3.0"))
  implementation("com.google.firebase:firebase-messaging")
  testImplementation("junit:junit:4.13.2")
  testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.8.1")
  testImplementation("app.cash.turbine:turbine:1.1.0")
  testImplementation("com.squareup.okhttp3:mockwebserver:4.12.0")
}
```
`app/proguard-rules.pro`: 빈 파일(주석 한 줄).

- [ ] **Step 4: Manifest + Application + smoke 테스트**

`app/src/main/AndroidManifest.xml`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET"/>
    <application
        android:name=".PadTrackerApp"
        android:label="PadTracker"
        android:theme="@style/Theme.Material3.DayNight.NoActionBar"
        android:allowBackup="false">
    </application>
</manifest>
```
`app/src/main/java/com/wjtb/padtracker/PadTrackerApp.kt`:
```kotlin
package com.wjtb.padtracker
import android.app.Application
class PadTrackerApp : Application()
```
`app/src/test/java/com/wjtb/padtracker/SmokeTest.kt`:
```kotlin
package com.wjtb.padtracker
import org.junit.Assert.assertEquals
import org.junit.Test
class SmokeTest { @Test fun sanity() { assertEquals(4, 2 + 2) } }
```

- [ ] **Step 5: 빌드 + 테스트 (DoD)**

Run (긴 타임아웃; 첫 실행은 Gradle 배포판+의존성 다운로드로 느림):
```bash
cd android-agent
./gradlew :app:testDevDebugUnitTest :app:assembleDevDebug --no-daemon
```
Expected: BUILD SUCCESSFUL, SmokeTest 통과, `app-dev-debug.apk` 생성. 실패 시(의존성 해석/버전) 에러 로그 기준으로 버전 조정.

- [ ] **Step 6: 커밋**

```bash
git add android-agent/.gitignore android-agent/settings.gradle.kts android-agent/build.gradle.kts android-agent/gradle.properties android-agent/gradlew android-agent/gradlew.bat android-agent/gradle/ android-agent/app/build.gradle.kts android-agent/app/proguard-rules.pro android-agent/app/src/main/AndroidManifest.xml android-agent/app/src/main/java android-agent/app/src/test/java
git commit -m "feat(android): gradle scaffold, dev/knox flavors, green build+smoke test"
```
> 주의: `local.properties`·`google-services.json`은 커밋하지 않는다(루트 `.gitignore`에 이미 포함). `android-agent/.gitignore`에 `/build`, `/app/build`, `.gradle/`, `local.properties` 추가.

---

## Task 2: DeviceControl 인터페이스 + Mock(dev) + Knox 스텁(knox)

**Files:**
- Create: `app/src/main/java/com/wjtb/padtracker/core/DeviceControl.kt`
- Create: `app/src/dev/java/com/wjtb/padtracker/core/MockDeviceControl.kt`
- Create: `app/src/knox/java/com/wjtb/padtracker/core/KnoxDeviceControl.kt`
- Test: `app/src/test/java/com/wjtb/padtracker/core/MockDeviceControlTest.kt`

**Interfaces:**
- Produces: `DeviceControl`(공유 계약), `MockDeviceControl(androidId: String)`, `KnoxDeviceControl` 스텁.

- [ ] **Step 1: 실패 테스트 작성**

`MockDeviceControlTest.kt`:
```kotlin
package com.wjtb.padtracker.core
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Test
class MockDeviceControlTest {
  private val dc = MockDeviceControl(androidId = "ANDROID-123")
  @Test fun activateLicense_succeeds() = runTest { assertTrue(dc.activateLicense().isSuccess) }
  @Test fun locks_and_grants_are_true() {
    assertTrue(dc.lockUninstall())
    assertTrue(dc.grantPermissionsSilently(listOf("android.permission.ACCESS_FINE_LOCATION")))
    assertTrue(dc.disableMacRandomization("CORP-WIFI"))
  }
  @Test fun readSerial_returns_androidId() { assertEquals("ANDROID-123", dc.readSerial()) }
}
```
Run: `./gradlew :app:testDevDebugUnitTest --tests "*MockDeviceControlTest" --no-daemon` → FAIL(미존재).

- [ ] **Step 2: DeviceControl.kt (main)**

```kotlin
package com.wjtb.padtracker.core
interface DeviceControl {
  suspend fun activateLicense(): Result<Unit>
  fun lockUninstall(): Boolean
  fun grantPermissionsSilently(perms: List<String>): Boolean
  fun disableMacRandomization(ssid: String): Boolean
  fun readSerial(): String?
}
```

- [ ] **Step 3: MockDeviceControl.kt (dev 소스셋)**

```kotlin
package com.wjtb.padtracker.core
class MockDeviceControl(private val androidId: String) : DeviceControl {
  override suspend fun activateLicense(): Result<Unit> = Result.success(Unit)
  override fun lockUninstall(): Boolean = true
  override fun grantPermissionsSilently(perms: List<String>): Boolean = true
  override fun disableMacRandomization(ssid: String): Boolean = true
  override fun readSerial(): String? = androidId
}
```

- [ ] **Step 4: KnoxDeviceControl.kt (knox 소스셋 스텁 — knoxsdk.jar 미참조)**

```kotlin
package com.wjtb.padtracker.core
/** P4에서 knoxsdk.jar로 구현. P2에선 컴파일용 스텁. */
class KnoxDeviceControl : DeviceControl {
  override suspend fun activateLicense(): Result<Unit> = TODO("P4: Knox license activation")
  override fun lockUninstall(): Boolean = TODO("P4")
  override fun grantPermissionsSilently(perms: List<String>): Boolean = TODO("P4")
  override fun disableMacRandomization(ssid: String): Boolean = TODO("P4")
  override fun readSerial(): String? = TODO("P4")
}
```

- [ ] **Step 5: 통과 + 두 플레이버 컴파일 확인 + 커밋**

Run: `./gradlew :app:testDevDebugUnitTest --tests "*MockDeviceControlTest" --no-daemon` → PASS.
Run: `./gradlew :app:compileKnoxDebugKotlin --no-daemon` → BUILD SUCCESSFUL(스텁 컴파일).
```bash
git add android-agent/app/src/main/java/com/wjtb/padtracker/core android-agent/app/src/dev android-agent/app/src/knox android-agent/app/src/test/java/com/wjtb/padtracker/core
git commit -m "feat(android): DeviceControl abstraction + MockDeviceControl(dev) + Knox stub(knox)"
```

---

## Task 3: FcmCommand 파싱 (순수 도메인, TDD)

**Files:**
- Create: `app/src/main/java/com/wjtb/padtracker/domain/FcmCommand.kt`
- Test: `app/src/test/java/com/wjtb/padtracker/domain/FcmCommandTest.kt`

**Interfaces:**
- Produces: `FcmCommand.fromData(Map<String,String>): FcmCommand?` (RING/LOCATE_NOW/else).

- [ ] **Step 1: 실패 테스트**

```kotlin
package com.wjtb.padtracker.domain
import org.junit.Assert.*
import org.junit.Test
class FcmCommandTest {
  @Test fun ring() { assertEquals(FcmCommand.Ring, FcmCommand.fromData(mapOf("command" to "RING"))) }
  @Test fun locate() { assertEquals(FcmCommand.LocateNow, FcmCommand.fromData(mapOf("command" to "LOCATE_NOW"))) }
  @Test fun unknown_is_null() { assertNull(FcmCommand.fromData(mapOf("command" to "NOPE"))) }
  @Test fun missing_is_null() { assertNull(FcmCommand.fromData(emptyMap())) }
}
```
Run: `./gradlew :app:testDevDebugUnitTest --tests "*FcmCommandTest" --no-daemon` → FAIL.

- [ ] **Step 2: 구현**

```kotlin
package com.wjtb.padtracker.domain
sealed interface FcmCommand {
  data object Ring : FcmCommand
  data object LocateNow : FcmCommand
  companion object {
    fun fromData(data: Map<String, String>): FcmCommand? = when (data["command"]) {
      "RING" -> Ring
      "LOCATE_NOW" -> LocateNow
      else -> null
    }
  }
}
```

- [ ] **Step 3: 통과 + 커밋**

Run: `./gradlew :app:testDevDebugUnitTest --tests "*FcmCommandTest" --no-daemon` → PASS.
```bash
git add android-agent/app/src/main/java/com/wjtb/padtracker/domain/FcmCommand.kt android-agent/app/src/test/java/com/wjtb/padtracker/domain/FcmCommandTest.kt
git commit -m "feat(android): FcmCommand parsing (RING/LOCATE_NOW)"
```

---

## Task 4: CheckoutStateMachine (순수 도메인, TDD)

**Files:**
- Create: `app/src/main/java/com/wjtb/padtracker/domain/model.kt`, `app/src/main/java/com/wjtb/padtracker/domain/CheckoutStateMachine.kt`
- Test: `app/src/test/java/com/wjtb/padtracker/domain/CheckoutStateMachineTest.kt`

**Interfaces:**
- Produces: `CheckoutState`(NotCheckedOut/CheckedOut(checkoutId,empNo)), `ConsentInfo(empNo,consentAtIso)`, `CheckoutStateMachine` with pure transitions.

- [ ] **Step 1: 실패 테스트**

```kotlin
package com.wjtb.padtracker.domain
import org.junit.Assert.*
import org.junit.Test
class CheckoutStateMachineTest {
  private val sm = CheckoutStateMachine()
  @Test fun starts_not_checked_out() { assertEquals(CheckoutState.NotCheckedOut, sm.reduce(CheckoutState.NotCheckedOut, CheckoutEvent.Reset)) }
  @Test fun checkout_success_moves_to_checked_out() {
    val s = sm.reduce(CheckoutState.NotCheckedOut, CheckoutEvent.CheckedOut(42L, "E100"))
    assertEquals(CheckoutState.CheckedOut(42L, "E100"), s)
  }
  @Test fun return_moves_to_not_checked_out() {
    val s = sm.reduce(CheckoutState.CheckedOut(42L, "E100"), CheckoutEvent.Returned)
    assertEquals(CheckoutState.NotCheckedOut, s)
  }
  @Test fun cannot_checkout_when_already_checked_out() {
    // 이미 대여 중이면 새 CheckedOut 이벤트는 무시(기존 상태 유지) — 서버 409와 대칭
    val cur = CheckoutState.CheckedOut(1L, "E1")
    assertEquals(cur, sm.reduce(cur, CheckoutEvent.CheckedOut(2L, "E2")))
  }
}
```
Run → FAIL.

- [ ] **Step 2: 구현**

`domain/model.kt`:
```kotlin
package com.wjtb.padtracker.domain
data class ConsentInfo(val empNo: String, val consentAtIso: String)
sealed interface CheckoutState {
  data object NotCheckedOut : CheckoutState
  data class CheckedOut(val checkoutId: Long, val empNo: String) : CheckoutState
}
sealed interface CheckoutEvent {
  data object Reset : CheckoutEvent
  data class CheckedOut(val checkoutId: Long, val empNo: String) : CheckoutEvent
  data object Returned : CheckoutEvent
}
```
`domain/CheckoutStateMachine.kt`:
```kotlin
package com.wjtb.padtracker.domain
class CheckoutStateMachine {
  fun reduce(state: CheckoutState, event: CheckoutEvent): CheckoutState = when (event) {
    is CheckoutEvent.Reset -> CheckoutState.NotCheckedOut
    is CheckoutEvent.Returned -> CheckoutState.NotCheckedOut
    is CheckoutEvent.CheckedOut -> when (state) {
      is CheckoutState.NotCheckedOut -> CheckoutState.CheckedOut(event.checkoutId, event.empNo)
      is CheckoutState.CheckedOut -> state // 이미 대여 중 — 무시
    }
  }
}
```

- [ ] **Step 3: 통과 + 커밋**

Run → PASS.
```bash
git add android-agent/app/src/main/java/com/wjtb/padtracker/domain/model.kt android-agent/app/src/main/java/com/wjtb/padtracker/domain/CheckoutStateMachine.kt android-agent/app/src/test/java/com/wjtb/padtracker/domain/CheckoutStateMachineTest.kt
git commit -m "feat(android): checkout state machine (pure)"
```

---

## Task 5: ReportSnapshot → ReportRequest 매핑 (순수 도메인, TDD)

**Files:**
- Create: `app/src/main/java/com/wjtb/padtracker/domain/ReportSnapshot.kt`, `app/src/main/java/com/wjtb/padtracker/data/api/dto.kt`(ReportRequest 부분만; 나머지 DTO는 Task 6), `app/src/main/java/com/wjtb/padtracker/domain/ReportBuilder.kt`
- Test: `app/src/test/java/com/wjtb/padtracker/domain/ReportBuilderTest.kt`

**Interfaces:**
- Produces: `ReportSnapshot(...)`, `ReportRequest(...)`(@Serializable), `ReportBuilder.build(snap): ReportRequest`.
- Consumes: 없음.

- [ ] **Step 1: 실패 테스트**

```kotlin
package com.wjtb.padtracker.domain
import com.wjtb.padtracker.data.api.ReportRequest
import org.junit.Assert.assertEquals
import org.junit.Test
class ReportBuilderTest {
  private val b = ReportBuilder()
  @Test fun maps_all_fields() {
    val r = b.build(ReportSnapshot(37.5, 127.0, 30f, "AP:1", "CORP", 77))
    assertEquals(ReportRequest(37.5, 127.0, 30f, "AP:1", "CORP", 77), r)
  }
  @Test fun nulls_pass_through() {
    val r = b.build(ReportSnapshot(null, null, null, null, null, null))
    assertEquals(ReportRequest(null, null, null, null, null, null), r)
  }
}
```
Run → FAIL.

- [ ] **Step 2: ReportSnapshot + ReportRequest + ReportBuilder**

`domain/ReportSnapshot.kt`:
```kotlin
package com.wjtb.padtracker.domain
data class ReportSnapshot(
  val lat: Double?, val lng: Double?, val accuracyM: Float?,
  val bssid: String?, val ssid: String?, val batteryPct: Int?,
)
```
`data/api/dto.kt` (이 태스크에서 ReportRequest만 추가; 파일은 Task 6에서 확장):
```kotlin
package com.wjtb.padtracker.data.api
import kotlinx.serialization.Serializable
@Serializable
data class ReportRequest(
  val lat: Double? = null, val lng: Double? = null, val accuracyM: Float? = null,
  val bssid: String? = null, val ssid: String? = null, val batteryPct: Int? = null,
)
```
`domain/ReportBuilder.kt`:
```kotlin
package com.wjtb.padtracker.domain
import com.wjtb.padtracker.data.api.ReportRequest
class ReportBuilder {
  fun build(s: ReportSnapshot): ReportRequest =
    ReportRequest(s.lat, s.lng, s.accuracyM, s.bssid, s.ssid, s.batteryPct)
}
```

- [ ] **Step 3: 통과 + 커밋**

Run → PASS.
```bash
git add android-agent/app/src/main/java/com/wjtb/padtracker/domain/ReportSnapshot.kt android-agent/app/src/main/java/com/wjtb/padtracker/domain/ReportBuilder.kt android-agent/app/src/main/java/com/wjtb/padtracker/data/api/dto.kt android-agent/app/src/test/java/com/wjtb/padtracker/domain/ReportBuilderTest.kt
git commit -m "feat(android): ReportSnapshot->ReportRequest builder (pure)"
```

---

## Task 6: Retrofit API + DTO + AuthInterceptor + 계약 테스트 (MockWebServer)

**Files:**
- Modify: `app/src/main/java/com/wjtb/padtracker/data/api/dto.kt` (나머지 DTO 추가)
- Create: `app/src/main/java/com/wjtb/padtracker/data/api/PadApi.kt`, `ApiResult.kt`, `AuthInterceptor.kt`, `ApiFactory.kt`
- Test: `app/src/test/java/com/wjtb/padtracker/data/api/PadApiTest.kt`

**Interfaces:**
- Produces: `PadApi`(Retrofit interface), 모든 DTO, `AuthInterceptor(tokenProvider: () -> String?)`, `ApiFactory.create(baseUrl, tokenProvider): PadApi`.
- Consumes: `ReportRequest`(Task 5).

- [ ] **Step 1: 실패 테스트 (MockWebServer)**

```kotlin
package com.wjtb.padtracker.data.api
import kotlinx.coroutines.test.runTest
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
class PadApiTest {
  private lateinit var server: MockWebServer
  private lateinit var api: PadApi
  private var token: String? = "TOK-1"
  @Before fun setUp() { server = MockWebServer(); server.start()
    api = ApiFactory.create(server.url("/").toString(), tokenProvider = { token }) }
  @After fun tearDown() { server.shutdown() }

  @Test fun enroll_parses_token() = runTest {
    server.enqueue(MockResponse().setBody("""{"deviceId":1,"assetNo":"A-1","deviceToken":"DTOK"}"""))
    val res = api.enroll(EnrollRequest(serial = "S1"))
    assertEquals("DTOK", res.deviceToken)
    val recorded = server.takeRequest()
    assertEquals("/api/devices/enroll", recorded.path)
  }
  @Test fun report_attaches_bearer() = runTest {
    server.enqueue(MockResponse().setBody("""{"reportId":9,"indoor":null}"""))
    api.report(ReportRequest(batteryPct = 50))
    val recorded = server.takeRequest()
    assertEquals("Bearer TOK-1", recorded.getHeader("Authorization"))
  }
  @Test fun checkout_409_is_conflict() = runTest {
    server.enqueue(MockResponse().setResponseCode(409).setBody("""{"error":{"code":"CONFLICT","message":"x"}}"""))
    val result = safeApiCall { api.checkout(CheckoutRequest("E100", "2026-07-12T00:00:00Z")) }
    assertTrue(result is ApiResult.Conflict)
  }
}
```
Run → FAIL.

- [ ] **Step 2: dto.kt 확장**

`data/api/dto.kt`에 추가:
```kotlin
@Serializable data class EnrollRequest(val serial: String, val model: String? = null, val wifiMac: String? = null, val fcmToken: String? = null)
@Serializable data class EnrollResponse(val deviceId: Long, val assetNo: String? = null, val deviceToken: String)
@Serializable data class Indoor(val building: String? = null, val floor: String? = null, val zone: String? = null)
@Serializable data class ReportResponse(val reportId: Long, val indoor: Indoor? = null)
@Serializable data class CheckoutRequest(val empNo: String, val consentAt: String)
@Serializable data class CheckoutResponse(val checkoutId: Long, val userId: Long)
@Serializable data class ReturnResponse(val checkoutId: Long, val returnedAt: String? = null)
```

- [ ] **Step 3: PadApi + ApiResult + AuthInterceptor + ApiFactory + safeApiCall**

`data/api/PadApi.kt`:
```kotlin
package com.wjtb.padtracker.data.api
import retrofit2.http.*
interface PadApi {
  @POST("api/devices/enroll") suspend fun enroll(@Body body: EnrollRequest): EnrollResponse
  @POST("api/reports") suspend fun report(@Body body: ReportRequest): ReportResponse
  @POST("api/checkouts") suspend fun checkout(@Body body: CheckoutRequest): CheckoutResponse
  @POST("api/checkouts/{id}/return") suspend fun returnDevice(@Path("id") id: Long): ReturnResponse
}
```
`data/api/ApiResult.kt`:
```kotlin
package com.wjtb.padtracker.data.api
import retrofit2.HttpException
sealed interface ApiResult<out T> {
  data class Ok<T>(val value: T) : ApiResult<T>
  data object Conflict : ApiResult<Nothing>
  data class Error(val cause: Throwable) : ApiResult<Nothing>
}
suspend fun <T> safeApiCall(block: suspend () -> T): ApiResult<T> = try {
  ApiResult.Ok(block())
} catch (e: HttpException) {
  if (e.code() == 409) ApiResult.Conflict else ApiResult.Error(e)
} catch (e: Exception) { ApiResult.Error(e) }
```
`data/api/AuthInterceptor.kt`:
```kotlin
package com.wjtb.padtracker.data.api
import okhttp3.Interceptor
import okhttp3.Response
class AuthInterceptor(private val tokenProvider: () -> String?) : Interceptor {
  override fun intercept(chain: Interceptor.Chain): Response {
    val token = tokenProvider()
    val req = if (token != null)
      chain.request().newBuilder().addHeader("Authorization", "Bearer $token").build()
    else chain.request()
    return chain.proceed(req)
  }
}
```
`data/api/ApiFactory.kt`:
```kotlin
package com.wjtb.padtracker.data.api
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
object ApiFactory {
  private val json = Json { ignoreUnknownKeys = true; explicitNulls = false }
  fun create(baseUrl: String, tokenProvider: () -> String?): PadApi {
    val client = OkHttpClient.Builder().addInterceptor(AuthInterceptor(tokenProvider)).build()
    return Retrofit.Builder()
      .baseUrl(baseUrl)
      .client(client)
      .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
      .build().create(PadApi::class.java)
  }
}
```

- [ ] **Step 4: 통과 + 커밋**

Run: `./gradlew :app:testDevDebugUnitTest --tests "*PadApiTest" --no-daemon` → PASS.
```bash
git add android-agent/app/src/main/java/com/wjtb/padtracker/data/api android-agent/app/src/test/java/com/wjtb/padtracker/data/api
git commit -m "feat(android): Retrofit PadApi + DTOs + auth interceptor + safeApiCall (MockWebServer tests)"
```

---

## Task 7: 오프라인 보고 큐 (Room) + flush 로직 (TDD, fake Dao)

**Files:**
- Create: `app/src/main/java/com/wjtb/padtracker/data/queue/ReportQueue.kt`(인터페이스), `QueuedReport.kt`, `RoomReportQueue.kt`(Room Dao/Entity/DB)
- Test: `app/src/test/java/com/wjtb/padtracker/data/queue/QueueFlushTest.kt` (FakeReportQueue 사용)

**Interfaces:**
- Produces: `ReportQueue`(interface: `suspend fun enqueue(ReportRequest)`, `suspend fun all(): List<QueuedReport>`, `suspend fun remove(id: Long)`), `QueuedReport(id, request)`, `RoomReportQueue`(Android 구현).
- Consumes: `ReportRequest`, `PadApi`.

- [ ] **Step 1: 실패 테스트 (fake 큐 + fake sender)**

```kotlin
package com.wjtb.padtracker.data.queue
import com.wjtb.padtracker.data.api.ReportRequest
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Test

class FakeReportQueue : ReportQueue {
  val items = mutableListOf<QueuedReport>(); private var seq = 1L
  override suspend fun enqueue(r: ReportRequest) { items.add(QueuedReport(seq++, r)) }
  override suspend fun all() = items.toList()
  override suspend fun remove(id: Long) { items.removeAll { it.id == id } }
}
class QueueFlushTest {
  @Test fun flush_sends_and_removes_on_success() = runTest {
    val q = FakeReportQueue(); q.enqueue(ReportRequest(batteryPct = 1)); q.enqueue(ReportRequest(batteryPct = 2))
    val sent = mutableListOf<ReportRequest>()
    flushQueue(q) { r -> sent.add(r); true } // sender returns success
    assertEquals(2, sent.size); assertTrue(q.all().isEmpty())
  }
  @Test fun flush_keeps_on_failure() = runTest {
    val q = FakeReportQueue(); q.enqueue(ReportRequest(batteryPct = 1))
    flushQueue(q) { false } // sender fails
    assertEquals(1, q.all().size) // retried next time
  }
}
```
Run → FAIL.

- [ ] **Step 2: ReportQueue 인터페이스 + QueuedReport + flushQueue(순수)**

`data/queue/ReportQueue.kt`:
```kotlin
package com.wjtb.padtracker.data.queue
import com.wjtb.padtracker.data.api.ReportRequest
data class QueuedReport(val id: Long, val request: ReportRequest)
interface ReportQueue {
  suspend fun enqueue(r: ReportRequest)
  suspend fun all(): List<QueuedReport>
  suspend fun remove(id: Long)
}
/** 큐의 각 보고를 sender로 전송, 성공분만 제거. 순수 오케스트레이션. */
suspend fun flushQueue(queue: ReportQueue, sender: suspend (ReportRequest) -> Boolean) {
  for (item in queue.all()) { if (sender(item.request)) queue.remove(item.id) }
}
```

- [ ] **Step 3: Room 구현 (RoomReportQueue)**

`data/queue/RoomReportQueue.kt`:
```kotlin
package com.wjtb.padtracker.data.queue
import androidx.room.*
import com.wjtb.padtracker.data.api.ReportRequest
import kotlinx.serialization.json.Json

@Entity(tableName = "report_queue")
data class ReportEntity(@PrimaryKey(autoGenerate = true) val id: Long = 0, val payloadJson: String)

@Dao interface ReportQueueDao {
  @Insert suspend fun insert(e: ReportEntity): Long
  @Query("SELECT * FROM report_queue ORDER BY id ASC") suspend fun all(): List<ReportEntity>
  @Query("DELETE FROM report_queue WHERE id = :id") suspend fun delete(id: Long)
}
@Database(entities = [ReportEntity::class], version = 1)
abstract class QueueDb : RoomDatabase() { abstract fun dao(): ReportQueueDao }

class RoomReportQueue(private val dao: ReportQueueDao) : ReportQueue {
  private val json = Json { explicitNulls = false }
  override suspend fun enqueue(r: ReportRequest) { dao.insert(ReportEntity(payloadJson = json.encodeToString(ReportRequest.serializer(), r))) }
  override suspend fun all(): List<QueuedReport> = dao.all().map { QueuedReport(it.id, json.decodeFromString(ReportRequest.serializer(), it.payloadJson)) }
  override suspend fun remove(id: Long) = dao.delete(id)
}
```

- [ ] **Step 4: 통과 + 컴파일 확인 + 커밋**

Run: `./gradlew :app:testDevDebugUnitTest --tests "*QueueFlushTest" --no-daemon` → PASS.
Run: `./gradlew :app:compileDevDebugKotlin --no-daemon` → SUCCESS(Room KSP 생성 확인).
```bash
git add android-agent/app/src/main/java/com/wjtb/padtracker/data/queue android-agent/app/src/test/java/com/wjtb/padtracker/data/queue
git commit -m "feat(android): offline report queue (Room) + pure flush logic"
```

---

## Task 8: DeviceStore(DataStore) 인터페이스 + PadRepository 오케스트레이션 (TDD, fakes)

**Files:**
- Create: `app/src/main/java/com/wjtb/padtracker/data/DeviceStore.kt`(인터페이스 + DataStore 구현), `app/src/main/java/com/wjtb/padtracker/data/PadRepository.kt`
- Test: `app/src/test/java/com/wjtb/padtracker/data/PadRepositoryTest.kt`

**Interfaces:**
- Produces: `DeviceStore`(interface: deviceToken get/set, currentCheckout get/set, baseUrl), `PadRepository`(공유 계약).
- Consumes: `PadApi`, `ReportQueue`, DTO, `ApiResult`, `ConsentInfo`, `CheckoutState`.

- [ ] **Step 1: 실패 테스트 (fake api/store/queue)**

```kotlin
package com.wjtb.padtracker.data
import com.wjtb.padtracker.data.api.*
import com.wjtb.padtracker.data.queue.*
import com.wjtb.padtracker.domain.*
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Test

class FakeStore : DeviceStore {
  var token: String? = null; var checkout: CheckoutState = CheckoutState.NotCheckedOut
  override suspend fun deviceToken() = token
  override suspend fun setDeviceToken(t: String?) { token = t }
  override suspend fun checkoutState() = checkout
  override suspend fun setCheckoutState(s: CheckoutState) { checkout = s }
  override suspend fun baseUrl() = "http://x/"
}
class PadRepositoryTest {
  private val store = FakeStore()
  private val queue = FakeReportQueue()
  private fun repo(api: PadApi) = PadRepository(api, store, queue)

  @Test fun enroll_persists_token() = runTest {
    val api = FakePadApi(enroll = { EnrollResponse(1, "A-1", "DTOK") })
    val res = repo(api).enroll("S1", null, null, null)
    assertTrue(res is ApiResult.Ok); assertEquals("DTOK", store.token)
  }
  @Test fun checkout_conflict_keeps_state() = runTest {
    val api = FakePadApi(checkout = { throw retrofit2.HttpException(retrofit2.Response.error<Any>(409, okhttp3.ResponseBody.create(null, "{}"))) })
    val res = repo(api).checkout(ConsentInfo("E100", "2026-07-12T00:00:00Z"))
    assertTrue(res is ApiResult.Conflict); assertEquals(CheckoutState.NotCheckedOut, store.checkout)
  }
  @Test fun checkout_ok_sets_state() = runTest {
    val api = FakePadApi(checkout = { CheckoutResponse(55, 7) })
    repo(api).checkout(ConsentInfo("E100", "2026-07-12T00:00:00Z"))
    assertEquals(CheckoutState.CheckedOut(55, "E100"), store.checkout)
  }
  @Test fun sendReport_queues_on_failure() = runTest {
    val api = FakePadApi(report = { throw RuntimeException("net") })
    val res = repo(api).sendReport(ReportSnapshot(null,null,null,null,null,50))
    assertTrue(res is ApiResult.Error); assertEquals(1, queue.items.size)
  }
}
```
> `FakePadApi`는 이 테스트 파일 내 helper로 정의(각 메서드를 람다로 위임). `FakeReportQueue`는 Task 7의 것을 test 소스셋에서 재사용(같은 패키지 아님 → 이 파일에 간단히 재정의하거나 test util로 이동).

Run → FAIL.

- [ ] **Step 2: DeviceStore 인터페이스 + PadRepository**

`data/DeviceStore.kt` (인터페이스 + DataStore 구현):
```kotlin
package com.wjtb.padtracker.data
import android.content.Context
import androidx.datastore.preferences.core.*
import androidx.datastore.preferences.preferencesDataStore
import com.wjtb.padtracker.domain.CheckoutState
import kotlinx.coroutines.flow.first

interface DeviceStore {
  suspend fun deviceToken(): String?
  suspend fun setDeviceToken(t: String?)
  suspend fun checkoutState(): CheckoutState
  suspend fun setCheckoutState(s: CheckoutState)
  suspend fun baseUrl(): String
}

private val Context.dataStore by preferencesDataStore(name = "pad")
class DataStoreDeviceStore(private val context: Context, private val defaultBaseUrl: String) : DeviceStore {
  private val TOKEN = stringPreferencesKey("device_token")
  private val CO_ID = longPreferencesKey("checkout_id")
  private val CO_EMP = stringPreferencesKey("checkout_emp")
  private val BASE = stringPreferencesKey("base_url")
  override suspend fun deviceToken() = context.dataStore.data.first()[TOKEN]
  override suspend fun setDeviceToken(t: String?) { context.dataStore.edit { if (t == null) it.remove(TOKEN) else it[TOKEN] = t } }
  override suspend fun checkoutState(): CheckoutState {
    val p = context.dataStore.data.first(); val id = p[CO_ID]; val emp = p[CO_EMP]
    return if (id != null && emp != null) CheckoutState.CheckedOut(id, emp) else CheckoutState.NotCheckedOut
  }
  override suspend fun setCheckoutState(s: CheckoutState) { context.dataStore.edit {
    when (s) { is CheckoutState.CheckedOut -> { it[CO_ID] = s.checkoutId; it[CO_EMP] = s.empNo }
      is CheckoutState.NotCheckedOut -> { it.remove(CO_ID); it.remove(CO_EMP) } } } }
  override suspend fun baseUrl() = context.dataStore.data.first()[BASE] ?: defaultBaseUrl
}
```
`data/PadRepository.kt`:
```kotlin
package com.wjtb.padtracker.data
import com.wjtb.padtracker.data.api.*
import com.wjtb.padtracker.data.queue.ReportQueue
import com.wjtb.padtracker.data.queue.flushQueue
import com.wjtb.padtracker.domain.*

class PadRepository(
  private val api: PadApi,
  private val store: DeviceStore,
  private val queue: ReportQueue,
  private val builder: ReportBuilder = ReportBuilder(),
) {
  suspend fun enroll(serial: String, model: String?, wifiMac: String?, fcmToken: String?): ApiResult<EnrollResponse> {
    val r = safeApiCall { api.enroll(EnrollRequest(serial, model, wifiMac, fcmToken)) }
    if (r is ApiResult.Ok) store.setDeviceToken(r.value.deviceToken)
    return r
  }
  suspend fun checkout(info: ConsentInfo): ApiResult<CheckoutResponse> {
    val r = safeApiCall { api.checkout(CheckoutRequest(info.empNo, info.consentAtIso)) }
    if (r is ApiResult.Ok) store.setCheckoutState(CheckoutState.CheckedOut(r.value.checkoutId, info.empNo))
    return r
  }
  suspend fun returnDevice(): ApiResult<ReturnResponse> {
    val cur = store.checkoutState()
    if (cur !is CheckoutState.CheckedOut) return ApiResult.Error(IllegalStateException("not checked out"))
    val r = safeApiCall { api.returnDevice(cur.checkoutId) }
    if (r is ApiResult.Ok) store.setCheckoutState(CheckoutState.NotCheckedOut)
    return r
  }
  suspend fun sendReport(snap: ReportSnapshot): ApiResult<ReportResponse> {
    val r = safeApiCall { api.report(builder.build(snap)) }
    if (r is ApiResult.Error) queue.enqueue(builder.build(snap))
    return r
  }
  suspend fun flushQueue() = flushQueue(queue) { req -> safeApiCall { api.report(req) } is ApiResult.Ok }
}
```

- [ ] **Step 3: 통과 + 커밋**

Run: `./gradlew :app:testDevDebugUnitTest --tests "*PadRepositoryTest" --no-daemon` → PASS.
```bash
git add android-agent/app/src/main/java/com/wjtb/padtracker/data/DeviceStore.kt android-agent/app/src/main/java/com/wjtb/padtracker/data/PadRepository.kt android-agent/app/src/test/java/com/wjtb/padtracker/data/PadRepositoryTest.kt
git commit -m "feat(android): DeviceStore + PadRepository orchestration (fakes-tested)"
```

---

## Task 9: 주기 보고 Worker + 부팅 리시버 (Android 글루, 빌드 검증)

**Files:**
- Create: `app/src/main/java/com/wjtb/padtracker/work/ReportWorker.kt`, `work/ReportScheduler.kt`, `work/BootReceiver.kt`, `app/src/main/java/com/wjtb/padtracker/work/SnapshotCollector.kt`
- Modify: `app/src/main/AndroidManifest.xml`(권한 + receiver)
- Test: `app/src/test/java/com/wjtb/padtracker/work/ReportSchedulerTest.kt`(순수 정책만; Worker 자체는 빌드로 검증)

**Interfaces:**
- Produces: `ReportWorker`(CoroutineWorker), `ReportScheduler.periodicRequest(): PeriodicWorkRequest`(간격 정책), `SnapshotCollector.collect(): ReportSnapshot`, `BootReceiver`.
- Consumes: `PadRepository`(AppContainer 경유), `ReportSnapshot`.

- [ ] **Step 1: 순수 정책 테스트 (간격 상수)**

`ReportSchedulerTest.kt`:
```kotlin
package com.wjtb.padtracker.work
import org.junit.Assert.assertEquals
import org.junit.Test
class ReportSchedulerTest {
  @Test fun interval_is_15_minutes() { assertEquals(15L, ReportScheduler.INTERVAL_MINUTES) }
}
```
Run → FAIL.

- [ ] **Step 2: ReportScheduler / SnapshotCollector / ReportWorker / BootReceiver**

`work/ReportScheduler.kt`:
```kotlin
package com.wjtb.padtracker.work
import androidx.work.*
import java.util.concurrent.TimeUnit
object ReportScheduler {
  const val INTERVAL_MINUTES = 15L
  const val WORK_NAME = "periodic_report"
  fun periodicRequest(): PeriodicWorkRequest =
    PeriodicWorkRequestBuilder<ReportWorker>(INTERVAL_MINUTES, TimeUnit.MINUTES)
      .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
      .build()
  fun schedule(wm: WorkManager) = wm.enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.KEEP, periodicRequest())
}
```
`work/SnapshotCollector.kt` (Android 프레임워크 접근; 실패해도 null 필드로 degrade):
```kotlin
package com.wjtb.padtracker.work
import android.content.Context
import android.net.wifi.WifiManager
import android.os.BatteryManager
import com.wjtb.padtracker.domain.ReportSnapshot
class SnapshotCollector(private val context: Context) {
  /** 위치는 P2에선 생략 가능(권한/Fused는 실기기 게이트) — battery/wifi만 수집, 실패 시 null */
  suspend fun collect(): ReportSnapshot {
    val battery = runCatching {
      (context.getSystemService(Context.BATTERY_SERVICE) as BatteryManager)
        .getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
    }.getOrNull()
    @Suppress("DEPRECATION")
    val info = runCatching { (context.getSystemService(Context.WIFI_SERVICE) as WifiManager).connectionInfo }.getOrNull()
    return ReportSnapshot(
      lat = null, lng = null, accuracyM = null,
      bssid = info?.bssid, ssid = info?.ssid?.trim('"'),
      batteryPct = battery,
    )
  }
}
```
`work/ReportWorker.kt`:
```kotlin
package com.wjtb.padtracker.work
import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.wjtb.padtracker.PadTrackerApp
class ReportWorker(appContext: Context, params: WorkerParameters) : CoroutineWorker(appContext, params) {
  override suspend fun doWork(): Result {
    val container = (applicationContext as PadTrackerApp).container
    return try {
      container.repository.flushQueue()
      container.repository.sendReport(SnapshotCollector(applicationContext).collect())
      Result.success()
    } catch (e: Exception) { Result.retry() }
  }
}
```
`work/BootReceiver.kt`:
```kotlin
package com.wjtb.padtracker.work
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.work.WorkManager
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action == Intent.ACTION_BOOT_COMPLETED) ReportScheduler.schedule(WorkManager.getInstance(context))
  }
}
```
Manifest에 권한/리시버 추가(`<application>` 내부 및 상단):
```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION"/>
<uses-permission android:name="android.permission.ACCESS_WIFI_STATE"/>
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED"/>
<uses-permission android:name="android.permission.FOREGROUND_SERVICE"/>
<!-- inside <application> -->
<receiver android:name=".work.BootReceiver" android:exported="true">
  <intent-filter><action android:name="android.intent.action.BOOT_COMPLETED"/></intent-filter>
</receiver>
```
> `AppContainer`에 `repository`가 있어야 한다(Task 13에서 정식 조립). 이 태스크에서 `AppContainer`가 아직 없으면 컴파일을 위해 최소 `AppContainer`(repository만) + `PadTrackerApp.container`를 임시로 추가하고, Task 13에서 완성한다.

- [ ] **Step 3: 통과 + 컴파일 + 커밋**

Run: `./gradlew :app:testDevDebugUnitTest --tests "*ReportSchedulerTest" --no-daemon` → PASS.
Run: `./gradlew :app:compileDevDebugKotlin --no-daemon` → SUCCESS.
```bash
git add android-agent/app/src/main/java/com/wjtb/padtracker/work android-agent/app/src/main/AndroidManifest.xml android-agent/app/src/test/java/com/wjtb/padtracker/work
git commit -m "feat(android): periodic ReportWorker + boot receiver + snapshot collector"
```

---

## Task 10: Push 서비스 + Mock + FirebaseMessagingService (글루, 빌드 검증)

**Files:**
- Create: `app/src/main/java/com/wjtb/padtracker/core/PushService.kt`, `app/src/main/java/com/wjtb/padtracker/push/PadMessagingService.kt`
- Create: `app/src/dev/java/com/wjtb/padtracker/core/MockPushService.kt`
- Test: `app/src/test/java/com/wjtb/padtracker/push/MessageRouterTest.kt` (순수 라우팅)

**Interfaces:**
- Produces: `PushService`(공유 계약), `MockPushService`, `PadMessagingService`, `MessageRouter.route(data): FcmCommand?`.
- Consumes: `FcmCommand`(Task 3).

- [ ] **Step 1: 순수 라우팅 테스트**

```kotlin
package com.wjtb.padtracker.push
import com.wjtb.padtracker.domain.FcmCommand
import org.junit.Assert.*
import org.junit.Test
class MessageRouterTest {
  @Test fun routes_ring() { assertEquals(FcmCommand.Ring, MessageRouter.route(mapOf("command" to "RING"))) }
  @Test fun routes_unknown_null() { assertNull(MessageRouter.route(mapOf("x" to "y"))) }
}
```
Run → FAIL.

- [ ] **Step 2: PushService + MockPushService + MessageRouter + PadMessagingService**

`core/PushService.kt`:
```kotlin
package com.wjtb.padtracker.core
interface PushService { suspend fun currentToken(): String? }
```
`app/src/dev/java/.../core/MockPushService.kt`:
```kotlin
package com.wjtb.padtracker.core
class MockPushService : PushService { override suspend fun currentToken(): String? = "dev-mock-token" }
```
`push/MessageRouter.kt` (파일은 PadMessagingService.kt와 같은 패키지에 둠):
```kotlin
package com.wjtb.padtracker.push
import com.wjtb.padtracker.domain.FcmCommand
object MessageRouter { fun route(data: Map<String, String>): FcmCommand? = FcmCommand.fromData(data) }
```
`push/PadMessagingService.kt`:
```kotlin
package com.wjtb.padtracker.push
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.wjtb.padtracker.domain.FcmCommand
import com.wjtb.padtracker.ui.ring.RingActivity
import android.content.Intent
class PadMessagingService : FirebaseMessagingService() {
  override fun onMessageReceived(message: RemoteMessage) {
    when (MessageRouter.route(message.data)) {
      FcmCommand.Ring -> startActivity(Intent(this, RingActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      FcmCommand.LocateNow -> { /* 즉시 1회 보고: WorkManager one-time enqueue (Task 13에서 컨테이너 경유) */ }
      null -> {}
    }
  }
  override fun onNewToken(token: String) { /* Task 13: 저장/서버 재등록 훅 */ }
}
```
Manifest `<application>`에 서비스 등록:
```xml
<service android:name=".push.PadMessagingService" android:exported="false">
  <intent-filter><action android:name="com.google.firebase.MESSAGING_EVENT"/></intent-filter>
</service>
```
> `RingActivity`는 Task 12에서 생성. 이 태스크가 먼저면 컴파일을 위해 Task 12를 먼저 하거나, 임시 빈 `RingActivity`를 두고 Task 12에서 채운다. **권장: Task 12를 이 태스크보다 먼저 수행하도록 순서 조정** — 아래 순서는 12→10을 허용한다(둘 다 UI/글루).

- [ ] **Step 3: 통과 + 컴파일 + 커밋**

Run: `./gradlew :app:testDevDebugUnitTest --tests "*MessageRouterTest" --no-daemon` → PASS.
Run: `./gradlew :app:compileDevDebugKotlin --no-daemon` → SUCCESS.
```bash
git add android-agent/app/src/main/java/com/wjtb/padtracker/core/PushService.kt android-agent/app/src/main/java/com/wjtb/padtracker/push android-agent/app/src/dev/java/com/wjtb/padtracker/core/MockPushService.kt android-agent/app/src/main/AndroidManifest.xml android-agent/app/src/test/java/com/wjtb/padtracker/push
git commit -m "feat(android): PushService abstraction + MockPushService + FCM messaging service"
```

---

## Task 11: 화면 ViewModel 로직 (TDD) — Enrollment/Checkout/Home

**Files:**
- Create: `app/src/main/java/com/wjtb/padtracker/ui/enrollment/EnrollmentViewModel.kt`, `ui/checkout/CheckoutViewModel.kt`, `ui/home/HomeViewModel.kt`, `ui/UiState.kt`, `app/src/main/java/com/wjtb/padtracker/util/Clock.kt`
- Test: `app/src/test/java/com/wjtb/padtracker/ui/EnrollmentViewModelTest.kt`, `CheckoutViewModelTest.kt`

**Interfaces:**
- Produces: ViewModel들 + `UiState`(Idle/Loading/Success/Error/Conflict), `Clock`(nowIso 주입).
- Consumes: `PadRepository`, `DeviceControl`, `ConsentInfo`, `ApiResult`.

- [ ] **Step 1: 실패 테스트 (coroutines-test + Turbine)**

`CheckoutViewModelTest.kt`:
```kotlin
package com.wjtb.padtracker.ui
import app.cash.turbine.test
import com.wjtb.padtracker.data.PadRepository
import com.wjtb.padtracker.data.api.*
import com.wjtb.padtracker.domain.ConsentInfo
import com.wjtb.padtracker.ui.checkout.CheckoutViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.*
import org.junit.*
import org.junit.Assert.*

@OptIn(ExperimentalCoroutinesApi::class)
class CheckoutViewModelTest {
  @Before fun setUp() { Dispatchers.setMain(StandardTestDispatcher()) }
  @After fun tearDown() { Dispatchers.resetMain() }

  private fun vm(result: ApiResult<CheckoutResponse>): CheckoutViewModel {
    val repo = object { suspend fun checkout(i: ConsentInfo) = result } // see note
    // 실제로는 PadRepository를 fake 하거나 인터페이스로 추상화. 아래 Step 2에서 CheckoutViewModel이
    // 필요한 최소 인터페이스(Checkoutable)를 받도록 설계한다.
    TODO("replaced by Step 2 design")
  }
}
```
> **설계 노트(중요)**: ViewModel을 테스트 가능하게 하려면 `PadRepository`의 구체 클래스 대신 **좁은 인터페이스**(`interface Checkoutable { suspend fun checkout(i: ConsentInfo): ApiResult<CheckoutResponse> }` 등)를 주입받게 한다. `PadRepository`가 이 인터페이스들을 구현하도록 한다. Step 2에서 실제 테스트를 이 방식으로 작성한다.

실제 실패 테스트(Step 2 설계 반영):
```kotlin
@Test fun conflict_sets_conflict_state() = runTest {
  val vm = CheckoutViewModel(checkoutable = { ApiResult.Conflict }, clock = { "2026-07-12T00:00:00Z" })
  vm.uiState.test {
    assertEquals(UiState.Idle, awaitItem())
    vm.submit("E100")
    assertEquals(UiState.Loading, awaitItem())
    assertEquals(UiState.Conflict, awaitItem())
  }
}
@Test fun ok_sets_success() = runTest {
  val vm = CheckoutViewModel(checkoutable = { ApiResult.Ok(CheckoutResponse(1, 2)) }, clock = { "2026-07-12T00:00:00Z" })
  vm.uiState.test { awaitItem(); vm.submit("E100"); awaitItem(); assertEquals(UiState.Success, awaitItem()) }
}
```
Run → FAIL.

- [ ] **Step 2: UiState + Clock + CheckoutViewModel (+ Enrollment/Home)**

`ui/UiState.kt`:
```kotlin
package com.wjtb.padtracker.ui
sealed interface UiState { data object Idle: UiState; data object Loading: UiState
  data object Success: UiState; data object Conflict: UiState; data class Error(val msg: String): UiState }
```
`util/Clock.kt`:
```kotlin
package com.wjtb.padtracker.util
fun interface Clock { fun nowIso(): String }
```
`ui/checkout/CheckoutViewModel.kt`:
```kotlin
package com.wjtb.padtracker.ui.checkout
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.wjtb.padtracker.data.api.ApiResult
import com.wjtb.padtracker.data.api.CheckoutResponse
import com.wjtb.padtracker.domain.ConsentInfo
import com.wjtb.padtracker.ui.UiState
import com.wjtb.padtracker.util.Clock
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

fun interface Checkoutable { suspend fun checkout(info: ConsentInfo): ApiResult<CheckoutResponse> }

class CheckoutViewModel(private val checkoutable: Checkoutable, private val clock: Clock) : ViewModel() {
  private val _uiState = MutableStateFlow<UiState>(UiState.Idle)
  val uiState: StateFlow<UiState> = _uiState.asStateFlow()
  fun submit(empNo: String) {
    _uiState.value = UiState.Loading
    viewModelScope.launch {
      _uiState.value = when (checkoutable.checkout(ConsentInfo(empNo, clock.nowIso()))) {
        is ApiResult.Ok -> UiState.Success
        is ApiResult.Conflict -> UiState.Conflict
        is ApiResult.Error -> UiState.Error("네트워크 오류")
      }
    }
  }
}
```
`PadRepository`가 `Checkoutable`(및 유사 인터페이스 `Enrollable`)를 구현하도록 `PadRepository`에 인터페이스 선언 추가(메서드 시그니처는 기존과 동일하므로 `: Checkoutable`만 추가). Enrollment/Home ViewModel도 동일 패턴(각각 `Enrollable`, 상태 조회)으로 작성 — Enrollment는 `DeviceControl.activateLicense()`+`readSerial()`+`enroll(...)` 시퀀스를 호출하고 UiState를 방출. Home은 `DeviceStore.checkoutState()`를 노출.

`EnrollmentViewModelTest.kt`: MockDeviceControl + fake Enrollable로 온보딩 성공 시 Success, enroll 실패 시 Error 검증.

- [ ] **Step 3: 통과 + 커밋**

Run: `./gradlew :app:testDevDebugUnitTest --tests "*ViewModelTest" --no-daemon` → PASS.
```bash
git add android-agent/app/src/main/java/com/wjtb/padtracker/ui android-agent/app/src/main/java/com/wjtb/padtracker/util android-agent/app/src/main/java/com/wjtb/padtracker/data/PadRepository.kt android-agent/app/src/test/java/com/wjtb/padtracker/ui
git commit -m "feat(android): enrollment/checkout/home ViewModels (interface-injected, tested)"
```

---

## Task 12: Compose 화면 + RingActivity + RingController (글루, 빌드 검증)

**Files:**
- Create: `app/src/main/java/com/wjtb/padtracker/ui/MainActivity.kt`, `ui/enrollment/EnrollmentScreen.kt`, `ui/checkout/CheckoutScreen.kt`, `ui/home/HomeScreen.kt`, `ui/theme/Theme.kt`
- Create: `app/src/main/java/com/wjtb/padtracker/ui/ring/RingActivity.kt`, `ui/ring/RingController.kt`
- Test: `app/src/test/java/com/wjtb/padtracker/ui/ring/RingControllerTest.kt`(순수 상태)

**Interfaces:**
- Produces: `MainActivity`(Compose host + 화면 네비게이션), 각 `*Screen` composable, `RingActivity`(전체화면), `RingController`(음량/재생 정책, 테스트 가능한 부분 분리).
- Consumes: ViewModel들, `AudioManager`(RingActivity에서만).

- [ ] **Step 1: RingController 순수 상태 테스트**

`RingControllerTest.kt`:
```kotlin
package com.wjtb.padtracker.ui.ring
import org.junit.Assert.*
import org.junit.Test
class RingControllerTest {
  @Test fun starts_stopped_then_ringing_then_stopped() {
    val c = RingController()
    assertFalse(c.isRinging)
    c.start(); assertTrue(c.isRinging)
    c.stop(); assertFalse(c.isRinging)
  }
}
```
Run → FAIL.

- [ ] **Step 2: RingController(순수) + RingActivity + 화면들 + MainActivity + Theme**

`ui/ring/RingController.kt` (순수 상태 홀더 — 실제 오디오는 RingActivity가 콜백으로 처리):
```kotlin
package com.wjtb.padtracker.ui.ring
class RingController(
  private val onStart: () -> Unit = {},
  private val onStop: () -> Unit = {},
) {
  var isRinging = false; private set
  fun start() { if (!isRinging) { isRinging = true; onStart() } }
  fun stop() { if (isRinging) { isRinging = false; onStop() } }
}
```
`ui/ring/RingActivity.kt`: 전체화면 Compose Activity. `AudioManager`로 STREAM_ALARM 최대음량 설정 + `RingtoneManager` 알람 반복 재생을 `RingController(onStart/onStop)`에 연결. lock-screen 위에 표시(`setShowWhenLocked(true)`, `setTurnScreenOn(true)`), 소유자 안내 텍스트 + 중지 버튼. 인텐트 extra로 부서/이름/내선 수신.
`ui/MainActivity.kt`: `setContent { PadTrackerTheme { AppNav() } }` — 온보딩 여부(DeviceStore 토큰 유무)에 따라 Enrollment 또는 Home 표시, 체크아웃 화면 이동. 각 화면은 해당 ViewModel을 `AppContainer`에서 생성해 주입(간단한 factory 또는 `viewModel { }`).
`ui/theme/Theme.kt`: 기본 Material3 테마 래퍼 `PadTrackerTheme`.
각 `*Screen.kt`: 최소 Compose UI(입력 필드, 버튼, 상태 표시). 스타일보다 흐름 우선.

- [ ] **Step 3: 통과 + 컴파일 + 커밋**

Run: `./gradlew :app:testDevDebugUnitTest --tests "*RingControllerTest" --no-daemon` → PASS.
Run: `./gradlew :app:compileDevDebugKotlin --no-daemon` → SUCCESS.
```bash
git add android-agent/app/src/main/java/com/wjtb/padtracker/ui android-agent/app/src/test/java/com/wjtb/padtracker/ui/ring
git commit -m "feat(android): compose screens + full-screen RingActivity + RingController"
```

---

## Task 13: AppContainer 조립 + Application + 온보딩 스케줄 배선 (글루, 빌드)

**Files:**
- Modify: `app/src/main/java/com/wjtb/padtracker/AppContainer.kt`, `PadTrackerApp.kt`
- Create: `app/src/dev/java/com/wjtb/padtracker/DevBindings.kt` (dev 플레이버: MockDeviceControl/MockPushService 제공)
- Create: `app/src/knox/java/com/wjtb/padtracker/KnoxBindings.kt` (knox: KnoxDeviceControl 제공 스텁)
- Test: 없음(빌드 검증). 필요 시 `AppContainerWiringTest`(로보렉트릭 없이 불가하면 생략).

**Interfaces:**
- Produces: `AppContainer`(repository, deviceControl, pushService, workmanager 접근), `PadTrackerApp.container`. 플레이버별 바인딩 함수 `provideDeviceControl(context)`, `providePushService()`.
- Consumes: 앞선 모든 컴포넌트.

- [ ] **Step 1: AppContainer 완성**

`AppContainer.kt`:
```kotlin
package com.wjtb.padtracker
import android.content.Context
import androidx.room.Room
import com.wjtb.padtracker.core.DeviceControl
import com.wjtb.padtracker.core.PushService
import com.wjtb.padtracker.data.*
import com.wjtb.padtracker.data.api.ApiFactory
import com.wjtb.padtracker.data.queue.*
class AppContainer(context: Context) {
  private val defaultBaseUrl = "http://10.0.2.2:3000/"
  val store: DeviceStore = DataStoreDeviceStore(context, defaultBaseUrl)
  private val db = Room.databaseBuilder(context, QueueDb::class.java, "pad-queue.db").build()
  private val queue: ReportQueue = RoomReportQueue(db.dao())
  // baseUrl은 초기 default 사용(런타임 변경은 후속). 토큰은 blocking-free하게 인터셉터에서 조회.
  private val api = ApiFactory.create(defaultBaseUrl, tokenProvider = { runBlockingToken() })
  val repository = PadRepository(api, store, queue)
  val deviceControl: DeviceControl = provideDeviceControl(context) // 플레이버 바인딩
  val pushService: PushService = providePushService()               // 플레이버 바인딩
  private fun runBlockingToken(): String? =
    kotlinx.coroutines.runBlocking { store.deviceToken() }
}
```
`PadTrackerApp.kt`:
```kotlin
package com.wjtb.padtracker
import android.app.Application
class PadTrackerApp : Application() {
  lateinit var container: AppContainer; private set
  override fun onCreate() { super.onCreate(); container = AppContainer(this) }
}
```
플레이버 바인딩(선언은 main에서 `expect`-유사하게 최상위 함수 참조):
- `app/src/dev/java/.../DevBindings.kt`:
```kotlin
package com.wjtb.padtracker
import android.content.Context
import android.provider.Settings
import com.wjtb.padtracker.core.*
fun provideDeviceControl(context: Context): DeviceControl =
  MockDeviceControl(Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID) ?: "unknown")
fun providePushService(): PushService = MockPushService()
```
- `app/src/knox/java/.../KnoxBindings.kt`:
```kotlin
package com.wjtb.padtracker
import android.content.Context
import com.wjtb.padtracker.core.*
fun provideDeviceControl(context: Context): DeviceControl = KnoxDeviceControl()
fun providePushService(): PushService = object : PushService { override suspend fun currentToken(): String? = null }
```
> main의 `AppContainer`가 `provideDeviceControl`/`providePushService`를 호출하지만 정의는 각 플레이버 소스셋에 있다(dev/knox). 두 플레이버 모두 컴파일된다.

- [ ] **Step 2: 두 플레이버 빌드 확인 + 커밋**

Run: `./gradlew :app:assembleDevDebug :app:compileKnoxDebugKotlin --no-daemon` → 둘 다 SUCCESS.
```bash
git add android-agent/app/src/main/java/com/wjtb/padtracker/AppContainer.kt android-agent/app/src/main/java/com/wjtb/padtracker/PadTrackerApp.kt android-agent/app/src/dev/java/com/wjtb/padtracker/DevBindings.kt android-agent/app/src/knox/java/com/wjtb/padtracker/KnoxBindings.kt
git commit -m "feat(android): AppContainer DI wiring + flavor bindings (dev Mock / knox stub)"
```

---

## Task 14: 수동 검증 체크리스트 + DoD 최종 확인

**Files:**
- Create: `docs/p2-emulator-checklist.md`
- Test: 전체 dev 유닛 스위트 + assembleDevDebug

- [ ] **Step 1: docs/p2-emulator-checklist.md 작성**

에뮬레이터 E2E + 실 FCM 수동 검증 절차:
- AVD 생성(시스템 이미지 API 34), P1 서버 `10.0.2.2:3000` 기동, `assembleDevDebug` 설치.
- 온보딩→enroll 서버 등록 확인, 사번 체크아웃+동의, 15분(또는 강제 실행) 보고가 서버 reports에 도달, 반납.
- 실 FCM: `google-services.json` 배치 후 대시보드(P3)나 서버 `/ring`으로 RING 전송 → RingActivity 표시·알람 확인.
- Knox 경로는 P4(별도 `docs/knox-device-test.md`).

- [ ] **Step 2: DoD 최종 검증**

Run: `./gradlew clean :app:testDevDebugUnitTest :app:assembleDevDebug --no-daemon`
Expected: 전체 유닛테스트 그린 + `app-dev-debug.apk` 생성. 커버리지 확인: FcmCommand, CheckoutStateMachine, ReportBuilder, PadApi 계약(enroll/bearer/409), 큐 flush, PadRepository(enroll/checkout/conflict/report-queue), ViewModel(conflict/success), RingController.

- [ ] **Step 3: 최종 커밋**

```bash
git add docs/p2-emulator-checklist.md
git commit -m "docs(android): P2 emulator + real-FCM manual verification checklist; P2 DoD"
```

---

## Self-Review (스펙 대비 커버리지)

| 스펙 §6 흐름 | 태스크 |
|---|---|
| 온보딩(activateLicense·삭제방지·권한무음·readSerial·enroll) | 2(Mock), 11(VM), 13(배선) |
| 체크아웃 + 위치정보 동의 | 4(상태), 8(repo), 11(VM), 12(화면) |
| 주기 보고(WorkManager·큐·부팅) | 5(매핑), 7(큐), 9(Worker/Boot) |
| 벨울리기(RING/LOCATE_NOW·전체화면) | 3(파싱), 10(FCM), 12(RingActivity) |
| 반납 | 8(repo returnDevice), 11/12 |

| 스펙 §8 필수 테스트 | 태스크 |
|---|---|
| 체크아웃 상태머신 | 4 |
| ReportBuilder 매핑 | 5 |
| 오프라인 큐잉·재시도 | 7 |
| MockDeviceControl 온보딩 | 2 |
| FcmCommand 파싱 | 3, 10 |
| API 계약(enroll/Bearer/409) | 6 |
| PadRepository 오케스트레이션 | 8 |

| 스펙 제약 | 태스크 |
|---|---|
| dev/knox 플레이버, assembleDevDebug | 1, 13 |
| FCM 키 없이 빌드(조건부 플러그인) | 1 |
| Mock 격리 | 2, 10, 13 |
| 시크릿 gitignore | 1 |

**미해결/주의:**
- **태스크 순서 의존**: Task 10(PadMessagingService)이 `RingActivity`(Task 12)를 참조 → **실행 순서는 …→11→12→10→13**을 권장(12를 10보다 먼저). Task 9는 `AppContainer.repository`(Task 13 완성)를 참조하므로, Task 9 시점에 최소 컨테이너 스텁을 두고 Task 13에서 완성.
- 위치(Fused) 실수집은 실기기/권한 게이트 → P2 SnapshotCollector는 battery/wifi만, lat/lng=null(체크리스트로 실기기 검증).
- 실 FCM 발송/수신·에뮬레이터 E2E·Knox 실구현은 사람/키/P4 게이트.
- 빌드 시간: 각 Gradle 태스크에 긴 타임아웃 사용.
