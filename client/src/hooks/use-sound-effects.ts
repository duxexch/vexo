/**
 * Sound Effects System
 * Provides UI sound effects for game actions, notifications, and rewards.
 * Uses Web Audio API for low-latency playback with graceful fallback.
 */

type SoundName =
  | 'click'
  | 'success'
  | 'error'
  | 'notification'
  | 'coin'
  | 'reward'
  | 'win'
  | 'lose'
  | 'draw'
  | 'move'
  | 'capture'
  | 'check'
  | 'countdown'
  | 'turn'
  | 'message'
  | 'challenge'
  | 'support'
  | 'chat_incoming'
  | 'transaction_alert'
  | 'security_alert'
  | 'promo_chime'
  | 'level_up'
  | 'pop_bubble'
  | 'urgent_alarm';

// Extended multi-note sound configs for unique, professional notification sounds
// Each uses carefully tuned frequencies, harmonics, and envelopes for distinctive tones
interface SoundConfig {
  notes: { freq: number; dur: number; type: OscillatorType; gain: number; delay?: number }[];
}

const SOUND_CONFIGS: Record<SoundName, SoundConfig> = {
  click: {
    notes: [{ freq: 800, dur: 0.04, type: 'sine', gain: 0.15 }],
  },
  success: {
    // Bright ascending triad — C E G
    notes: [
      { freq: 523, dur: 0.09, type: 'sine', gain: 0.2 },
      { freq: 659, dur: 0.09, type: 'sine', gain: 0.22, delay: 0.09 },
      { freq: 784, dur: 0.14, type: 'sine', gain: 0.24, delay: 0.18 },
    ],
  },
  error: {
    // Low buzzy descend
    notes: [
      { freq: 330, dur: 0.12, type: 'square', gain: 0.1 },
      { freq: 220, dur: 0.18, type: 'square', gain: 0.12, delay: 0.12 },
    ],
  },
  notification: {
    // Distinctive two-tone chime (like iOS)
    notes: [
      { freq: 880, dur: 0.06, type: 'sine', gain: 0.2 },
      { freq: 1320, dur: 0.1, type: 'sine', gain: 0.18, delay: 0.08 },
      { freq: 1100, dur: 0.14, type: 'sine', gain: 0.12, delay: 0.2 },
    ],
  },
  coin: {
    // Sparkling coin cascade
    notes: [
      { freq: 1400, dur: 0.04, type: 'sine', gain: 0.15 },
      { freq: 1800, dur: 0.04, type: 'sine', gain: 0.18, delay: 0.04 },
      { freq: 2200, dur: 0.04, type: 'sine', gain: 0.15, delay: 0.08 },
      { freq: 2600, dur: 0.06, type: 'sine', gain: 0.12, delay: 0.12 },
    ],
  },
  reward: {
    // Triumphant fanfare — C E G C5
    notes: [
      { freq: 523, dur: 0.1, type: 'sine', gain: 0.2 },
      { freq: 659, dur: 0.1, type: 'sine', gain: 0.2, delay: 0.1 },
      { freq: 784, dur: 0.1, type: 'sine', gain: 0.22, delay: 0.2 },
      { freq: 1047, dur: 0.22, type: 'sine', gain: 0.25, delay: 0.3 },
    ],
  },
  win: {
    // Celebratory ascending arpeggio with shimmer
    notes: [
      { freq: 523, dur: 0.1, type: 'sine', gain: 0.2 },
      { freq: 659, dur: 0.1, type: 'sine', gain: 0.2, delay: 0.08 },
      { freq: 784, dur: 0.1, type: 'sine', gain: 0.22, delay: 0.16 },
      { freq: 1047, dur: 0.12, type: 'sine', gain: 0.24, delay: 0.24 },
      { freq: 1319, dur: 0.2, type: 'sine', gain: 0.22, delay: 0.32 },
      // shimmer overlay
      { freq: 2093, dur: 0.3, type: 'sine', gain: 0.08, delay: 0.32 },
    ],
  },
  lose: {
    // Descending sad tone
    notes: [
      { freq: 400, dur: 0.15, type: 'triangle', gain: 0.15 },
      { freq: 350, dur: 0.15, type: 'triangle', gain: 0.13, delay: 0.15 },
      { freq: 300, dur: 0.15, type: 'triangle', gain: 0.11, delay: 0.3 },
      { freq: 200, dur: 0.3, type: 'triangle', gain: 0.1, delay: 0.45 },
    ],
  },
  draw: {
    notes: [
      { freq: 440, dur: 0.12, type: 'sine', gain: 0.15 },
      { freq: 440, dur: 0.15, type: 'sine', gain: 0.12, delay: 0.18 },
    ],
  },
  move: {
    notes: [{ freq: 600, dur: 0.04, type: 'sine', gain: 0.1 }],
  },
  capture: {
    notes: [
      { freq: 400, dur: 0.05, type: 'square', gain: 0.1 },
      { freq: 800, dur: 0.07, type: 'square', gain: 0.12, delay: 0.05 },
    ],
  },
  check: {
    notes: [
      { freq: 880, dur: 0.07, type: 'sine', gain: 0.18 },
      { freq: 660, dur: 0.07, type: 'sine', gain: 0.16, delay: 0.07 },
      { freq: 880, dur: 0.1, type: 'sine', gain: 0.2, delay: 0.14 },
    ],
  },
  countdown: {
    notes: [{ freq: 440, dur: 0.08, type: 'sine', gain: 0.2 }],
  },
  turn: {
    notes: [
      { freq: 660, dur: 0.05, type: 'sine', gain: 0.15 },
      { freq: 880, dur: 0.07, type: 'sine', gain: 0.17, delay: 0.05 },
    ],
  },
  message: {
    // WhatsApp-style incoming: two soft ascending tones with harmonic
    notes: [
      { freq: 740, dur: 0.06, type: 'sine', gain: 0.14 },
      { freq: 988, dur: 0.08, type: 'sine', gain: 0.12, delay: 0.07 },
      { freq: 1480, dur: 0.06, type: 'sine', gain: 0.06, delay: 0.07 },
    ],
  },
  challenge: {
    // Epic horn call — C G C5 G5
    notes: [
      { freq: 523, dur: 0.1, type: 'sawtooth', gain: 0.1 },
      { freq: 784, dur: 0.1, type: 'sawtooth', gain: 0.12, delay: 0.1 },
      { freq: 1047, dur: 0.14, type: 'sine', gain: 0.18, delay: 0.2 },
      { freq: 784, dur: 0.1, type: 'sine', gain: 0.14, delay: 0.34 },
    ],
  },
  support: {
    // Three-bell chime (support reply)
    notes: [
      { freq: 698, dur: 0.1, type: 'sine', gain: 0.2 },
      { freq: 880, dur: 0.1, type: 'sine', gain: 0.22, delay: 0.12 },
      { freq: 1175, dur: 0.16, type: 'sine', gain: 0.2, delay: 0.24 },
    ],
  },
  // ===== NEW DISTINCTIVE NOTIFICATION SOUNDS =====
  chat_incoming: {
    // Telegram-style: quick bright double-tap with overtone
    notes: [
      { freq: 1047, dur: 0.04, type: 'sine', gain: 0.2 },
      { freq: 1319, dur: 0.06, type: 'sine', gain: 0.18, delay: 0.06 },
      { freq: 1568, dur: 0.04, type: 'sine', gain: 0.1, delay: 0.06 },
    ],
  },
  transaction_alert: {
    // Cash register: metallic ding + sparkle cascade
    notes: [
      { freq: 2000, dur: 0.03, type: 'sine', gain: 0.2 },
      { freq: 3000, dur: 0.06, type: 'sine', gain: 0.15, delay: 0.03 },
      { freq: 1500, dur: 0.04, type: 'triangle', gain: 0.12, delay: 0.06 },
      { freq: 2500, dur: 0.15, type: 'sine', gain: 0.08, delay: 0.1 },
    ],
  },
  security_alert: {
    // Alarm: pulsing hi-lo with urgency
    notes: [
      { freq: 880, dur: 0.08, type: 'square', gain: 0.12 },
      { freq: 660, dur: 0.08, type: 'square', gain: 0.12, delay: 0.1 },
      { freq: 880, dur: 0.08, type: 'square', gain: 0.14, delay: 0.2 },
      { freq: 660, dur: 0.08, type: 'square', gain: 0.14, delay: 0.3 },
      { freq: 990, dur: 0.12, type: 'square', gain: 0.1, delay: 0.4 },
    ],
  },
  promo_chime: {
    // Gift unwrap: magical ascending sparkle
    notes: [
      { freq: 784, dur: 0.06, type: 'sine', gain: 0.15 },
      { freq: 988, dur: 0.06, type: 'sine', gain: 0.17, delay: 0.06 },
      { freq: 1175, dur: 0.06, type: 'sine', gain: 0.19, delay: 0.12 },
      { freq: 1568, dur: 0.06, type: 'sine', gain: 0.21, delay: 0.18 },
      { freq: 2093, dur: 0.12, type: 'sine', gain: 0.18, delay: 0.24 },
      { freq: 1568, dur: 0.08, type: 'sine', gain: 0.1, delay: 0.3 },
    ],
  },
  level_up: {
    // RPG level-up: triumphant rapid ascending scale
    notes: [
      { freq: 523, dur: 0.06, type: 'sine', gain: 0.2 },
      { freq: 587, dur: 0.06, type: 'sine', gain: 0.2, delay: 0.05 },
      { freq: 659, dur: 0.06, type: 'sine', gain: 0.22, delay: 0.1 },
      { freq: 784, dur: 0.06, type: 'sine', gain: 0.22, delay: 0.15 },
      { freq: 880, dur: 0.06, type: 'sine', gain: 0.24, delay: 0.2 },
      { freq: 1047, dur: 0.18, type: 'sine', gain: 0.26, delay: 0.25 },
      // chord
      { freq: 1319, dur: 0.18, type: 'sine', gain: 0.15, delay: 0.25 },
      { freq: 1568, dur: 0.18, type: 'sine', gain: 0.1, delay: 0.25 },
    ],
  },
  pop_bubble: {
    // Soft pop — friendly micro-interaction
    notes: [
      { freq: 1200, dur: 0.03, type: 'sine', gain: 0.18 },
      { freq: 600, dur: 0.05, type: 'sine', gain: 0.1, delay: 0.03 },
    ],
  },
  urgent_alarm: {
    // Triple-pulse emergency klaxon
    notes: [
      { freq: 1000, dur: 0.08, type: 'sawtooth', gain: 0.12 },
      { freq: 800, dur: 0.08, type: 'sawtooth', gain: 0.14, delay: 0.1 },
      { freq: 1000, dur: 0.08, type: 'sawtooth', gain: 0.12, delay: 0.2 },
      { freq: 800, dur: 0.08, type: 'sawtooth', gain: 0.14, delay: 0.3 },
      { freq: 1200, dur: 0.15, type: 'sawtooth', gain: 0.1, delay: 0.4 },
    ],
  },
};

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
    return audioContext;
  } catch {
    return null;
  }
}

function playTone(
  ctx: AudioContext,
  frequency: number,
  duration: number,
  type: OscillatorType,
  gain: number,
  startTime: number,
) {
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startTime);

  gainNode.gain.setValueAtTime(gain, startTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.01);
}

const STORAGE_KEY = 'vex_sound_settings';

interface SoundSettings {
  enabled: boolean;
  volume: number; // 0-1
}

function loadSettings(): SoundSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {}
  return { enabled: true, volume: 0.7 };
}

function saveSettings(settings: SoundSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {}
}

// Singleton state
let currentSettings = loadSettings();

/**
 * Play a named sound effect
 */
export function playSound(name: SoundName) {
  if (!currentSettings.enabled || currentSettings.volume === 0) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  const config = SOUND_CONFIGS[name];
  if (!config) return;

  const volumeMultiplier = currentSettings.volume;
  const baseTime = ctx.currentTime;

  for (const note of config.notes) {
    const startTime = baseTime + (note.delay || 0);
    playTone(ctx, note.freq, note.dur, note.type, note.gain * volumeMultiplier, startTime);
  }
}

/**
 * Get current sound settings
 */
export function getSoundSettings(): SoundSettings {
  return { ...currentSettings };
}

/**
 * Update sound settings
 */
export function setSoundSettings(updates: Partial<SoundSettings>) {
  currentSettings = { ...currentSettings, ...updates };
  saveSettings(currentSettings);
}

/**
 * Toggle sound on/off
 */
export function toggleSound(): boolean {
  currentSettings.enabled = !currentSettings.enabled;
  saveSettings(currentSettings);
  if (currentSettings.enabled) {
    playSound('click');
  }
  return currentSettings.enabled;
}

// React hook
import { useState, useCallback } from 'react';

export function useSoundEffects() {
  const [settings, setSettingsState] = useState<SoundSettings>(loadSettings);

  const play = useCallback((name: SoundName) => {
    playSound(name);
  }, []);

  const toggle = useCallback(() => {
    const newEnabled = toggleSound();
    setSettingsState(prev => ({ ...prev, enabled: newEnabled }));
    return newEnabled;
  }, []);

  const setVolume = useCallback((volume: number) => {
    const clamped = Math.max(0, Math.min(1, volume));
    setSoundSettings({ volume: clamped });
    setSettingsState(prev => ({ ...prev, volume: clamped }));
    playSound('click');
  }, []);

  const setEnabled = useCallback((enabled: boolean) => {
    setSoundSettings({ enabled });
    setSettingsState(prev => ({ ...prev, enabled }));
    if (enabled) playSound('click');
  }, []);

  return {
    play,
    toggle,
    setVolume,
    setEnabled,
    enabled: settings.enabled,
    volume: settings.volume,
  };
}
