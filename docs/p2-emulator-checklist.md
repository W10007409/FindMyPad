# P2 Android Agent — Emulator E2E + Real FCM Manual Verification Checklist

This checklist covers what the P2 unit-test suite (`:app:testDevDebugUnitTest`) cannot: things that
only exist once real Android framework services (WorkManager/JobScheduler, FusedLocation-adjacent
Wi‑Fi/battery APIs, FCM, full-screen lock-screen activities) are running on a device/emulator, and
things that only exist once a real P1 server + Firebase project are wired together.

Run this after `./gradlew clean :app:testDevDebugUnitTest :app:assembleDevDebug` is green.

Knox real-device testing is **out of scope here** — see the separate `docs/knox-device-test.md` (P4).

---

## 0. Known gaps found while authoring this checklist (read first)

These are real behaviors in the current `feat/p2-android` code, not checklist typos. Steps below are
written to work *around* them. If a follow-up task fixes any of these, the workaround step can be
deleted.

1. **`ReportScheduler.schedule()` is only ever called from `BootReceiver`**
   (`android-agent/app/src/main/java/com/wjtb/padtracker/work/BootReceiver.kt`), never after a
   successful enroll or on first app launch (see `MainActivity.kt` / `AppContainer.kt`). On a fresh
   install the periodic `ReportWorker` is **not scheduled** until the device receives
   `BOOT_COMPLETED` at least once. §3 below has the emulator reboot / adb-broadcast step needed to
   trigger scheduling before you can force or wait for a report.
2. **`AppContainer.pushService` (the FCM token) is never read.** `EnrollmentViewModel.enroll()` is
   invoked from `MainActivity.kt` with `fcmToken = null` (the default parameter), so
   `container.pushService.currentToken()` is dead code — the token never reaches
   `POST /api/devices/enroll`. §4 below has a manual DB patch to populate `devices.fcm_token` so the
   real-FCM steps in §5 have something to send to.
3. **The P1 server always constructs `new StubFcmSender()`** in `server/src/server.ts` — it records
   sends in memory only, it does not call Firebase. `POST /api/admin/devices/:id/ring` /
   `/locate` therefore **never actually delivers a push** against this server as-is. §5 documents
   both (a) the code change needed to send for real, and (b) a Firebase-Console fallback that
   verifies the Android client (`PadMessagingService` → `RingActivity`) without needing the server
   change.
4. **`FcmCommand.LocateNow` in `PadMessagingService.kt` is a no-op** (see the comment "즉시 1회 위치
   보고 ... 이후 작업에서 연결한다"). `LOCATE_NOW` currently does not enqueue an immediate report. §5.6
   verifies (and documents) this as current, expected behavior rather than a checklist bug — flag it
   for a follow-up task if immediate-report-on-LOCATE_NOW is required before shipping.
5. **No server route creates `users` (employee) rows** — `POST /api/checkouts` looks up the user by
   `empNo` in the `users` table, but there is no signup/seed endpoint for it (only `adminUsers` has a
   CLI seeder). §2 has a direct SQL insert to create a test employee.

---

## 1. Prerequisites

- Android Studio (Giraffe+) with an **API 34 system image** available (Settings → SDK Manager → SDK
  Platforms → Android 14.0 "UpsideDownCake").
- Node/pnpm + Docker (for the P1 server, per `server/README.md` / repo root `README.md`).
- Repo checked out at `feat/p2-android` (or later, once merged), clean `./gradlew clean
  :app:testDevDebugUnitTest :app:assembleDevDebug --no-daemon` already green.
- `adb` on PATH (ships with Android Studio SDK platform-tools).

---

## 2. Start the P1 server + seed test data

```bash
cd server
cp .env.example .env               # if not already done
docker compose up -d db            # from repo root, or: (cd .. && docker compose up -d db)
pnpm install
pnpm db:migrate
pnpm seed:admin root secret123 admin
pnpm dev                           # listens on :3000
```

Seed one test employee for the checkout step (no API exists for this — insert directly):

```bash
docker exec -it $(docker compose ps -q db) \
  psql -U pad -d padtracker \
  -c "INSERT INTO users (emp_no, name, dept) VALUES ('E0001', '홍길동', 'QA') ON CONFLICT DO NOTHING;"
```

Confirm the server is up: `curl http://localhost:3000/health` → `{"status":"ok"}`.

Log in as admin and keep the token handy for §5 (`/ring` needs it):

```bash
curl -s -X POST http://localhost:3000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"username":"root","password":"secret123"}'
# → { "token": "<ADMIN_JWT>" }
```

---

## 3. Emulator E2E (dev flavor, mocked DeviceControl/PushService)

### 3.1 Create the AVD

Android Studio → Device Manager → Create Device → any phone profile → **system image: API 34
(UpsideDownCake, x86_64 or arm64 to match host)** → finish. Or via CLI:

```bash
avdmanager create avd -n pad-p2-test -k "system-images;android-34;google_apis;x86_64" -d pixel_6
emulator -avd pad-p2-test
```

The app's `AppContainer.defaultBaseUrl` is hardcoded to `http://10.0.2.2:3000/`, which is the
standard emulator alias for the host loopback — no config needed as long as the emulator (not a
physical device) is used and the P1 server from §2 is running on the host at `:3000`.

### 3.2 Build and install

```bash
cd android-agent
./gradlew :app:assembleDevDebug --no-daemon
adb install -r app/build/outputs/apk/dev/debug/app-dev-debug.apk
adb shell am start -n com.wjtb.padtracker/.ui.MainActivity
```

### 3.3 Onboarding → enroll

- App launches straight into the **기기 등록** (Enrollment) screen (dev flavor uses
  `MockDeviceControl`, so `activateLicense()`/`readSerial()` always succeed with the emulator's
  `Settings.Secure.ANDROID_ID`).
- Tap **등록 시작**. Expect **"등록이 완료되었습니다."**
- Verify server-side device row:
  ```bash
  curl -s http://localhost:3000/api/admin/devices \
    -H "Authorization: Bearer <ADMIN_JWT>" | jq
  ```
  Confirm one `items[]` entry with a `serial` matching the emulator's Android ID and
  `fcmToken: null` (expected — see gap #2 in §0; dev flavor's `MockPushService` returns
  `"dev-mock-token"` but nothing currently sends it).
- Tap **홈으로 이동**.

### 3.4 Checkout (emp-no + location consent)

- From Home, start Checkout. Enter emp no `E0001` (seeded in §2). The screen shows the consent
  notice ("제출 시 이 기기의 위치 정보 수집·활용에 동의하는 것으로 간주됩니다.") — this notice IS the consent
  UX; there's no separate checkbox to tick.
- Tap **제출**. Expect **"체크아웃이 완료되었습니다."**
- Verify: `GET /api/admin/devices/:id` shows `currentUser: { empNo: "E0001", name: "홍길동", ... }`.
- Re-submitting a second checkout on the same device before returning should show **"이미 체크아웃된
  기기입니다."** (409/Conflict path) — optional spot-check of the conflict UI state.

### 3.5 Trigger periodic reporting and confirm a report reaches the server

Because of gap #1 in §0, the periodic `ReportWorker` is not scheduled until `BOOT_COMPLETED` fires.
Simulate that on the emulator (do this *after* enrollment/checkout, i.e. once the app + its receiver
are installed):

```bash
adb shell am broadcast -a android.intent.action.BOOT_COMPLETED \
  -n com.wjtb.padtracker/.work.BootReceiver
```

Confirm the periodic work got scheduled:

```bash
adb shell dumpsys jobscheduler | grep -A 3 "com.wjtb.padtracker"
```

You should see one job whose tag references `periodic_report` / `ReportWorker`. Note its `JOB #<id>`
(printed as `JOB #<uid>/<id>: ...`) — force it to run immediately instead of waiting 15 minutes:

```bash
adb shell cmd jobscheduler run -f com.wjtb.padtracker <job-id>
```

(If `-f` force-run isn't available on your emulator's API level, just wait — the real interval is 15
minutes; `ReportScheduler.INTERVAL_MINUTES` in `work/ReportScheduler.kt` confirms this.)

Verify a report landed on the server:

```bash
curl -s "http://localhost:3000/api/admin/devices/<deviceId>" \
  -H "Authorization: Bearer <ADMIN_JWT>" | jq '.recentReports[0]'
```

Expect a row with non-null `batteryPct` and (if the emulator has a simulated Wi‑Fi AP configured)
`bssid`/`ssid`. `lat`/`lng` are expected to be `null` — P2's `SnapshotCollector` intentionally only
collects battery/Wi‑Fi; real GPS collection is a real-device concern (see `SnapshotCollector.kt`
comment), not a bug here.

### 3.6 Return

- From Home, tap **반납**.
- Verify `GET /api/admin/devices/:id` now shows `currentUser: null` and the checkout's
  `returnedAt` is set (`history[0].returnedAt` non-null).

---

## 4. Prep for real FCM: `google-services.json` + device token

1. In the Firebase console, create (or reuse) a Firebase project with an Android app registered as
   `com.wjtb.padtracker` (matches `applicationId` in `android-agent/app/build.gradle.kts` — the dev
   and knox flavors share this id, no suffix). Download `google-services.json`.
2. Drop it at `android-agent/app/google-services.json`. This path is already gitignored
   (`android-agent/.gitignore` line `/app/google-services.json`, plus root `.gitignore`
   `**/google-services.json`) — confirm `git status` stays clean after adding it.
3. Rebuild — the `com.google.gms.google-services` plugin is applied conditionally
   (`if (file("google-services.json").exists())` in `app/build.gradle.kts`), so this build now
   actually links Firebase:
   ```bash
   ./gradlew :app:assembleDevDebug --no-daemon
   adb install -r app/build/outputs/apk/dev/debug/app-dev-debug.apk
   ```
4. Re-run onboarding (uninstall+reinstall or clear app data first so enroll runs again) and capture
   the real FCM token from logcat, since gap #2 in §0 means it isn't sent to the server automatically:
   ```bash
   adb logcat | grep -i "FirebaseMessaging\|padtracker"
   ```
   or temporarily add `android.util.Log.d("fcm-token", token)` inside
   `MockPushService.currentToken()` / wherever `FirebaseMessaging.getInstance().token` is awaited, if
   it's not already logged anywhere. (This is a debug-only, non-committed local edit — do not commit
   it.)
5. Patch the device row so the server has a token to send to (works around gap #2):
   ```bash
   docker exec -it $(docker compose ps -q db) psql -U pad -d padtracker \
     -c "UPDATE devices SET fcm_token = '<TOKEN_FROM_LOGCAT>' WHERE serial = '<ANDROID_ID>';"
   ```

---

## 5. Real FCM: RING and LOCATE_NOW

### 5.1 Option A — via the P1 server `/ring` endpoint (requires the server-side gap fix)

Gap #3 in §0 means `server/src/server.ts` must construct a **real** `FcmSender` (e.g. one built on
`firebase-admin`) instead of `new StubFcmSender()` before this path can deliver anything. That
server-side change is out of scope for this Android-only task; if/when it lands:

```bash
curl -s -X POST "http://localhost:3000/api/admin/devices/<deviceId>/ring" \
  -H "Authorization: Bearer <ADMIN_JWT>"
# → { "queued": true }
```

### 5.2 Option B — Firebase Console "send test message" (works today, verifies the Android client)

This bypasses the server entirely and is the fastest way to confirm `PadMessagingService` →
`RingActivity` actually works on-device:

1. Firebase Console → your project → Messaging (Cloud Messaging) → **New notification** →
   **Send test message**.
2. Add the FCM registration token captured in §4.4.
3. Under "Additional options" → custom data, add key `command` with value `RING` (matches
   `FcmCommand.fromData` in `android-agent/app/src/main/java/com/wjtb/padtracker/domain/FcmCommand.kt`,
   which reads `data["command"]`).
4. Send. On the emulator/device:

### 5.3 Verify RING behavior

- `RingActivity` should appear **full-screen**, over the lock screen if locked
  (`setShowWhenLocked(true)` / `setTurnScreenOn(true)` in `RingActivity.kt`), showing
  "이 패드는 <부서> <이름> 님 기기입니다" (department/name come from the intent extras, blank if not
  passed by this particular test message — that's fine, this step is checking the alarm/full-screen
  behavior, not the extras plumbing).
- Alarm-stream audio should play at max volume (device not on silent — the ringtone plays via
  `AudioAttributes.USAGE_ALARM`, which on API 28+ (`Build.VERSION.SDK_INT >= P`) loops until
  stopped; on the emulator's API 34 image this loops as expected).
- Tap **중지** → sound stops, activity finishes, alarm volume restored to its prior value.

### 5.4 LOCATE_NOW — send the same way with `command=LOCATE_NOW`

- Per gap #4 in §0, **expect no visible effect today** — `PadMessagingService.onMessageReceived`'s
  `FcmCommand.LocateNow` branch is currently an empty no-op. This step exists so the gap is
  re-confirmed against the actual build rather than assumed from source; if a later change wires an
  immediate one-time `ReportWorker` enqueue here, re-run this step and confirm a report appears in
  `recentReports` within a few seconds of sending.

### 5.5 Confirm no secrets leaked

```bash
git status --short
```
`android-agent/app/google-services.json` and `android-agent/local.properties` must **not** appear as
tracked/staged — both are gitignored. Delete `google-services.json` once done testing if it's a
shared/sensitive Firebase project key.

---

## 6. Knox real-device path (not covered here)

Knox flavor (`KnoxDeviceControl`, `KnoxBindings.kt`) requires a real Samsung Knox-licensed device and
a Knox license key — that verification path is P4 and lives in a separate
`docs/knox-device-test.md`, not in this checklist.
