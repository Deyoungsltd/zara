import asyncio
import io
import os
import subprocess
import struct

import httpx
import numpy as np
import sounddevice as sd

import signals

KOKORO_URL = "http://localhost:8880/v1/audio/speech"
KOKORO_VOICE = "bm_lewis"
SAMPLE_RATE_TTS = 24000
ELEVENLABS_API_KEY = os.environ.get("ELEVENLABS_API_KEY", "")
ELEVENLABS_URL = "https://api.elevenlabs.io/v1/text-to-speech"


class Mouth:
    def __init__(self, use_elevenlabs: bool = False):
        self.use_elevenlabs = use_elevenlabs and bool(ELEVENLABS_API_KEY)
        self._queue: asyncio.Queue[str | None] = asyncio.Queue()
        self._playing = False
        self._stop_event = asyncio.Event()
        self._stream: sd.OutputStream | None = None
        self._sample_rate = SAMPLE_RATE_TTS

    async def start(self) -> None:
        """Start the playback stream."""
        self._stream = sd.OutputStream(
            samplerate=self._sample_rate,
            channels=1,
            dtype="int16",
        )
        self._stream.start()

    async def stop(self) -> None:
        """Stop and clean up."""
        self.interrupt()
        if self._stream:
            self._stream.stop()
            self._stream.close()
            self._stream = None

    def interrupt(self) -> None:
        """Clear the sentence queue and stop current playback immediately."""
        # Drain the queue
        while not self._queue.empty():
            try:
                self._queue.get_nowait()
            except asyncio.QueueEmpty:
                break
        self._stop_event.set()
        self._playing = False

    def feed(self, sentence: str | None) -> None:
        """Feed a sentence into the TTS queue. None signals quit."""
        self._queue.put_nowait(sentence)

    async def run(self) -> None:
        """Main loop: take sentences from queue, synthesize, play.
        
        Returns when None is received (quit signal).
        """
        while True:
            sentence = await self._queue.get()
            if sentence is None:
                break
            if not sentence:
                # Empty string = end of turn
                continue

            self._stop_event.clear()
            self._playing = True
            signals.write_state("speaking")

            try:
                audio = await self._synthesize(sentence)
                if audio is not None and not self._stop_event.is_set():
                    await self._play_audio(audio)
            except Exception:
                pass
            finally:
                self._playing = False

        signals.write_state("idle")

    async def _synthesize(self, text: str) -> np.ndarray | None:
        """Synthesize text to PCM audio via Kokoro or ElevenLabs."""
        if self.use_elevenlabs:
            return await self._synthesize_elevenlabs(text)
        return await self._synthesize_kokoro(text)

    async def _synthesize_kokoro(self, text: str) -> np.ndarray | None:
        """Synthesize via local Kokoro TTS server. Returns int16 PCM at 24kHz."""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    KOKORO_URL,
                    json={
                        "input": text,
                        "voice": KOKORO_VOICE,
                        "response_format": "pcm",
                    },
                )
                if resp.status_code != 200:
                    return None
                raw = resp.content
                # Convert raw bytes to int16 numpy array
                audio = np.frombuffer(raw, dtype=np.int16)
                # Feed waveform to signal bus (64 samples)
                if len(audio) > 64:
                    step = max(1, len(audio) // 64)
                    samples = audio[::step].astype(float).tolist()[:64]
                    signals.write_waveform(samples)
                return audio
        except Exception:
            return None

    async def _synthesize_elevenlabs(self, text: str) -> np.ndarray | None:
        """Synthesize via ElevenLabs API. Returns int16 PCM at 24kHz.
        """
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    ELEVENLABS_URL,
                    headers={
                        "xi-api-key": ELEVENLABS_API_KEY,
                        "Content-Type": "application/json",
                    },
                    json={
                        "text": text,
                        "model_id": "eleven_turbo_v2_5",
                        "voice_settings": {
                            "stability": 0.5,
                            "similarity_boost": 0.75,
                            "style": 0.0,
                        },
                    },
                )
                resp.raise_for_status()
                mp3_data = resp.content

            # Decode MP3 to PCM via ffmpeg
            pcm = await self._decode_mp3_to_pcm(mp3_data)
            if pcm is None:
                # Fallback to Kokoro
                return await self._synthesize_kokoro(text)

            # Resample to 24kHz if needed via ffmpeg
            pcm = await self._resample(pcm, 44100, SAMPLE_RATE_TTS)
            if pcm is not None:
                return pcm
            return None
        except Exception:
            # Fallback to Kokoro on any error
            return await self._synthesize_kokoro(text)

    async def _decode_mp3_to_pcm(self, mp3_data: bytes) -> np.ndarray | None:
        """Decode MP3 bytes to int16 PCM using ffmpeg."""
        try:
            proc = await asyncio.create_subprocess_exec(
                "ffmpeg", "-i", "pipe:0",
                "-f", "s16le", "-ar", "44100", "-ac", "1", "pipe:1",
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.DEVNULL,
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(mp3_data), timeout=15.0)
            if stdout:
                return np.frombuffer(stdout, dtype=np.int16)
        except Exception:
            pass
        return None

    async def _resample(self, pcm: np.ndarray, from_rate: int, to_rate: int) -> np.ndarray | None:
        """Resample PCM audio via ffmpeg."""
        try:
            proc = await asyncio.create_subprocess_exec(
                "ffmpeg", "-f", "s16le", "-ar", str(from_rate), "-ac", "1", "-i", "pipe:0",
                "-f", "s16le", "-ar", str(to_rate), "-ac", "1", "pipe:1",
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.DEVNULL,
            )
            raw = pcm.astype(np.int16).tobytes()
            stdout, _ = await asyncio.wait_for(proc.communicate(raw), timeout=15.0)
            if stdout:
                return np.frombuffer(stdout, dtype=np.int16)
        except Exception:
            pass
        return None

    async def _play_audio(self, audio: np.ndarray) -> None:
        """Play audio through sounddevice, checking for stop signal."""
        if self._stream is None:
            return
        chunk_size = 1024
        for i in range(0, len(audio), chunk_size):
            if self._stop_event.is_set():
                break
            chunk = audio[i : i + chunk_size]
            self._stream.write(chunk)
            # Feed waveform to signal bus
            if i % 2048 == 0 and len(chunk) > 0:
                samples = chunk.astype(float).tolist()
                if len(samples) > 64:
                    signals.write_waveform(samples[:64])


async def check_kokoro_server() -> bool:
    """Check if the Kokoro TTS server is responding."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get("http://localhost:8880/v1/voices")
            return resp.status_code == 200
    except Exception:
        return False
