/**
 * generate-ringtone.ts
 *
 * Generates a real, owned/royalty-free PCM WAV ringtone asset for VEX
 * incoming calls (Task #46). Run via:
 *
 *   npx tsx scripts/generate-ringtone.ts
 *
 * Output: client/public/sounds/notification.wav
 *
 * Design goals:
 *   - Pleasant musical "ding-ding" chime (G5 + B5, then E5 + G5) with a
 *     short tail of silence so the audio loops cleanly.
 *   - Slight harmonic richness (sine + 2nd / 3rd harmonics) to avoid the
 *     robotic feel of the previous Web-Audio two-oscillator pattern.
 *   - 16-bit PCM, 44.1kHz, mono — small enough (~210KB) to ship in the
 *     client bundle, loud enough to ring clearly on phone speakers.
 *   - Zero cross-faded boundaries so HTMLAudioElement `loop = true` does
 *     not produce a click between iterations.
 *
 * The output is fully synthesised in this file — there is no third-party
 * audio source, so the asset is owned by the project and royalty-free.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");
const OUTPUT_PATH = path.join(REPO_ROOT, "client/public/sounds/notification.wav");

const SAMPLE_RATE = 44100;
const NUM_CHANNELS = 1;
const BITS_PER_SAMPLE = 16;
const LOOP_SECONDS = 2.4;

function adsr(t: number, dur: number, attack = 0.015, decay = 0.12, sustain = 0.55, release = 0.35): number {
  if (t < 0 || t >= dur) return 0;
  if (t < attack) return t / attack;
  if (t < attack + decay) return 1 - (1 - sustain) * ((t - attack) / decay);
  if (t < dur - release) return sustain;
  return sustain * (1 - (t - (dur - release)) / release);
}

function addTone(samples: Float32Array, startSec: number, durSec: number, freq: number, amp: number): void {
  const startIdx = Math.floor(startSec * SAMPLE_RATE);
  const endIdx = Math.min(samples.length, startIdx + Math.floor(durSec * SAMPLE_RATE));
  for (let i = startIdx; i < endIdx; i += 1) {
    const t = (i - startIdx) / SAMPLE_RATE;
    const env = adsr(t, durSec);
    const w = 2 * Math.PI * freq * t;
    // Fundamental + 2nd + 3rd harmonics for a warm bell timbre.
    const sample = Math.sin(w) * 0.7 + Math.sin(2 * w) * 0.2 + Math.sin(3 * w) * 0.1;
    samples[i] += sample * env * amp;
  }
}

function encodeWav(samples: Int16Array): Buffer {
  const dataSize = samples.length * (BITS_PER_SAMPLE / 8);
  const buf = Buffer.alloc(44 + dataSize);
  let off = 0;
  buf.write("RIFF", off);
  off += 4;
  buf.writeUInt32LE(36 + dataSize, off);
  off += 4;
  buf.write("WAVE", off);
  off += 4;
  buf.write("fmt ", off);
  off += 4;
  buf.writeUInt32LE(16, off);
  off += 4; // PCM chunk size
  buf.writeUInt16LE(1, off);
  off += 2; // PCM format
  buf.writeUInt16LE(NUM_CHANNELS, off);
  off += 2;
  buf.writeUInt32LE(SAMPLE_RATE, off);
  off += 4;
  buf.writeUInt32LE((SAMPLE_RATE * NUM_CHANNELS * BITS_PER_SAMPLE) / 8, off);
  off += 4;
  buf.writeUInt16LE((NUM_CHANNELS * BITS_PER_SAMPLE) / 8, off);
  off += 2;
  buf.writeUInt16LE(BITS_PER_SAMPLE, off);
  off += 2;
  buf.write("data", off);
  off += 4;
  buf.writeUInt32LE(dataSize, off);
  off += 4;
  for (let i = 0; i < samples.length; i += 1) {
    buf.writeInt16LE(samples[i], off);
    off += 2;
  }
  return buf;
}

async function main(): Promise<void> {
  const totalSamples = Math.floor(LOOP_SECONDS * SAMPLE_RATE);
  const samples = new Float32Array(totalSamples);

  // Two musical chimes followed by ~1.3s of silence so the loop has a
  // breathing pause between iterations (matches WhatsApp's cadence).
  // Notes: G5=783.99Hz, B5=987.77Hz, E5=659.25Hz.
  const amp = 0.45;
  addTone(samples, 0.00, 0.55, 783.99, amp);       // G5
  addTone(samples, 0.00, 0.55, 987.77, amp * 0.7); // B5 (overlay → major-third interval)
  addTone(samples, 0.55, 0.55, 659.25, amp);       // E5
  addTone(samples, 0.55, 0.55, 783.99, amp * 0.7); // G5 (overlay)

  // Normalize to ~0.95 peak so we don't clip on int16 conversion.
  let peak = 0;
  for (let i = 0; i < totalSamples; i += 1) {
    const a = Math.abs(samples[i]);
    if (a > peak) peak = a;
  }
  const normalize = peak > 0 ? Math.min(1, 0.95 / peak) : 1;

  const out = new Int16Array(totalSamples);
  for (let i = 0; i < totalSamples; i += 1) {
    const v = Math.max(-1, Math.min(1, samples[i] * normalize));
    out[i] = Math.round(v * 32767);
  }

  // Force the very first and very last sample to 0 so the loop seam is
  // a true zero-crossing — eliminates the click that browsers otherwise
  // produce when wrapping a non-zero PCM frame back to the start.
  out[0] = 0;
  out[totalSamples - 1] = 0;

  const wav = encodeWav(out);
  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, wav);

  const sizeKb = (wav.length / 1024).toFixed(1);
  console.log(`[generate-ringtone] wrote ${path.relative(REPO_ROOT, OUTPUT_PATH)} (${sizeKb} KB, ${LOOP_SECONDS.toFixed(2)}s loop)`);
}

void main().catch((err) => {
  console.error("[generate-ringtone] FATAL", err);
  process.exitCode = 1;
});
