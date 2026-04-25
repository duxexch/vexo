# VoIP Push Real-Device Verification — April 2026

End-to-end proof that a backgrounded / killed app on iOS and Android
actually rings the OS lock-screen UI when called from another account.
Static smokes (`npm run quality:smoke:voip-push`) cover wire format and
JWT crypto; this report covers the device surfaces those smokes
intentionally cannot reach (CallKit on iOS, Telecom self-managed
ConnectionService on Android).

## Status

- [ ] Test session executed
- [ ] All scenarios passed
- [ ] Gap fix tasks filed (none required if all green)

## Preconditions

Before starting the device test, confirm both of the following on the
production VPS:

- [ ] All env vars from `.env.example` (APNs block at lines 191-205 +
      Firebase block at lines 187-189) are populated in the production
      env source used by Docker Compose.
- [ ] `npm run ops:voip-push-doctor:online` exits 0 on the VPS — proves
      Apple accepts the provider JWT and Google issues an OAuth access
      token. **Capture the output below** before continuing:

```
# Paste output of `npm run ops:voip-push-doctor:online` here.
# Expected: every check shows PASS, "Result: OK".
```

## Setup

| Item                        | Value                       |
|-----------------------------|-----------------------------|
| Test date (UTC)             |                             |
| Tester                      |                             |
| Server commit / build       |                             |
| Mobile build (iOS bundle)   |                             |
| Mobile build (Android APK)  |                             |
| Caller account              |                             |
| Receiver account            |                             |

### Devices

| Slot       | Device model | OS version | Carrier / Wi-Fi | Build channel       |
|------------|--------------|------------|-----------------|---------------------|
| iOS A      |              |            |                 | TestFlight / Ad-hoc |
| Android B  |              |            |                 | Signed debug APK    |

### One-time wiring (per `native-plugins/capacitor-native-call-ui/README.md`)

- [ ] `npx cap add ios` ran cleanly on the macOS workstation.
- [ ] `npx cap add android` ran cleanly.
- [ ] Xcode capabilities enabled: Push Notifications + Background Modes
      (Voice over IP, Background fetch, Remote notifications, Audio).
- [ ] `AppDelegate.swift` includes the snippet from
      `native-plugins/capacitor-native-call-ui/examples/AppDelegate-snippet.swift`.
- [ ] `AndroidManifest.xml` merged the entries from
      `native-plugins/capacitor-native-call-ui/examples/AndroidManifest-snippet.xml`
      (especially `MANAGE_OWN_CALLS` and the `ConnectionService` intent
      filter — without these, Telecom refuses to register the phone
      account).
- [ ] `google-services.json` placed at `android/app/`.

### Device-token registration sanity

After installing both builds and signing in once, verify on the VPS DB
that `device_push_tokens` has at least one active row per device. With
`psql`:

```sql
SELECT user_id, platform, kind, length(token), created_at
FROM device_push_tokens
WHERE deactivated_at IS NULL
ORDER BY created_at DESC LIMIT 10;
```

- [ ] iOS A row present with `kind = 'voip'` and 64-char token.
- [ ] Android B row present with `kind = 'fcm'` and a long FCM token.

## Scenarios

For each row, mark **PASS** / **FAIL** and capture timing + notes. A
scenario only counts as PASS if the receiver's lock-screen rings (full
OS UI, not the in-app modal) and accept/decline transition the WebRTC
layer correctly.

### S1 — Killed app, screen on, Wi-Fi

| Direction          | Ring within ~5s | Accept transitions to in-call | Decline ends call cleanly | Appears in OS recents | Notes |
|--------------------|-----------------|-------------------------------|---------------------------|-----------------------|-------|
| iOS A → Android B  |                 |                               |                           |                       |       |
| Android B → iOS A  |                 |                               |                           |                       |       |

### S2 — Killed app, screen off, Wi-Fi

| Direction          | Ring within ~5s | Accept transitions to in-call | Decline ends call cleanly | Appears in OS recents | Notes |
|--------------------|-----------------|-------------------------------|---------------------------|-----------------------|-------|
| iOS A → Android B  |                 |                               |                           |                       |       |
| Android B → iOS A  |                 |                               |                           |                       |       |

### S3 — Killed app, screen off, mobile data (4G/5G)

| Direction          | Ring within ~5s | Accept transitions to in-call | Decline ends call cleanly | Appears in OS recents | Notes |
|--------------------|-----------------|-------------------------------|---------------------------|-----------------------|-------|
| iOS A → Android B  |                 |                               |                           |                       |       |
| Android B → iOS A  |                 |                               |                           |                       |       |

### S4 — Airplane mode replay

Receiver is in airplane mode when the call is placed. Caller sees the
ring tone time out as expected. Receiver flips airplane mode off after
~30s.

| Receiver  | Push replayed by gateway | Ring within ~5s of reconnect | Notes |
|-----------|--------------------------|------------------------------|-------|
| iOS A     |                          |                              |       |
| Android B |                          |                              |       |

### S5 — Bluetooth headset / car UI integration

| Receiver  | Headset rings   | Headset accept works | Headset decline works | CarPlay / Auto label correct | Notes |
|-----------|-----------------|----------------------|-----------------------|------------------------------|-------|
| iOS A     |                 |                      |                       |                              |       |
| Android B |                 |                      |                       |                              |       |

## Production log check

After the test session, on the VPS:

```bash
docker compose logs --since 2h app | grep -i "voip-push"
```

- [ ] No `[voip-push] not configured` warnings.
- [ ] No 403 InvalidProviderToken / 401 UNAUTHENTICATED errors.
- [ ] Each scenario has a corresponding `[voip-push] sent` log line.

## Outcome

- Total scenarios: **__ / __ PASS**
- Issues found (file each as a separate task and link below):
  - …

## Sign-off

| Role     | Name | Date |
|----------|------|------|
| Tester   |      |      |
| Reviewer |      |      |
