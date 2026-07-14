# P4 Knox — Real-Device Manual Verification Checklist

`KnoxDeviceControl` (`android-agent/app/src/knox/java/com/wjtb/padtracker/core/KnoxDeviceControl.kt`)
calls real Samsung Knox SDK framework APIs (`EnterpriseDeviceManager`, `KnoxEnterpriseLicenseManager`,
`ApplicationPolicy`) that only exist on a real Samsung device with an active Knox license — they
cannot run in a JVM unit test or on a non-Samsung emulator. This is the manual counterpart to
`docs/p2-emulator-checklist.md` (which covers everything reachable via the `dev` flavor + emulator).

Run this after `cd android-agent && ./gradlew clean :app:assembleKnoxDebug :app:assembleDevDebug
:app:testDevDebugUnitTest --no-daemon` is green (all three targets — see the repo's P4 task log for
the latest run).

---

## 0. Known gaps found while authoring this checklist (read first)

1. **Only `activateLicense()` and `readSerial()` are wired into the app's UI flow**
   (`EnrollmentViewModel.enroll()`, called from `EnrollmentScreen`). `lockUninstall()`,
   `grantPermissionsSilently()`, and `disableMacRandomization()` are **not called from anywhere in
   `main`** — no screen, no worker invokes them. This is intentional scope-out per the P4 task brief
   ("Device Admin 프롬프트의 온보딩 UI 실배선은 범위 밖"). Steps ③④⑦ below therefore use the Android
   Studio debugger's **Evaluate Expression** (attached to a running `knoxDebug` process) to invoke
   these methods directly on the live `KnoxDeviceControl` instance — no source changes needed, nothing
   to accidentally commit.
2. **`DeviceAdminHelper.adminActivationIntent()` is defined but never `startActivity()`'d anywhere.**
   `activateLicense()` only *checks* `isAdminActive()` and fails fast if it's false — it doesn't
   prompt. Step ① below covers both ways to actually flip Device Admin on: the real
   `ACTION_ADD_DEVICE_ADMIN` prompt (via debugger, launching the intent from `DeviceAdminHelper`) and
   the plain Settings path (functionally equivalent, no code path needed).
3. **`KnoxDeviceControl` cannot be JVM-unit-tested** — every method touches `EnterpriseDeviceManager` /
   `KnoxEnterpriseLicenseManager`, which are framework services with no Robolectric/mock coverage in
   this project. Compile-time correctness is verified by `assembleKnoxDebug` against the real
   `knoxsdk.jar`; *behavioral* correctness is only checkable by this checklist. This is an inherent
   Knox SDK constraint, not a test-coverage gap to fix.

---

## 1. Prerequisites

- **Knox partner account** — register at the Samsung Knox partner portal (free) if you don't already
  have one for this org.
- **KPE (Knox Platform for Enterprise) license key** — free developer/evaluation key, issued per
  package name (`com.wjtb.padtracker`) from the Knox partner portal. Production rental-fleet keys are
  a separate, paid SKU; the dev key is sufficient for this checklist.
- **A Samsung real device** — Knox APIs no-op or throw on non-Samsung hardware and on emulators.
  Prefer the same model as the rental pads if one is available; otherwise any Knox-capable Samsung
  device (Galaxy Tab A/S series, API 26+) will exercise the same code paths.
- `android-agent/local.properties` (repo root's `.gitignore` already excludes this file):
  ```properties
  KPE_LICENSE_KEY=<issued key from the partner portal>
  ```
- `android-agent/app/libs/knoxsdk.jar` — the restricted Knox SDK jar, placed locally (also
  gitignored: see the `# === Knox SDK 애드온 ===` block in the root `.gitignore`). Do not commit it.
- `adb` on `PATH`, device in Developer Mode with USB debugging enabled.

---

## 2. Build & install

```bash
cd android-agent
./gradlew :app:assembleKnoxDebug --no-daemon
adb install -r app/build/outputs/apk/knox/debug/app-knox-debug.apk
adb shell am start -n com.wjtb.padtracker/.ui.MainActivity
```

If you need a debugger attached for steps ③④⑦ (Evaluate Expression), instead launch/attach via
Android Studio: **Run → Attach Debugger to Android Process** with the `knoxDebug` build variant
selected, or `Run ▸ Debug 'app'` with the `knoxDebug` variant active. Set a breakpoint anywhere after
`(application as PadTrackerApp).container` is constructed in `MainActivity.onCreate` (e.g. inside
`AppNav`), then use **Evaluate Expression** to call
`container.deviceControl.lockUninstall()` etc. `container.deviceControl` is a `KnoxDeviceControl` on
this flavor (see `KnoxBindings.kt`), so casting is not required.

---

## 3. Checklist

### ① Device Admin activation

- **Steps**: Fresh install, before any enroll attempt. Either:
  - (a) Settings path: Settings → Security/Biometrics → **기기 관리자 앱** (Device admin apps) →
    PadTracker → **활성화**; or
  - (b) Real prompt path (exercises the actual intent the code builds): attach debugger per §2, then
    Evaluate Expression `startActivity(com.wjtb.padtracker.admin.DeviceAdminHelper.INSTANCE
    .adminActivationIntent(this))` from an Activity context — the system prompt should show the
    explanation text from `DeviceAdminHelper.adminActivationIntent`'s `EXTRA_ADD_EXPLANATION`
    ("패드 위치추적 에이전트가 기기 관리 정책(앱 삭제 방지 등)을 적용하려면 기기 관리자 권한이 필요합니다.") and the
    `force-lock` policy from `res/xml/device_admin.xml`. Tap **활성화**.
- **PASS**: `adb shell dumpsys device_policy | grep -i padtracker` shows the admin registered, **and**
  Evaluate Expression `com.wjtb.padtracker.admin.DeviceAdminHelper.INSTANCE.isAdminActive(context)`
  (or simply re-running the enroll flow in step ②) returns `true`.

### ② License activation

- **Steps**: With Device Admin active (①) and `KPE_LICENSE_KEY` baked into the build (§1), run the
  normal enroll flow from `EnrollmentScreen` (**등록 시작**) — this calls
  `KnoxDeviceControl.activateLicense()`.
- **PASS**: `adb logcat | grep -i "KNOX_LICENSE\|KnoxDeviceControl"` shows the
  `com.samsung.android.knox.intent.action.KNOX_LICENSE_STATUS` broadcast with
  `EXTRA_LICENSE_ERROR_CODE == 0` (`ERROR_NONE`), and the Enrollment screen proceeds past the license
  step (does not show "라이선스 활성화 실패") — `activateLicense()` returned `Result.success(Unit)`.
- If it fails, see the error-code table in §4 before retrying.

### ③ `lockUninstall()` blocks app removal

- **Steps**: Attach debugger per §2. Evaluate Expression: `container.deviceControl.lockUninstall()`.
  Confirm it returns `true` (no exception logged as `"lockUninstall failed"` in Logcat under tag
  `KnoxDeviceControl`). Then go to Settings → Apps → PadTracker → **제거(Uninstall)**.
- **PASS**: The uninstall action is blocked/greyed out or fails with a Knox-policy error toast — the
  app is still installed after the attempt (`adb shell pm list packages | grep padtracker` still
  lists it). Optionally confirm programmatically via Evaluate Expression:
  `com.samsung.android.knox.EnterpriseDeviceManager.getInstance(context).applicationPolicy
  .getApplicationUninstallationEnabled("com.wjtb.padtracker")` → `false`.

### ④ `grantPermissionsSilently()` — silent runtime grant

- **Steps**: Revoke the target permissions first so the grant is observable: `adb shell pm revoke
  com.wjtb.padtracker android.permission.ACCESS_FINE_LOCATION` (repeat per permission). Attach
  debugger per §2. Evaluate Expression:
  `container.deviceControl.grantPermissionsSilently(java.util.List.of("android.permission
  .ACCESS_FINE_LOCATION", "android.permission.READ_PHONE_STATE"))`.
- **PASS**: Returns `true`, **no system permission dialog appears on-device**, and
  `adb shell dumpsys package com.wjtb.padtracker | grep -A2 ACCESS_FINE_LOCATION` shows `granted=true`
  immediately after the call. (Internally this maps to
  `ApplicationPolicy.applyRuntimePermissions(..., PERMISSION_POLICY_STATE_GRANT)` returning
  `ApplicationPolicy.ERROR_NONE (0)`.)

### ⑤ `readSerial()` → server enroll

- **Steps**: Part of the same enroll flow as ② — `EnrollmentViewModel.enroll()` calls `readSerial()`
  right after a successful `activateLicense()` and passes the result to `Enrollable.enroll(serial,
  ...)`.
- **PASS**: Enrollment screen shows **"등록이 완료되었습니다."** (not "기기 시리얼을 읽을 수 없습니다"), and the
  server's device row reflects a real hardware serial (not an emulator's Android ID, not null):
  ```bash
  curl -s http://<server>/api/admin/devices -H "Authorization: Bearer <ADMIN_JWT>" | jq
  ```
  Confirm `serial` matches `adb shell getprop ro.serialno` (or `adb devices -l`) for this device.
  Note: `Build.getSerial()` requires `READ_PHONE_STATE` (declared in the knox manifest) to be granted
  at the OS level — if it returns `null` unexpectedly, check `adb shell dumpsys package
  com.wjtb.padtracker | grep READ_PHONE_STATE` for grant state first (grant it via step ④ or Settings
  before retrying).

### ⑥ Reboot → `BootReceiver` → report reaches the server

- **Steps**: With the device already enrolled (②⑤ done), reboot the device (`adb reboot`, then wait
  for it to fully boot and unlock).
- **PASS**: After boot completes, confirm the periodic job was (re-)scheduled:
  ```bash
  adb shell dumpsys jobscheduler | grep -A3 "com.wjtb.padtracker"
  ```
  then force it to run immediately instead of waiting the full interval:
  ```bash
  adb shell cmd jobscheduler run -f com.wjtb.padtracker <job-id>
  ```
  Confirm a report lands on the server within 15 minutes (or immediately after the forced run):
  ```bash
  curl -s "http://<server>/api/admin/devices/<deviceId>" \
    -H "Authorization: Bearer <ADMIN_JWT>" | jq '.recentReports[0]'
  ```
  Non-null `batteryPct` and a recent timestamp = PASS. (Same mechanism as
  `docs/p2-emulator-checklist.md` §3.5, but here the trigger is a *real* reboot broadcast instead of
  an `am broadcast` simulation.)

### ⑦ MAC address pinning — **not supported by this Knox SDK version, handled outside the app**

- `KnoxDeviceControl.disableMacRandomization()` is a documented no-op (returns `false`, logs a
  warning) — this Knox SDK (API level 28, 2019 vintage jar) has no `WifiPolicy` MAC-randomization
  toggle. This is expected; do not treat the `false` return as a bug.
- **Actual procedure (app-external, admin-side)**: disable MAC randomization for this device's
  corporate Wi-Fi profile via a **Knox Service Plugin (KSP)** profile, pushed from the Knox admin
  console (e.g. Knox Manage), *not* from the app. Configure the KSP Wi-Fi profile for the target SSID
  with MAC-randomization disabled so the device presents its factory/real MAC to the corporate AP
  (ref: 정의서 §9, KBA-358).
- **PASS** (verified outside the app, on the AP/controller side): after the KSP profile is pushed and
  the device reconnects to the corporate SSID, the AP/controller's client table shows the device's
  real (non-randomized) MAC — compare against `adb shell cmd wifi status` or
  Settings → About → Status → Wi-Fi MAC address. Randomized MACs on Android rotate per-SSID/per-connect
  and look like locally-administered addresses (second hex digit `2`, `6`, `a`, or `e`); a pinned real
  MAC should match the device's factory MAC consistently across reconnects.

---

## 4. Troubleshooting — license activation error codes

From `com.samsung.android.knox.license.KnoxEnterpriseLicenseManager` (delivered via
`EXTRA_LICENSE_ERROR_CODE` on the `ACTION_LICENSE_STATUS` broadcast that `activateLicense()` awaits):

| Code | Constant | Likely cause / fix |
|---|---|---|
| 0 | `ERROR_NONE` | Success. |
| 101 | `ERROR_NULL_PARAMS` | Empty/blank `KPE_LICENSE_KEY` — check `local.properties`. |
| 102 | `ERROR_UNKNOWN` | Unclassified failure — check logcat around the call for a stack trace. |
| 201 | `ERROR_INVALID_LICENSE` | Key is malformed/wrong, or issued for a different package. Re-copy from the partner portal. |
| 203 | `ERROR_LICENSE_TERMINATED` | Key was revoked/terminated in the partner portal — issue a new one. |
| 204 | `ERROR_INVALID_PACKAGE_NAME` | Key was issued for a package name other than `com.wjtb.padtracker` — confirm `applicationId` and the key match exactly. |
| 205 | `ERROR_NOT_CURRENT_DATE` | Device date/time is wrong, or the key's validity window hasn't started/has ended — check device clock and key expiry. |
| 208 | `ERROR_INVALID_BINDING` | Device/account binding mismatch — re-activate on the correct partner account. |
| 301 | `ERROR_INTERNAL` | Internal SDK error (also what `KnoxDeviceControl` returns locally if `activateLicense()` throws) — retry, check logcat. |
| 401 | `ERROR_INTERNAL_SERVER` | Samsung license server error — retry later. |
| 501 | `ERROR_NETWORK_DISCONNECTED` | Device has no network — license activation requires connectivity even for KPE. Connect Wi-Fi/data and retry. |
| 502 | `ERROR_NETWORK_GENERAL` | Transient network error contacting the license server — retry. |
| 601 | `ERROR_USER_DISAGREES_LICENSE_AGREEMENT` | User declined the Knox license agreement dialog — must accept to proceed. |
| 700 | `ERROR_LICENSE_DEACTIVATED` | Key was deactivated (e.g. moved to another device) — reactivate from the portal. |
| 701 | `ERROR_LICENSE_EXPIRED` | Dev/eval key's validity period ended — issue a new key. |
| 702 | `ERROR_LICENSE_QUANTITY_EXHAUSTED` | All seats for this key are in use — free a seat or request more quantity. |
| 703 | `ERROR_LICENSE_ACTIVATION_NOT_FOUND` | No matching activation record found (deactivated elsewhere first) — reactivate. |
| 704 | `ERROR_LICENSE_QUANTITY_EXHAUSTED_ON_AUTO_RELEASE` | Seat exhausted even after auto-release cleanup — same fix as 702. |

`KnoxDeviceControl.activateLicense()` also returns `Result.failure` locally (not one of the codes
above) if:
- Device Admin isn't active yet → fix via step ① first.
- `KPE_LICENSE_KEY` is blank at build time → check `local.properties` and rebuild (`assembleKnoxDebug`
  bakes it into `BuildConfig.KPE_LICENSE_KEY`).
- The broadcast never arrives within 30s (`LICENSE_TIMEOUT_MS`) → usually means Knox framework
  services aren't present/running on this device (non-Samsung hardware, or Knox services disabled) —
  double-check this is a genuine Samsung Knox-capable device.

---

## 5. Confirm no secrets leaked

```bash
git status --short
```

`android-agent/app/libs/knoxsdk.jar` and `android-agent/local.properties` must **not** appear as
tracked/staged (both are excluded by the root `.gitignore`'s `local.properties` and
`# === Knox SDK 애드온 ===` / `addon_knox_api_level_28_samsung_electronics/` entries plus the explicit
`android-agent/app/libs/knoxsdk.jar` line — re-verify after every commit on this branch).
