# Automated signed Android releases on GitHub Actions

This document explains how to enable the `Release Android (APK + AAB)`
GitHub Actions workflow that lives at
`.github/workflows/release-android.yml`.

When enabled, every push to `main` (and any manual run) will:

1. Build the web bundle (`npm run build`).
2. Generate a fresh Capacitor `android/` project (`npx cap add android` + `npx cap sync android`).
3. Decode the production keystore from a GitHub secret.
4. Verify the keystore SHA-256 matches the expected fingerprint
   (build aborts if a different keystore is uploaded by mistake).
5. Inject the canonical signing block into `android/app/build.gradle`
   (via `scripts/ci/patch-android-signing.mjs`).
6. Build a signed APK and AAB with the fixed identity.
7. Verify the APK signature SHA-256 again, after the build.
8. Publish a new GitHub Release named `android-v<UTC-date>-<short-sha>`
   containing both `app.apk` and `app.aab`.
9. Delete any older releases whose tag starts with `android-v` so that
   only the **latest two** Android releases ever exist on GitHub.

## Expected signing identity (DO NOT CHANGE)

The same `vex-release-official.jks` keystore must be used for every
release — Play Store rejects updates signed by a different key.

- Alias: `vex_release_official`
- SHA-256: `46:67:5A:1E:EA:17:A4:76:B9:1F:B3:11:3F:13:6F:85:3E:8B:65:BC:48:24:6C:91:BB:0E:BD:25:E7:EA:A5:CB`

The expected SHA-256 is hard-coded in `release-android.yml` under
`EXPECTED_SIGNING_SHA256`. If it ever needs to rotate, change it in
both places (workflow + `replit.md`).

## One-time setup

### 1. Rotate the leaked passwords first

The current store/key passwords were shared in chat history at least
twice and must be considered exposed. Before storing them as GitHub
secrets, rotate them so the secrets contain *new* values only:

```bash
# Rotate store password
keytool -storepasswd \
  -keystore vex-release-official.jks \
  -storepass <OLD_STORE_PASSWORD>

# Rotate key alias password
keytool -keypasswd \
  -keystore vex-release-official.jks \
  -alias vex_release_official \
  -storepass <NEW_STORE_PASSWORD> \
  -keypass <OLD_KEY_PASSWORD>
```

The keystore file itself stays the same (same SHA-256). Only the
passwords change.

### 2. Encode the keystore as base64

GitHub secrets only hold strings, so the binary keystore is uploaded
base64-encoded:

```bash
# Linux / macOS
base64 -w 0 vex-release-official.jks > keystore.b64

# macOS (BSD base64)
base64 -i vex-release-official.jks -o keystore.b64
```

Open `keystore.b64` and copy its entire contents (one long line, no
newlines).

### 3. Add the four GitHub repository secrets

In GitHub: **Settings → Secrets and variables → Actions → New repository secret**

| Secret name | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | the contents of `keystore.b64` from step 2 |
| `ANDROID_KEYSTORE_PASSWORD` | the *new* store password from step 1 |
| `ANDROID_KEY_ALIAS` | `vex_release_official` |
| `ANDROID_KEY_PASSWORD` | the *new* key password from step 1 |

After adding, delete `keystore.b64` from your local machine — its
content is now safely in the repo's encrypted secret store and a
plaintext copy on disk is an unnecessary risk.

### 4. Confirm Actions has write permission for releases

In GitHub: **Settings → Actions → General → Workflow permissions** →
choose **Read and write permissions**. The workflow uses the
default `GITHUB_TOKEN` to create and delete releases; it cannot do
that with the read-only default.

## Triggering a build

- **Automatic**: any push to `main` that touches the web app, the
  capacitor config, package files, the workflow itself, or the
  signing scripts triggers a build (see the `paths:` filter in
  `release-android.yml`).
- **Manual**: GitHub → Actions → "Release Android (APK + AAB)" → **Run workflow**.

## Where to find the artefacts

After a successful run:

- The latest two releases live at
  `https://github.com/<owner>/<repo>/releases`.
- Each release contains:
  - `app.apk` (sideload-friendly)
  - `app.aab` (Play Store upload)
- The same files are also attached to the workflow run for 14 days
  under the **Artifacts** section.

## Pulling the new release onto the Hostinger VPS

The Hostinger deploy serves `client/public/downloads/app.{apk,aab}`
out of the docker image. Two options:

### Option A — pull from GitHub Releases on the VPS (recommended)

Run this once after each successful workflow run, on the VPS:

```bash
cd /opt/vex   # or wherever the repo lives
TAG=$(gh release list --limit 1 --json tagName --jq '.[0].tagName')
gh release download "$TAG" \
  --pattern 'app.{apk,aab}' \
  --dir client/public/downloads/ --clobber
git status   # should show only the two updated binaries
# Either commit + redeploy, or rebuild the docker image with the new files baked in:
bash scripts/prod-auto.sh
```

### Option B — commit the binaries back to the repo

Only do this if you want the binaries tracked in git history. The two
files in `client/public/downloads/` are currently committed, so this
keeps the existing layout. After the workflow finishes, fetch and
commit:

```bash
TAG=$(gh release list --limit 1 --json tagName --jq '.[0].tagName')
gh release download "$TAG" \
  --pattern 'app.{apk,aab}' \
  --dir client/public/downloads/ --clobber
git add client/public/downloads/app.apk client/public/downloads/app.aab
git commit -m "Update Android release artefacts ($TAG)"
git push
```

## Troubleshooting

- **`ANDROID_KEYSTORE_BASE64 secret is not set`** — you missed step 3
  above (or named the secret differently).
- **`Keystore SHA-256 mismatch`** — the uploaded keystore is not the
  production one. Re-export the correct `vex-release-official.jks`
  and re-do step 2.
- **`APK signed with wrong key`** — the gradle build did not pick up
  the signing config. Check that
  `scripts/ci/patch-android-signing.mjs` ran in the previous step and
  that `android/app/build.gradle` now contains the
  `// === VEX release signing (injected by CI) ===` marker.
- **Release create fails with 403** — Actions token does not have
  write permission. Re-do step 4.

## Related files

- `.github/workflows/release-android.yml` — the workflow itself.
- `scripts/ci/patch-android-signing.mjs` — gradle injection helper.
- `scripts/mobile-android-build.mjs` — local-build entrypoint, same
  env-var contract.
- `docs/mobile/android-signing-gradle-snippet.md` — the canonical
  signing block (kept for local builds).
- `replit.md` § "Android Release Signing" — full release procedure.
