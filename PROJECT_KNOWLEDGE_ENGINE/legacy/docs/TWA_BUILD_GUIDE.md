# VEX — TWA Build & Google Play Publishing Guide

> **Package**: `click.vixo.app`  
> **Origin**: `https://vixo.click`  
> **Updated**: 2026-02-26

---

## 1. How TWA Works

A **Trusted Web Activity** wraps your PWA in a thin Android shell. Chrome renders
your site full-screen (no address bar) after verifying ownership via Digital Asset Links.

```
Google Play Store
  └─ installs TWA shell (~2 MB)
       └─ Chrome Custom Tab (full-screen, no UI)
            └─ loads https://vixo.click (your live site)
                 └─ Service Worker handles cache + offline
```

**Key benefit**: Any deploy to `https://vixo.click` is instantly reflected. No Play Store update needed.

---

## 2. Prerequisites

| Tool | Install |
|------|---------|
| JDK 17 | [Adoptium](https://adoptium.net/) |
| Android SDK 33+ | [Android Studio](https://developer.android.com/studio) |
| Bubblewrap CLI | See GitHub: [GoogleChromeLabs/bubblewrap](https://github.com/nicksinger/nicolo) |

---

## 3. Generate Signing Key

```bash
keytool -genkeypair \
  -alias vex-twa \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -keystore vex-twa-keystore.jks \
  -storepass YOUR_STORE_PASSWORD \
  -dname "CN=VEX Platform, O=VEX, L=Dubai, C=AE"
```

> **Back up** `vex-twa-keystore.jks` securely. You cannot change the key once published.

---

## 4. Get SHA-256 Fingerprint

```bash
keytool -list -v \
  -keystore vex-twa-keystore.jks \
  -alias vex-twa \
  | grep SHA256
```

Copy the fingerprint (e.g. `AB:CD:12:34:...`).

---

## 5. Update assetlinks.json

Edit `client/public/.well-known/assetlinks.json`:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "click.vixo.app",
      "sha256_cert_fingerprints": [
        "YOUR_SHA256_FINGERPRINT_HERE"
      ]
    }
  }
]
```

Deploy, then verify at:
- `https://vixo.click/.well-known/assetlinks.json`
- [Google's validator](https://developers.google.com/digital-asset-links/tools/generator)

---

## 6. Build the Android App

### Option A — PWABuilder (Easiest)

1. Go to **https://www.pwabuilder.com/**
2. Enter `https://vixo.click`
3. Click **Package for stores** → **Android**
4. Set package: `click.vixo.app`
5. Upload your signing key or let it generate one
6. Download the signed `.aab` file

### Option B — Bubblewrap CLI

```bash
# Create a new directory
mkdir vex-twa && cd vex-twa

# Initialize from your manifest
npx bubblewrap init --manifest=https://vixo.click/manifest.json

# Build signed AAB
npx bubblewrap build
```

Bubblewrap reads your manifest and auto-fills app name, icons, theme colors.  
Edit `twa-manifest.json` if you need to customize.

---

## 7. Test

```bash
# Install APK on connected device
adb install app-release-signed.apk
```

Verify:
- App opens full-screen (no Chrome address bar)
- If address bar shows → assetlinks.json verification failed
- Debug via `chrome://inspect` with USB-connected device

---

## 8. Publish to Google Play

### 8.1 Create Developer Account
- [Google Play Console](https://play.google.com/console) — $25 one-time fee

### 8.2 Create App Listing
- **App name**: VEX - Gaming & Trading Platform
- **Category**: Games > Board
- **Screenshots**: From `client/public/screenshots/`
- **Privacy policy URL**: Required

### 8.3 Upload
1. Production → Create new release
2. Upload `.aab` file
3. Add release notes
4. Submit for review

### Required Assets

| Asset | Size |
|-------|------|
| Hi-res icon | 512×512 PNG |
| Feature graphic | 1024×500 PNG |
| Phone screenshots | min 2 |
| Privacy policy | URL |

---

## 9. How Auto-Update Works

### Web Content (instant, no store update)
```
User opens app → Chrome loads vixo.click → SW checks for new version
  → New SW found → update banner shown → user taps Update → page reloads
```

Deploying a new Docker build updates the app for all users instantly.

### TWA Shell (rare, needs store update)
Only update when changing: package name, signing key, Android-specific config.

### Cache Invalidation
Vite generates hashed filenames (`main.a1b2c3.js`). New deploy = new hashes =
cache miss = fresh fetch. Old cache cleaned on next SW activation.

---

## 10. Troubleshooting

| Problem | Fix |
|---------|-----|
| Chrome address bar visible | Verify assetlinks.json fingerprint matches signing key |
| PWA not installable | Ensure manifest has `display: standalone`, SW is registered, HTTPS |
| SW not updating | Force: send `CLEAR_CACHE` message, then reload |
| Offline fallback showing | Check network; clear site data in DevTools |
