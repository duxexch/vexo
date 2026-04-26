import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptFile = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptFile), '..');
const androidDir = path.join(projectRoot, 'android');
const isWindows = process.platform === 'win32';
const supportedTasks = new Set(['assembleRelease', 'bundleRelease', 'clean']);

const args = process.argv.slice(2);
const requestedTask = args.find((arg) => !arg.startsWith('--')) ?? 'assembleRelease';
const extraArgs = args.filter((arg) => arg !== requestedTask);

if (!supportedTasks.has(requestedTask)) {
    console.error(`[android-build] Unsupported task: ${requestedTask}`);
    console.error(`[android-build] Supported tasks: ${Array.from(supportedTasks).join(', ')}`);
    process.exit(1);
}

/**
 * Release-signing pre-flight.
 *
 * For `assembleRelease` / `bundleRelease` we refuse to invoke gradle
 * unless every signing input is populated. Passwords are then forwarded
 * to the gradle process via the existing process environment ONLY —
 * they are NEVER written to a properties file, gradle command line,
 * or anywhere else on disk. `android/app/build.gradle` reads them with
 * `System.getenv("ANDROID_KEYSTORE_PASSWORD")` etc.; the canonical
 * gradle snippet lives at `docs/mobile/android-signing-gradle-snippet.md`.
 *
 * Reads (in priority order):
 *   1. ANDROID_KEYSTORE_PATH / ANDROID_KEY_ALIAS / ANDROID_KEYSTORE_PASSWORD / ANDROID_KEY_PASSWORD
 *   2. Legacy KEYSTORE_PATH / KEY_ALIAS / KEYSTORE_PASSWORD / KEY_PASSWORD
 *      (kept so older `.env.local` files keep working — emits a warning).
 */
function prepareReleaseSigning() {
    if (requestedTask !== 'assembleRelease' && requestedTask !== 'bundleRelease') {
        return;
    }

    const pick = (...keys) => {
        for (const key of keys) {
            const value = process.env[key];
            if (value && value.trim() && !value.includes('__REDACTED')) {
                return { key, value };
            }
        }
        return { key: keys[0], value: undefined };
    };

    const usingLegacy =
        !process.env.ANDROID_KEYSTORE_PATH &&
        !process.env.ANDROID_KEY_ALIAS &&
        !process.env.ANDROID_KEYSTORE_PASSWORD &&
        !process.env.ANDROID_KEY_PASSWORD &&
        (process.env.KEYSTORE_PATH ||
            process.env.KEY_ALIAS ||
            process.env.KEYSTORE_PASSWORD ||
            process.env.KEY_PASSWORD);

    if (usingLegacy) {
        console.warn('[android-build] Using legacy KEYSTORE_* env vars. Please rename to ANDROID_KEYSTORE_PATH / ANDROID_KEY_ALIAS / ANDROID_KEYSTORE_PASSWORD / ANDROID_KEY_PASSWORD (matches Replit Secrets).');
    }

    const storePath = pick('ANDROID_KEYSTORE_PATH', 'KEYSTORE_PATH');
    const alias = pick('ANDROID_KEY_ALIAS', 'KEY_ALIAS');
    const storePass = pick('ANDROID_KEYSTORE_PASSWORD', 'KEYSTORE_PASSWORD');
    const keyPass = pick('ANDROID_KEY_PASSWORD', 'KEY_PASSWORD');

    const missing = [storePath, alias, storePass, keyPass]
        .filter((entry) => !entry.value)
        .map((entry) => entry.key);

    if (missing.length > 0) {
        console.error('[android-build] Refusing to run a release build — release-signing env vars missing:');
        for (const key of missing) {
            console.error(`[android-build]   - ${key}`);
        }
        console.error('[android-build] On Replit: open Secrets and add ANDROID_KEYSTORE_PATH, ANDROID_KEY_ALIAS, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_PASSWORD.');
        console.error('[android-build] On a local build machine: export the same four vars in your shell profile (~/.zshrc, ~/.bashrc, etc).');
        console.error('[android-build] See replit.md § "Android Release Signing" for the canonical procedure.');
        process.exit(1);
    }

    const resolvedStorePath = path.isAbsolute(storePath.value)
        ? storePath.value
        : path.resolve(projectRoot, storePath.value);

    if (!existsSync(resolvedStorePath)) {
        console.error(`[android-build] Keystore file not found at ${resolvedStorePath}`);
        console.error('[android-build] Copy your release `.jks` into that path before retrying. The file is gitignored (`*.jks`) so it never ends up in the repo.');
        process.exit(1);
    }

    const appDir = path.join(androidDir, 'app');
    if (!existsSync(appDir)) {
        console.error(`[android-build] Capacitor android/ project not found at ${appDir}.`);
        console.error('[android-build] Run `npx cap add android && npx cap sync android` first — `android/` is regenerated per machine and is gitignored.');
        process.exit(1);
    }

    // Belt-and-braces: also fail loudly if app/build.gradle has not yet
    // been patched with the signingConfigs.release block that reads
    // `System.getenv("ANDROID_KEYSTORE_PASSWORD")` etc. Otherwise gradle
    // would silently fall back to debug-signed output and the user
    // would not notice until Play Store rejects the upload.
    const buildGradlePath = path.join(appDir, 'build.gradle');
    if (existsSync(buildGradlePath)) {
        const buildGradle = readFileSync(buildGradlePath, 'utf8');
        if (!buildGradle.includes('ANDROID_KEYSTORE_PASSWORD')) {
            console.error('[android-build] android/app/build.gradle does not reference ANDROID_KEYSTORE_PASSWORD.');
            console.error('[android-build] Apply the signingConfigs block from docs/mobile/android-signing-gradle-snippet.md so gradle reads passwords from the environment.');
            process.exit(1);
        }
    }

    // Forwarded to the gradle process via env (see env spread below).
    // We also refuse to log the values — the alias is non-secret so it
    // is safe to print, but storePath is left unprinted because it can
    // hint at usernames / home directories.
    console.log(`[android-build] Release signing inputs validated from environment (alias=${alias.value}). Forwarding to gradle via env vars only — nothing written to disk.`);
}

prepareReleaseSigning();

function resolveJavaHome() {
    const candidates = [];

    if (process.env.JAVA_HOME) {
        candidates.push(process.env.JAVA_HOME);
    }

    if (isWindows) {
        candidates.push(
            'C:\\Program Files\\Android\\Android Studio\\jbr',
            'C:\\Program Files\\Android\\Android Studio\\jre',
            'C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.10.7-hotspot',
            'C:\\Program Files\\Java\\jdk-21',
            'C:\\Program Files\\Microsoft\\jdk-21.0.8.9-hotspot'
        );
    } else if (process.platform === 'darwin') {
        candidates.push(
            '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
            '/Applications/Android Studio.app/Contents/jre/Contents/Home',
            '/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home'
        );
    } else {
        candidates.push(
            '/opt/android-studio/jbr',
            '/usr/lib/jvm/temurin-21-jdk',
            '/usr/lib/jvm/java-21-openjdk-amd64'
        );
    }

    for (const candidate of candidates) {
        if (!candidate) {
            continue;
        }

        const javaBinary = path.join(candidate, 'bin', isWindows ? 'java.exe' : 'java');
        if (existsSync(javaBinary)) {
            return candidate;
        }
    }

    return null;
}

const javaHome = resolveJavaHome();

if (!javaHome) {
    console.error('[android-build] No compatible JDK 21 installation was found.');
    console.error('[android-build] Install Android Studio or set JAVA_HOME to a JDK 21 path before building Android releases.');
    process.exit(1);
}

const javaBinary = path.join(javaHome, 'bin', isWindows ? 'java.exe' : 'java');
const gradleExecutable = isWindows ? 'gradlew.bat' : './gradlew';
const env = {
    ...process.env,
    JAVA_HOME: javaHome,
    PATH: `${path.join(javaHome, 'bin')}${path.delimiter}${process.env.PATH ?? ''}`,
};

console.log(`[android-build] Using JAVA_HOME=${javaHome}`);
console.log(`[android-build] Running ${gradleExecutable} ${requestedTask}${extraArgs.length ? ` ${extraArgs.join(' ')}` : ''}`);

const versionResult = spawnSync(javaBinary, ['-version'], {
    cwd: androidDir,
    env,
    stdio: 'inherit',
});

if (versionResult.status !== 0) {
    process.exit(versionResult.status ?? 1);
}

const buildResult = spawnSync(gradleExecutable, [requestedTask, ...extraArgs], {
    cwd: androidDir,
    env,
    stdio: 'inherit',
    shell: isWindows,
});

if (buildResult.error) {
    console.error(`[android-build] ${buildResult.error.message}`);
    process.exit(1);
}

if (buildResult.status === 0) {
    if (requestedTask === 'bundleRelease') {
        console.log('[android-build] Output: android/app/build/outputs/bundle/release/app-release.aab');
    }

    if (requestedTask === 'assembleRelease') {
        console.log('[android-build] Output: android/app/build/outputs/apk/release/app-release.apk');
    }
}

process.exit(buildResult.status ?? 0);