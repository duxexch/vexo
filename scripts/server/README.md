# VEX Server Scripts

Operational scripts that run on the Hostinger VPS at `/docker/vex`. They are
chained together by `update-all.sh` but each one can also be invoked
standalone for targeted maintenance.

```
update-all.sh              one-shot orchestrator (git pull → APK refresh → deploy → verify → probe)
├── refresh-android-binaries.sh    download VEX-<version>.{apk,aab} + write manifest.json
├── ../../prod-update.sh           docker-compose rebuild + restart
├── verify-vex-deployment.sh       read-only sanity report (signature, DB, file integrity)
└── probe-android-manifest.sh      STRICT manifest ↔ disk ↔ public-URL reconciliation
```

## When the orchestrator fails on Step 5/5 (APK manifest probe)

Step 5/5 of `update-all.sh` runs `probe-android-manifest.sh`, which exits
non-zero (and aborts the orchestrator) whenever any of the following is true:

- `client/public/downloads/manifest.json` is missing or malformed.
- The `apkFile` / `aabFile` it advertises is missing on disk, zero-byte, or
  fails the ZIP magic check.
- The public URL `https://vixo.click/downloads/<apkFile>` returns anything
  other than HTTP 200/206 with `Content-Type: application/vnd.android.package-archive`.
- The first bytes the public URL serves are not the ZIP magic `PK` (catches
  the EACCES → HTML-rewrite silent-failure mode).

When the orchestrator stops with `APK manifest probe FAILED`, the recovery is
always the same — re-run the binary fetch, then re-probe:

```bash
# 1) Re-download the APK + AAB from the GitHub Release CDN and rewrite
#    manifest.json atomically (zero-downtime: the previous release stays
#    serveable until both new files have landed and validated).
bash scripts/server/refresh-android-binaries.sh

# 2) Re-run the orchestrator without redoing git pull / docker rebuild.
#    This will repeat Steps 4 (verify) and 5 (probe) on the freshly
#    refreshed binaries.
bash scripts/server/update-all.sh --skip-pull --skip-deploy

# Or, if you only want the probe (faster, no docker churn):
bash scripts/server/probe-android-manifest.sh
```

If `refresh-android-binaries.sh` itself fails, the GitHub Release for the
current `package.json` version probably hasn't been published yet — open the
Releases tab and confirm `v<version>` exists with both `VEX-official-release.apk`
and `VEX-official-release.aab` attached.

## Standalone uses

| Goal | Command |
| --- | --- |
| Pull latest code, rebuild, redeploy, verify, probe | `bash scripts/server/update-all.sh` |
| Refresh APK only (no code/container change) | `bash scripts/server/update-all.sh --skip-pull --skip-deploy` |
| Re-check the public APK URL after a CDN/proxy change | `bash scripts/server/probe-android-manifest.sh` |
| Run the same probe but skip the network leg (offline) | `bash scripts/server/probe-android-manifest.sh --skip-public` |
| Read-only deep audit (signature, DB FKs, file integrity) | `bash scripts/server/verify-vex-deployment.sh` |
| Just download new binaries + rewrite manifest | `bash scripts/server/refresh-android-binaries.sh` |

## Why Step 5/5 exists

Before this probe, `update-all.sh` could print **`Update sequence finished`**
in green even when the APK referenced by `manifest.json` had been silently
removed (rsync prune, accidental `rm`, container rebuild that wiped a volume).
The verify script trusted the proxy-supplied `Content-Type` header and missed
the EACCES case where Express returned a 5xx that some intermediates rewrote
to HTML — so users got an "App not installed / parse error" from the Android
package installer while every CI gate stayed green. Step 5/5 is the gate that
closes that hole: it does a real `GET` against the production URL and asserts
both the MIME and the first body bytes match a real APK.
