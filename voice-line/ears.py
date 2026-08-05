"""
Ears module: audio capture and speech-to-text.

Capture modes:
  1. PTT (push-to-talk): external trigger opens/closes mic.
  2. Open-mic (--open-mic flag): webrtcvad endpointing, 240ms min speech.

Sends captured audio to local Whisper server on port 2022.
"""

import asyncio
import io
import time

import httpx
import numpy as np
import sounddevice as sd

WHISPER_URL = "http://localhost:2022/v1/audio/transcriptions"
SAMPLE_RATE = 16000
TAIL_SECONDS = 0.18


class Ears:
    def __init__(self, sample_rate: int = SAMPLE_RATE):
        self.sample_rate = sample_rate
        self._stream: sd.InputStream | None = None
        self._buffer: list[np.ndarray] = []
        self._recording = False

    def open_mic(self) -> None:
        """Open the microphone and start capturing audio."""
        if self._recording:
            return
        self._buffer = []
        self._stream = sd.InputStream(
            samplerate=self.sample_rate,
            channels=1,
            dtype="int16",
            blocksize=int(self.sample_rate * 0.03),  # 30ms blocks
        )
        self._stream.start()
        self._recording = True

    def close_mic(self) -> bytes | None:
        """Close the microphone and return the tail-buffered audio as raw bytes."""
        if not self._recording:
            return None
        self._recording = False
        # Wait for tail buffer
        tail_samples = int(self.sample_rate * TAIL_SECONDS)
        tail_frames = tail_samples // (int(self.sample_rate * 0.03))
        tail_buf: list[np.ndarray] = []
        if self._stream:
            try:
                for _ in range(max(1, tail_frames)):
                    data, _ = self._stream.read(int(self.sample_rate * 0.03))
                    tail_buf.append(data)
            except Exception:
                pass
            self._stream.stop()
            self._stream.close()
            self._stream = None

        all_chunks = self._buffer + tail_buf
        if not all_chunks:
            return None

        audio = np.concatenate(all_chunks, axis=0).flatten().astype(np.int16)
        # Convert int16 to bytes
        return audio.tobytes()

    def _audio_callback(self, indata: np.ndarray, frames: int,
                         time_info, status) -> None:
        """Callback for open-mic continuous capture."""
        if status:
            return
        self._buffer.append(indata.copy())

    def feed_block(self, block: np.ndarray) -> None:
        """Feed an audio block (from open-mic mode) into the buffer."""
        self._buffer.append(block.copy())

    async def transcribe(self, audio_bytes: bytes) -> str:
        """Send audio to local Whisper server and return transcription."""
        buf = io.BytesIO(audio_bytes)
        buf.name = "audio.wav"

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                WHISPER_URL,
                files={"file": ("audio.wav", buf, "audio/wav")},
                data={"model": "base", "language": "en"},
            )
            resp.raise_for_status()
            result = resp.json()
            text = result.get("text", "").strip()
            # Strip bracketed non-speech markers
            import re
            text = re.sub(r"\[\w+\]", "", text).strip()
            return text

    def get_level(self) -> float:
        """Get current audio level from the last captured block.
        """
        if self._buffer:
            last = self._buffer[-1].flatten().astype(np.float32)
            if len(last) > 0:
                return float(np.mean(np.abs(last)))
        return 0.0


async def check_whisper_server() -> bool:
    """Check if the Whisper server is responding."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get("http://localhost:2022/v1/models")
            return resp.status_code == 200
    except Exception:
        return False
