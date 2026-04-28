#!/usr/bin/env node
/**
 * patch-android-signing.mjs
 *
 * Appends the canonical VEX release-signing block to
 * `android/app/build.gradle` (which is regenerated per machine by
 * `npx cap add android` and is gitignored).
 *
 * The block mirrors `docs/mobile/android-signing-gradle-snippet.md`
 * verbatim, except it is appended at the end of the file as a
 * second `android { ... }` configuration. Gradle merges multiple
 * `android { ... }` blocks in the same file, so this is equivalent
 * to editing the original block but is far simpler and safer than
 * regex-patching the existing one.
 *
 * Idempotent: re-running is a no-op once the marker comment is
 * present.
 *
 * Used by `.github/workflows/release-android.yml`.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptFile = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptFile), "..", "..");
const buildGradlePath = path.join(projectRoot, "android", "app", "build.gradle");

const MARKER = "// === VEX release signing (injected by CI) ===";

const SIGNING_BLOCK = `

${MARKER}
android {
    signingConfigs {
        release {
            def keystorePathEnv  = System.getenv("ANDROID_KEYSTORE_PATH")
            def keyAliasEnv      = System.getenv("ANDROID_KEY_ALIAS")
            def storePasswordEnv = System.getenv("ANDROID_KEYSTORE_PASSWORD")
            def keyPasswordEnv   = System.getenv("ANDROID_KEY_PASSWORD")

            if (!keystorePathEnv || !keyAliasEnv || !storePasswordEnv || !keyPasswordEnv) {
                storeFile     = null
                storePassword = null
                keyAlias      = null
                keyPassword   = null
            } else {
                storeFile     = file(keystorePathEnv)
                storePassword = storePasswordEnv
                keyAlias      = keyAliasEnv
                keyPassword   = keyPasswordEnv
            }

            // Explicitly enable every signature scheme. Without these the
            // Android Gradle Plugin's defaults sign only v1+v2, and the CI
            // verifier (.github/workflows/android-build.yml) hard-fails
            // because Android 12+ (API 31+) requires v3 for trusted
            // installation: an APK without a v3 signature still installs
            // but Android treats it as untrusted, breaks key rotation, and
            // surfaces "There was a problem parsing the package" on a
            // subset of devices when the package manager promotes the
            // signing block.
            //
            //   v1 — JAR signing (legacy installers, Android < 7.0)
            //   v2 — APK Signature Scheme v2 (Android 7.0+)
            //   v3 — APK Signature Scheme v3 (Android 9.0+, REQUIRED for
            //        trusted install on Android 12+ and for key rotation)
            //   v4 — APK Signature Scheme v4 (Android 11+, enables
            //        ADB Incremental install; harmless on older OSes)
            enableV1Signing = true
            enableV2Signing = true
            enableV3Signing = true
            enableV4Signing = true
        }
    }

    buildTypes {
        release {
            signingConfig signingConfigs.release
        }
    }
}

// Late-bound verification: fail fast if release signing was not configured.
// Uses tasks.matching(...).configureEach so we attach to real Gradle tasks
// (assembleRelease / bundleRelease) rather than the BuildType DSL object,
// which has no \`tasks\` property and would break the configuration phase.
gradle.taskGraph.whenReady { graph ->
    def needsSigning = graph.allTasks.any {
        it.name == "assembleRelease" || it.name == "bundleRelease" ||
        it.name == "packageRelease"  || it.name == "signReleaseBundle"
    }
    if (needsSigning) {
        def cfg = android.buildTypes.release.signingConfig
        if (cfg == null || cfg.storeFile == null) {
            throw new GradleException(
                "VEX release signing not configured. Export ANDROID_KEYSTORE_PATH, " +
                "ANDROID_KEY_ALIAS, ANDROID_KEYSTORE_PASSWORD and ANDROID_KEY_PASSWORD " +
                "(see docs/mobile/android-signing-gradle-snippet.md)."
            )
        }
    }
}
`;

function main() {
    if (!existsSync(buildGradlePath)) {
        console.error(`[patch-signing] ${buildGradlePath} not found.`);
        console.error("[patch-signing] Run `npx cap add android && npx cap sync android` first.");
        process.exit(1);
    }

    const gradle = readFileSync(buildGradlePath, "utf8");

    if (gradle.includes(MARKER)) {
        console.log("[patch-signing] Marker already present — nothing to do (idempotent).");
        return;
    }

    if (gradle.includes("ANDROID_KEYSTORE_PASSWORD")) {
        console.log(
            "[patch-signing] build.gradle already references ANDROID_KEYSTORE_PASSWORD by hand; skipping append.",
        );
        return;
    }

    writeFileSync(buildGradlePath, gradle + SIGNING_BLOCK);
    console.log("[patch-signing] Appended VEX release-signing block to android/app/build.gradle.");
}

main();
