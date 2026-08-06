// Audio System for ZARA AI Assistant
// Handles sci-fi sound effects, microphone audio analysis (for visualization),
// barge-in detection, and speech synthesis cancellation.
// No external dependencies — uses only browser Web Audio & Speech APIs.

// ─── Shared AudioContext (lazy singleton) ────────────────────────────

let sharedAudioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
    sharedAudioContext = new AudioContext();
  }
  // Resume if the browser auto-suspended it (common after user inactivity)
  if (sharedAudioContext.state === 'suspended') {
    sharedAudioContext.resume();
  }
  return sharedAudioContext;
}

// ─── Sound Effects ───────────────────────────────────────────────────

interface SoundProfile {
  /** Start frequency in Hz */
  freqStart: number;
  /** End frequency in Hz */
  freqEnd: number;
  /** Duration in seconds */
  duration: number;
  /** Peak volume (0–1) */
  volume: number;
  /** Type of oscillator */
  type: OscillatorType;
  /** Attack time in seconds (fade-in) */
  attack: number;
  /** Decay time in seconds (fade-out) */
  decay: number;
}

const SOUND_PROFILES: Record<string, SoundProfile> = {
  send: {
    freqStart: 880,
    freqEnd: 440,
    duration: 0.15,
    volume: 0.3,
    type: 'sine',
    attack: 0.01,
    decay: 0.14,
  },
  receive: {
    freqStart: 440,
    freqEnd: 880,
    duration: 0.25,
    volume: 0.25,
    type: 'sine',
    attack: 0.02,
    decay: 0.23,
  },
  wake: {
    freqStart: 523,
    freqEnd: 784,
    duration: 0.3,
    volume: 0.35,
    type: 'sine',
    attack: 0.01,
    decay: 0.12,
  },
  error: {
    freqStart: 120,
    freqEnd: 100,
    duration: 0.3,
    volume: 0.3,
    type: 'sawtooth',
    attack: 0.01,
    decay: 0.29,
  },
  click: {
    freqStart: 1200,
    freqEnd: 900,
    duration: 0.06,
    volume: 0.15,
    type: 'square',
    attack: 0.005,
    decay: 0.055,
  },
  success: {
    freqStart: 523,
    freqEnd: 1047,
    duration: 0.2,
    volume: 0.3,
    type: 'sine',
    attack: 0.01,
    decay: 0.19,
  },
  notification: {
    freqStart: 880,
    freqEnd: 880,
    duration: 0.1,
    volume: 0.2,
    type: 'sine',
    attack: 0.005,
    decay: 0.095,
  },
  backchannel: {
    freqStart: 300,
    freqEnd: 350,
    duration: 0.08,
    volume: 0.15,
    type: 'sine',
    attack: 0.01,
    decay: 0.07,
  },
};

/**
 * Plays a short sci-fi sound effect using the Web Audio API.
 *
 * @param type — one of 'send' | 'receive' | 'wake' | 'error' | 'click' | 'success' | 'notification' | 'backchannel'
 */
export function playSoundEffect(type: 'send' | 'receive' | 'wake' | 'error' | 'click' | 'success' | 'notification' | 'backchannel'): void {
  if (typeof window === 'undefined') return;

  const profile = SOUND_PROFILES[type];
  if (!profile) return;

  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // Special handling for "wake" — play a double-tone (two rapid notes)
    if (type === 'wake') {
      playTone(ctx, now, { ...profile, freqStart: 523, freqEnd: 523 });
      playTone(ctx, now + 0.14, { ...profile, freqStart: 784, freqEnd: 784 });
      return;
    }

    // Special handling for "notification" — two-note chime
    if (type === 'notification') {
      playTone(ctx, now, { ...profile, freqStart: 880, freqEnd: 880 });
      playTone(ctx, now + 0.12, { ...profile, freqStart: 1100, freqEnd: 1100, volume: 0.15 });
      return;
    }

    playTone(ctx, now, profile);
  } catch {
    // Silently fail — audio is non-critical UX
  }
}

/** Internal helper — creates and schedules a single oscillator tone. */
function playTone(ctx: AudioContext, startTime: number, profile: SoundProfile): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = profile.type;
  osc.frequency.setValueAtTime(profile.freqStart, startTime);
  osc.frequency.linearRampToValueAtTime(profile.freqEnd, startTime + profile.duration);

  // Gain envelope: quick attack, then decay
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(profile.volume, startTime + profile.attack);
  gain.gain.linearRampToValueAtTime(0, startTime + profile.duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(startTime);
  osc.stop(startTime + profile.duration + 0.01);
}

// ─── Audio Analyser (Microphone Visualization) ───────────────────────

let micStream: MediaStream | null = null;

/**
 * Creates a Web Audio API AnalyserNode connected to the user's microphone.
 * Used for real-time audio level visualization.
 *
 * @returns AnalyserNode if microphone access is granted, null otherwise.
 */
export async function createAudioAnalyser(): Promise<AnalyserNode | null> {
  if (typeof window === 'undefined' || typeof navigator.mediaDevices?.getUserMedia !== 'function') {
    return null;
  }

  try {
    // Request microphone access
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });

    const ctx = getAudioContext();
    const source = ctx.createMediaStreamSource(micStream);

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;

    source.connect(analyser);
    // Do NOT connect analyser to destination — we don't want echo feedback

    return analyser;
  } catch {
    return null;
  }
}

/**
 * Returns the current audio level from an AnalyserNode as a value between 0 and 1.
 *
 * @param analyser — the AnalyserNode obtained from createAudioAnalyser()
 */
export function getAudioLevel(analyser: AnalyserNode): number {
  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteTimeDomainData(dataArray);

  // Calculate RMS (root mean square) of the audio signal
  let sum = 0;
  for (let i = 0; i < dataArray.length; i++) {
    const normalized = (dataArray[i] - 128) / 128; // center around 0
    sum += normalized * normalized;
  }
  const rms = Math.sqrt(sum / dataArray.length);

  // Scale to a 0–1 range with some amplification for quiet speech
  return Math.min(1, rms * 3);
}

// ─── Barge-In Detection ────────────────────────────────────────────────

/**
 * Monitors audio levels and fires a callback when the user starts speaking
 * (audio level exceeds the threshold for a sustained duration).
 *
 * @param analyser  — the AnalyserNode to monitor
 * @param onBargeIn — callback fired when sustained speech is detected
 * @param threshold — audio level (0–1) above which speech is considered active (default 0.15)
 * @returns a stop function to cancel the monitoring loop
 */
export function startBargeInDetection(
  analyser: AnalyserNode,
  onBargeIn: () => void,
  threshold: number = 0.15,
): () => void {
  let active = true;
  let highCount = 0;
  const requiredFrames = 6; // ~200ms at 30ms intervals

  const interval = setInterval(() => {
    if (!active) return;

    const level = getAudioLevel(analyser);

    if (level > threshold) {
      highCount++;
      if (highCount >= requiredFrames) {
        onBargeIn();
        // Reset after triggering so it can fire again if needed
        highCount = 0;
      }
    } else {
      highCount = Math.max(0, highCount - 1); // Decay slowly to avoid flicker
    }
  }, 30);

  // Return a cleanup function
  return () => {
    active = false;
    clearInterval(interval);
  };
}

// ─── Speech Synthesis Cancellation ────────────────────────────────────

/**
 * Cancels any currently playing speech synthesis output.
 * Useful for barge-in — when the user starts speaking while ZARA is responding.
 */
export function stopSpeaking(): void {
  if (typeof window === 'undefined') return;
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

// ─── Cleanup (call when the app unmounts) ─────────────────────────────

/**
 * Releases the microphone stream and closes the shared AudioContext.
 * Should be called when the component or page unmounts.
 */
export function cleanupAudioSystem(): void {
  if (micStream) {
    micStream.getTracks().forEach((track) => track.stop());
    micStream = null;
  }
  if (sharedAudioContext && sharedAudioContext.state !== 'closed') {
    sharedAudioContext.close().catch(() => {});
    sharedAudioContext = null;
  }
}
