/**
 * smoke-ringtone-asset.ts
 *
 * Guardrail for Task #46 (real ringtone asset replaces synth tones).
 *
 * Asserts:
 *   1. The bundled ringtone WAV exists at the expected path so the
 *      `<audio>`-backed ringer and the Capacitor LocalNotifications
 *      channel can both find it.
 *   2. The file is a valid PCM WAV (RIFF/WAVE header + `fmt ` + `data`
 *      chunks) — catches accidental commits of empty/HTML stubs.
 *   3. The asset is not a token-sized stub (>= 50KB of PCM data).
 *   4. `client/src/lib/call-ringtone.ts` references `/sounds/notification.wav`
 *      so the file ringer is actually wired up.
 *   5. The synth oscillator fallback is still present in the same file
 *      so we degrade gracefully when autoplay is blocked or the asset
 *      fails to load.
 *   6. The Capacitor channel definition still references
 *      `notification.wav` so the native ringer uses the bundled asset
 *      rather than the OS default tone (the channel path mirrors the
 *      web asset name on purpose).
 *   7. `capacitor.config.ts` still declares `notification.wav` as the
 *      LocalNotifications sound so backgrounded mobile rings stay
 *      branded.
 *
 * Run with: `npm run quality:smoke:ringtone-asset`
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const RINGTONE_PATH = path.join(REPO_ROOT, "client/public/sounds/notification.wav");
const RINGTONE_MP3_PATH = path.join(REPO_ROOT, "client/public/sounds/notification.mp3");
const CALL_RINGTONE_TS = path.join(REPO_ROOT, "client/src/lib/call-ringtone.ts");
const CAPACITOR_CONFIG = path.join(REPO_ROOT, "capacitor.config.ts");

let passed = 0;
let failed = 0;

function pass(name: string): void {
  passed += 1;
  console.log(`[smoke:ringtone-asset] PASS ${name}`);
}

function fail(name: string, hint?: string): void {
  failed += 1;
  console.error(`[smoke:ringtone-asset] FAIL ${name}${hint ? `\n  ${hint}` : ""}`);
}

async function tryReadFile(p: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(p);
  } catch {
    return null;
  }
}

async function tryReadText(p: string): Promise<string | null> {
  try {
    return await fs.readFile(p, "utf8");
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  // 1. Asset exists.
  const wav = await tryReadFile(RINGTONE_PATH);
  if (!wav) {
    fail(
      "ringtone WAV exists at client/public/sounds/notification.wav",
      "Run `npx tsx scripts/generate-ringtone.ts` to regenerate the asset.",
    );
  } else {
    pass("ringtone WAV exists at client/public/sounds/notification.wav");

    // 2. Valid WAV header.
    const riff = wav.slice(0, 4).toString();
    const wave = wav.slice(8, 12).toString();
    const fmt = wav.slice(12, 16).toString();
    const dataChunkOk = wav.includes(Buffer.from("data"));
    if (riff !== "RIFF" || wave !== "WAVE" || fmt !== "fmt " || !dataChunkOk) {
      fail(
        "WAV file has valid RIFF/WAVE/fmt/data structure",
        `Got header: ${riff}/${wave}/${fmt}, dataChunk=${dataChunkOk}`,
      );
    } else {
      pass("WAV file has valid RIFF/WAVE/fmt/data structure");
    }

    // 3. Real audio data (not a stub).
    if (wav.length < 50_000) {
      fail(
        "WAV file is at least 50KB (real audio data, not a stub)",
        `Size: ${wav.length} bytes`,
      );
    } else {
      pass("WAV file is at least 50KB (real audio data, not a stub)");
    }
  }

  // 4. Module references the asset.
  const ringtoneSrc = await tryReadText(CALL_RINGTONE_TS);
  if (!ringtoneSrc) {
    fail(
      "client/src/lib/call-ringtone.ts is readable",
      "File is missing — restore it or update this smoke's path constant.",
    );
  } else {
    if (ringtoneSrc.includes("/sounds/notification.wav")) {
      pass("call-ringtone.ts references /sounds/notification.wav");
    } else {
      fail(
        "call-ringtone.ts references /sounds/notification.wav",
        "Wire the file-backed ringer to the bundled WAV asset (RINGTONE_AUDIO_SRC).",
      );
    }

    // 5. Synth fallback still exists.
    if (/createOscillator/.test(ringtoneSrc) && /startSynthRingtone|playRingPattern/.test(ringtoneSrc)) {
      pass("call-ringtone.ts still defines a synth oscillator fallback");
    } else {
      fail(
        "call-ringtone.ts still defines a synth oscillator fallback",
        "The Web-Audio synth fallback must remain so the ringer still produces sound when autoplay is blocked or the asset fails to load.",
      );
    }

    // 6. Capacitor channel still references notification.wav.
    if (/sound:\s*"notification\.wav"/.test(ringtoneSrc)) {
      pass("LocalNotifications channel definition references notification.wav");
    } else {
      fail(
        "LocalNotifications channel definition references notification.wav",
        "ensureNativeChannel() must keep `sound: \"notification.wav\"` so the native ringer uses the bundled asset.",
      );
    }
  }

  // 7. MP3 companion exists (smaller, useful for previews / older browsers).
  const mp3 = await tryReadFile(RINGTONE_MP3_PATH);
  if (!mp3) {
    fail(
      "MP3 companion exists at client/public/sounds/notification.mp3",
      "Run `npx tsx scripts/generate-ringtone.ts` (with ffmpeg installed) to regenerate.",
    );
  } else if (mp3.length < 5_000) {
    fail(
      "MP3 companion is at least 5KB (real audio data, not a stub)",
      `Size: ${mp3.length} bytes`,
    );
  } else if (!(mp3[0] === 0xff && (mp3[1] & 0xe0) === 0xe0) && !(mp3.slice(0, 3).toString() === "ID3")) {
    fail(
      "MP3 companion has a valid MPEG / ID3 header",
      `First bytes: ${[...mp3.slice(0, 4)].map((b) => b.toString(16).padStart(2, "0")).join(" ")}`,
    );
  } else {
    pass("MP3 companion exists at client/public/sounds/notification.mp3 with a valid header");
  }

  // 8. Race-condition guard: the file ringer must consult an intent
  // token before falling back to synth, so a slow play() rejection
  // arriving after stopWebRingtone() cannot leak a ghost ringtone.
  if (!ringtoneSrc) {
    // Already failed above; nothing to add.
  } else if (/webRingtoneToken|intentToken/.test(ringtoneSrc) &&
             /intentToken\s*!==\s*webRingtoneToken/.test(ringtoneSrc)) {
    pass("file ringer guards synth fallback with an intent token (no race after stop)");
  } else {
    fail(
      "file ringer guards synth fallback with an intent token",
      "startFileRingtone()'s play().catch handler must check the live ring-intent token before calling startSynthRingtone(), otherwise a stale rejection can leak audio after stopCallRingtone().",
    );
  }

  // 9. State helper reflects the file-backed ringer too.
  if (ringtoneSrc && /isCallRingtoneActive[\s\S]{0,200}activeAudioElement/.test(ringtoneSrc)) {
    pass("isCallRingtoneActive() includes activeAudioElement in its truthiness check");
  } else if (ringtoneSrc) {
    fail(
      "isCallRingtoneActive() includes activeAudioElement in its truthiness check",
      "When the file-backed ringer is the active path, isCallRingtoneActive() must report true so callers see the correct ringing state.",
    );
  }

  // 10. Capacitor config plugin section still references notification.wav.
  const capacitorSrc = await tryReadText(CAPACITOR_CONFIG);
  if (!capacitorSrc) {
    fail(
      "capacitor.config.ts is readable",
      "File is missing — restore it or update this smoke's path constant.",
    );
  } else if (/sound:\s*'notification\.wav'/.test(capacitorSrc) || /sound:\s*"notification\.wav"/.test(capacitorSrc)) {
    pass("capacitor.config.ts LocalNotifications.sound is notification.wav");
  } else {
    fail(
      "capacitor.config.ts LocalNotifications.sound is notification.wav",
      "Restore `sound: 'notification.wav'` under plugins.LocalNotifications so backgrounded mobile rings use the branded asset.",
    );
  }

  if (failed > 0) {
    console.error(`[smoke:ringtone-asset] FAILED — ${failed} violation(s), ${passed} check(s) passed`);
    process.exitCode = 1;
  } else {
    console.log(`[smoke:ringtone-asset] OK — all ${passed} check(s) passed`);
  }
}

void main().catch((err) => {
  console.error("[smoke:ringtone-asset] FATAL", err);
  process.exitCode = 1;
});
