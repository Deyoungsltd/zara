// Wake Word Detection System for ZARA AI Assistant
// Uses the browser's Web Speech API (SpeechRecognition) to detect
// "hello zara" and "hey zara" as wake phrases.

type WakeCallback = () => void;
type InterimCallback = (text: string) => void;
type ErrorCallback = (error: string) => void;

// Union type for the browser SpeechRecognition API (varies across browsers)
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

// Guard to check if the SpeechRecognition API is available in the current browser
function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as Record<string, unknown>;
  return (
    (win.SpeechRecognition as (new () => SpeechRecognitionLike) | undefined) ??
    (win.webkitSpeechRecognition as (new () => SpeechRecognitionLike) | undefined) ??
    null
  );
}

/** Maps SpeechRecognition error event codes to user-friendly messages. */
function friendlyErrorMessage(event: SpeechRecognitionErrorEvent): string {
  const messages: Record<string, string> = {
    'no-speech': 'No speech was detected. Please try again.',
    'audio-capture': 'Microphone not found. Please connect a microphone.',
    'not-allowed': 'Microphone access was denied. Please allow microphone permissions.',
    network: 'A network error occurred during speech recognition.',
    aborted: 'Speech recognition was cancelled.',
    'service-not-allowed': 'Speech recognition is not allowed in this context.',
  };
  return messages[event.error] ?? `Speech recognition error: ${event.error}`;
}

export class WakeWordDetector {
  private recognition: SpeechRecognitionLike | null = null;
  private _isListening = false;
  private _destroyed = false;

  // Callbacks held as instance fields so we can reference them in event handlers
  private onWake: WakeCallback = () => {};
  private onInterim: InterimCallback = (text: string) => { void text; };
  private onError: ErrorCallback = (_err: string) => {};

  // ─── Public API ────────────────────────────────────────────────────

  /**
   * Starts continuous speech recognition listening.
   *
   * @param onWake   — called when "hello zara" or "hey zara" is detected
   * @param onInterim — called with every interim/final transcript for visual feedback
   * @param onError  — called with a user-friendly error string
   */
  start(onWake: WakeCallback, onInterim: InterimCallback, onError: ErrorCallback): void {
    if (this._destroyed) {
      onError('Wake word detector has been destroyed.');
      return;
    }

    const SpeechRecognitionCtor = getSpeechRecognition();
    if (!SpeechRecognitionCtor) {
      onError(
        'Speech recognition is not supported in this browser. Please use Chrome or Edge.',
      );
      return;
    }

    // Store callbacks
    this.onWake = onWake;
    this.onInterim = onInterim;
    this.onError = onError;

    // Create a fresh recognition instance each time we start
    this.recognition = new SpeechRecognitionCtor();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';
    this.recognition.maxAlternatives = 1;

    // ── Result handler ──────────────────────────────────────────────
    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      if (this._destroyed) return;

      // Build the full transcript from all results
      let fullTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;

        if (result.isFinal) {
          fullTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      // Combine final + interim for real-time visual feedback
      const displayText = (fullTranscript + interimTranscript).trim();
      this.onInterim(displayText);

      // Check for wake phrases (case-insensitive)
      const lower = displayText.toLowerCase();
      if (lower.includes('hello zara') || lower.includes('hey zara')) {
        this.onWake();
      }
    };

    // ── Error handler ────────────────────────────────────────────────
    this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (this._destroyed) return;
      this.onError(friendlyErrorMessage(event));
    };

    // ── End handler — auto-restart if we're still supposed to listen ──
    this.recognition.onend = () => {
      if (this._destroyed) return;
      // Browsers stop recognition after a period of silence;
      // auto-restart to keep it going as long as we haven't explicitly stopped.
      if (this._isListening && this.recognition) {
        try {
          this.recognition.start();
        } catch {
          // If start fails (e.g. already started), silently ignore
        }
      }
    };

    // ── Start listening ──────────────────────────────────────────────
    this._isListening = true;
    try {
      this.recognition.start();
    } catch {
      this.onError('Failed to start speech recognition.');
      this._isListening = false;
    }
  }

  /** Stops listening. Can be restarted with `start()`. */
  stop(): void {
    this._isListening = false;
    try {
      this.recognition?.stop();
    } catch {
      // Ignore errors during stop
    }
  }

  /** Whether the detector is actively listening. */
  isListening(): boolean {
    return this._isListening;
  }

  /** Permanently destroys the detector — cannot be restarted after this. */
  destroy(): void {
    this._destroyed = true;
    this._isListening = false;
    try {
      this.recognition?.abort();
    } catch {
      // Ignore errors during abort
    }
    this.recognition = null;
  }
}
