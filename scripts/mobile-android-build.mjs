import { existsSync } from 'node:fs';
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