"""
PTT (Push-To-Talk) module: global hotkey listener via pynput.

Rules:
- Holding the key opens the mic, releasing closes it with 0.18s tail.
- Taps < 250ms are ignored.
- OS key-repeat events are filtered with a held-state flag.
- Pressing while assistant is talking interrupts playback.

Also supports open-mic mode (--open-mic flag) with webrtcvad endpointing.
"""

import asyncio
import time
from collections import deque

import webrtcvad
from pynput import keyboard

from ears import Ears, SAMPLE_RATE
import signals

TAP_THRESHOLD = 0.25  # seconds, ignore shorter holds
VAD_AGGRESSIVENESS = 3  # 0-3, 3 = most aggressive (least sensitive)
MIN_SPEECH_MS = 240  # minimum speech duration in open-mic mode


class PTTController:
    def __init__(self, key: str = "alt_r",
                 on_press: callable | None = None,
                 on_release: callable | None = None,
                 on_interrupt: callable | None = None):
        self.key = key
        self._on_press = on_press
        self._on_release = on_release
        self._on_interrupt = on_interrupt
        self._held = False
        self._press_time: float = 0
        self._listener: keyboard.Listener | None = None
        self._loop: asyncio.AbstractEventLoop | None = None

    def start(self) -> None:
        """Start the global keyboard listener (blocking)."""
        self._listener = keyboard.Listener(
            on_press=self._on_key_press,
            on_release=self._on_key_release,
        )
        self._listener.start()

    def stop(self) -> None:
        """Stop the keyboard listener."""
        if self._listener:
            self._listener.stop()
            self._listener = None

    def _on_key_press(self, key) -> None:
        """Handle key press event. Filter key-repeat with held-state flag."""
        try:
            if key != keyboard.KeyCode.from_char(self.key) and \
               key != keyboard.Key[self.key]:
                return
        except (ValueError, AttributeError):
            return

        # Filter OS key-repeat: if already held, ignore
        if self._held:
            return

        self._held = True
        self._press_time = time.monotonic()

        # Call interrupt if assistant is speaking
        if self._on_interrupt:
            try:
                self._loop.call_soon_threadsafe(self._on_interrupt)
            except Exception:
                pass

        # Open mic after short delay to filter very short taps
        if self._on_press:
            try:
                self._loop.call_soon_threadsafe(self._on_press)
            except Exception:
                pass

    def _on_key_release(self, key) -> None:
        """Handle key release event."""
        try:
            if key != keyboard.KeyCode.from_char(self.key) and \
               key != keyboard.Key[self.key]:
                return
        except (ValueError, AttributeError):
            return

        if not self._held:
            return
        self._held = False

        # Check if hold was long enough (not a tap)
        held_duration = time.monotonic() - self._press_time
        if held_duration < TAP_THRESHOLD:
            return  # Ignore short taps

        if self._on_release:
            try:
                # Pass the audio bytes from the release handler
                self._loop.call_soon_threadsafe(self._on_release, held_duration)
            except Exception:
                pass

    def set_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        """Set the event loop for thread-safe callbacks."""
        self._loop = loop


class OpenMicController:
    """Open-mic mode using webrtcvad for voice activity detection."""

    def __init__(self, ears: Ears,
                 on_speech: callable | None = None):
        self.ears = ears
        self._on_speech = on_speech
        self._vad = webrtcvad.Vad(VAD_AGGRESSIVENESS)
        self._running = False
        self._loop: asyncio.AbstractEventLoop | None = None

    def set_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    async def run(self) -> None:
        """Run open-mic loop, detecting speech and feeding transcribed text."""
        self._running = True
        self.ears.open_mic()

        frame_duration = 30  # ms
        frame_size = int(self.ears.sample_rate * frame_duration / 1000)
        vad_buffer = deque()
        speech_frames = 0
        total_frames = 0
        in_speech = False
        speech_audio: list[bytes] = []

        while self._running:
            # Read a frame from the mic
            try:
                import sounddevice as sd
                with sd.InputStream(samplerate=self.ears.sample_rate,
                                   channels=1, dtype="int16",
                                   blocksize=frame_size) as stream:
                    data, _ = stream.read(frame_size)
                    raw = data.flatten().tobytes()
            except Exception:
                await asyncio.sleep(0.03)
                continue

            total_frames += 1
            is_speech = self._vad.is_speech(raw, self.ears.sample_rate)

            if is_speech:
                speech_frames += 1
                speech_audio.append(raw)

            if is_speech and not in_speech:
                # Speech started
                in_speech = True
                signals.write_state("listening")

            if not is_speech and in_speech:
                # Speech ended — check minimum duration
                in_speech = False
                speech_duration_ms = (speech_frames * frame_duration)
                if speech_duration_ms >= MIN_SPEECH_MS:
                    # Combine speech audio and transcribe
                    full_audio = b"".join(speech_audio)
                    signals.write_state("thinking")
                    if self._on_speech and self._loop:
                        try:
                            self._loop.call_soon_threadsafe(
                                self._on_speech, full_audio
                            )
                        except Exception:
                            pass
                speech_frames = 0
                speech_audio = []
                signals.write_state("idle")

            await asyncio.sleep(0.001)

        signals.write_state("idle")

    def stop(self) -> None:
        self._running = False
