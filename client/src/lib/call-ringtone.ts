import { Capacitor, registerPlugin } from "@capacitor/core";

const LocalNotifications = registerPlugin<any>("LocalNotifications");

const RING_NOTIFICATION_ID = 919191;
const NATIVE_RING_REPEAT_MS = 4500;
const NATIVE_RING_TITLE_FALLBACK = "Incoming call";
const NATIVE_RING_BODY_FALLBACK = "Tap to answer";

type OscillatorContext = {
    audioContext: AudioContext;
    masterGain: GainNode;
    intervalId: number;
    timeoutIds: number[];
    cancelled: boolean;
};

type NativeRingerHandle = {
    cancelled: boolean;
    intervalId: number | null;
};

let activeOscillator: OscillatorContext | null = null;
let activeNativeHandle: NativeRingerHandle | null = null;

function makeAudioContext(): AudioContext | null {
    try {
        const Ctor = (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
        if (!Ctor) return null;
        return new Ctor();
    } catch {
        return null;
    }
}

function playRingPattern(ctx: OscillatorContext): void {
    const { audioContext, masterGain } = ctx;
    if (ctx.cancelled) return;

    // Two-tone "ringing" pattern (1300Hz then 1100Hz, 0.4s each).
    const now = audioContext.currentTime;
    const tones: Array<{ freq: number; offset: number; duration: number }> = [
        { freq: 1300, offset: 0, duration: 0.4 },
        { freq: 1100, offset: 0.45, duration: 0.4 },
    ];

    for (const tone of tones) {
        try {
            const osc = audioContext.createOscillator();
            const gain = audioContext.createGain();
            osc.type = "sine";
            osc.frequency.setValueAtTime(tone.freq, now + tone.offset);
            gain.gain.setValueAtTime(0, now + tone.offset);
            gain.gain.linearRampToValueAtTime(0.65, now + tone.offset + 0.04);
            gain.gain.linearRampToValueAtTime(0, now + tone.offset + tone.duration);
            osc.connect(gain).connect(masterGain);
            osc.start(now + tone.offset);
            osc.stop(now + tone.offset + tone.duration + 0.05);
        } catch {
            // If oscillator scheduling fails we just skip this beat.
        }
    }
}

function stopWebRingtone(): void {
    if (!activeOscillator) return;
    activeOscillator.cancelled = true;
    if (activeOscillator.intervalId) {
        window.clearInterval(activeOscillator.intervalId);
    }
    activeOscillator.timeoutIds.forEach((id) => window.clearTimeout(id));
    try {
        activeOscillator.masterGain.gain.cancelScheduledValues(activeOscillator.audioContext.currentTime);
        activeOscillator.masterGain.gain.setValueAtTime(0, activeOscillator.audioContext.currentTime);
    } catch {
        // Ignore — context may already be closed.
    }
    try {
        void activeOscillator.audioContext.close();
    } catch {
        // Ignore — already closed.
    }
    activeOscillator = null;
}

function startWebRingtone(): void {
    if (activeOscillator) return;

    const audioContext = makeAudioContext();
    if (!audioContext) return;

    const masterGain = audioContext.createGain();
    masterGain.gain.value = 1.0;
    masterGain.connect(audioContext.destination);

    const ctx: OscillatorContext = {
        audioContext,
        masterGain,
        intervalId: 0,
        timeoutIds: [],
        cancelled: false,
    };

    if (audioContext.state === "suspended") {
        // Will resume on the next user gesture; the interval will retry.
        void audioContext.resume().catch(() => undefined);
    }

    playRingPattern(ctx);
    ctx.intervalId = window.setInterval(() => {
        if (ctx.cancelled) return;
        if (audioContext.state === "suspended") {
            void audioContext.resume().catch(() => undefined);
        }
        playRingPattern(ctx);
    }, 1300);

    activeOscillator = ctx;
}

async function scheduleNativeRingNotification(
    handle: NativeRingerHandle,
    options: { title: string; body: string },
): Promise<void> {
    if (handle.cancelled) return;
    if (!Capacitor.isPluginAvailable("LocalNotifications")) return;

    try {
        await LocalNotifications.schedule({
            notifications: [
                {
                    id: RING_NOTIFICATION_ID,
                    title: options.title,
                    body: options.body,
                    sound: undefined,
                    smallIcon: "ic_notification",
                    iconColor: "#f5a524",
                    ongoing: true,
                    autoCancel: false,
                    extra: {
                        category: "incoming_call",
                    },
                    channelId: "vex_incoming_calls",
                    actionTypeId: "VEX_INCOMING_CALL",
                    schedule: { at: new Date(Date.now() + 50) },
                },
            ],
        });
    } catch {
        // Best-effort — keep ringing even if scheduling fails.
    }
}

async function ensureNativeChannel(): Promise<void> {
    if (!Capacitor.isPluginAvailable("LocalNotifications")) return;
    try {
        await LocalNotifications.createChannel?.({
            id: "vex_incoming_calls",
            name: "Incoming Calls",
            description: "Incoming voice and video calls",
            importance: 5,
            visibility: 1,
            sound: "notification.wav",
            vibration: true,
            lights: true,
        });
    } catch {
        // Channel may already exist or plugin may not support it.
    }
}

async function startNativeRingtone(options: { title: string; body: string }): Promise<void> {
    if (activeNativeHandle) return;
    if (!Capacitor.isNativePlatform()) return;

    await ensureNativeChannel();

    const handle: NativeRingerHandle = { cancelled: false, intervalId: null };
    activeNativeHandle = handle;

    await scheduleNativeRingNotification(handle, options);

    handle.intervalId = window.setInterval(() => {
        if (handle.cancelled) return;
        void scheduleNativeRingNotification(handle, options);
    }, NATIVE_RING_REPEAT_MS);
}

async function stopNativeRingtone(): Promise<void> {
    if (!activeNativeHandle) return;
    activeNativeHandle.cancelled = true;
    if (activeNativeHandle.intervalId) {
        window.clearInterval(activeNativeHandle.intervalId);
    }
    activeNativeHandle = null;

    if (!Capacitor.isPluginAvailable("LocalNotifications")) return;
    try {
        await LocalNotifications.cancel?.({ notifications: [{ id: RING_NOTIFICATION_ID }] });
    } catch {
        // Ignore — best-effort cancellation.
    }
}

export interface CallRingtoneOptions {
    title?: string;
    body?: string;
    /** When true, start the loud native local-notification ringer in addition to the web tone. */
    includeNativeNotification?: boolean;
}

/**
 * Start a continuous ringing experience for an incoming or outgoing call.
 * Safe to call repeatedly — duplicate starts are ignored. Always call
 * `stopCallRingtone` once the call resolves.
 */
export function startCallRingtone(options: CallRingtoneOptions = {}): void {
    startWebRingtone();

    const wantsNative = options.includeNativeNotification !== false;
    if (wantsNative && Capacitor.isNativePlatform()) {
        void startNativeRingtone({
            title: options.title || NATIVE_RING_TITLE_FALLBACK,
            body: options.body || NATIVE_RING_BODY_FALLBACK,
        });
    }
}

export async function stopCallRingtone(): Promise<void> {
    stopWebRingtone();
    await stopNativeRingtone();
}

export function isCallRingtoneActive(): boolean {
    return !!activeOscillator || !!activeNativeHandle;
}
