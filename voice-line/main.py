import asyncio
import os
import signal as sig
import sys

from ears import Ears, check_whisper_server
from brain import Brain
from mouth import Mouth, check_kokoro_server
from ptt import PTTController, OpenMicController
from ducking import SpotifyDucker
import signals

OPEN_MIC_MODE = "--open-mic" in sys.argv
HOTKEY = os.environ.get("VOICE_LINE_HOTKEY", "alt_r")


class VoiceLine:
    """Main coordinator for the voice-line system."""

    def __init__(self):
        self.ears = Ears()
        self.brain = Brain(cwd=os.path.dirname(os.path.abspath(__file__)))
        self.mouth = Mouth(
            use_elevenlabs=bool(os.environ.get("ELEVENLABS_API_KEY"))
        )
        self.ducker = SpotifyDucker()
        self.sentence_queue: asyncio.Queue[str | None] = asyncio.Queue()
        self._shutdown = False
        self._mic_open = False

    async def check_services(self) -> bool:
        """Check that required local servers are running."""
        print("[voice-line] Checking required services...")

        whisper_ok = await check_whisper_server()
        if not whisper_ok:
            print(
                "[voice-line] ERROR: Whisper server not responding on port 2022.\n"
                "  Start it with:\n"
                "  ./whisper.cpp/server -m models/ggml-base.en.bin -p 2022"
            )
            return False
        print("[voice-line]  Whisper server: OK")

        kokoro_ok = await check_kokoro_server()
        if not kokoro_ok:
            print(
                "[voice-line] ERROR: Kokoro TTS server not responding on port 8880.\n"
                "  Start it with your Kokoro TTS server command."
            )
            return False
        print("[voice-line]  Kokoro TTS server: OK")

        return True

    async def handle_release(self, held_duration: float) -> None:
        """Called when the PTT key is released after a valid hold."""
        if not self._mic_open:
            return

        # Close mic and get audio
        audio_bytes = self.ears.close_mic()
        self._mic_open = False

        if audio_bytes is None or len(audio_bytes) < 800:
            signals.write_state("idle")
            return

        # Transcribe
        text = await self.ears.transcribe(audio_bytes)
        if not text:
            signals.write_state("idle")
            return

        print(f"[you] {text}")

        # Process through brain and feed mouth
        await self.brain.process_and_chunk(text, self.sentence_queue)
        signals.write_state("idle")
        self.ducker.request_restore()

    def handle_press(self) -> None:
        """Called when the PTT key is pressed."""
        if self._mic_open:
            return

        # Interrupt any current playback
        self.mouth.interrupt()
        self.ducker.restore()

        # Open mic
        self.ears.open_mic()
        self._mic_open = True
        signals.write_state("listening")

    def handle_interrupt(self) -> None:
        """Called when PTT is pressed while assistant is speaking."""
        self.mouth.interrupt()
        self.ducker.restore()
        signals.write_state("listening")

    async def handle_open_mic_speech(self, audio_bytes: bytes) -> None:
        """Handle speech detected in open-mic mode."""
        text = await self.ears.transcribe(audio_bytes)
        if not text:
            signals.write_state("idle")
            return

        print(f"[you] {text}")
        await self.brain.process_and_chunk(text, self.sentence_queue)
        signals.write_state("idle")

    async def mouth_loop(self) -> None:
        """Feed sentences from the brain to the mouth."""
        while not self._shutdown:
            sentence = await self.sentence_queue.get()
            if sentence is None:
                # Quit signal
                break
            if sentence == "":
                # End of turn
                signals.write_state("idle")
                self.ducker.request_restore()
                continue

            # Duck Spotify when about to speak
            self.ducker.duck()
            self.mouth.feed(sentence)

    async def typed_input_loop(self) -> None:
        """Background reader for typed input in the terminal."""
        loop = asyncio.get_event_loop()

        while not self._shutdown:
            try:
                # Use run_in_executor to avoid blocking the event loop
                line = await loop.run_in_executor(None, self._read_line)
                if line is None:
                    continue
                line = line.strip()
                if not line:
                    continue

                # Check quit
                if line.lower().rstrip(".!?") in {"goodbye", "end voice mode", "hang up", "quit"}:
                    await self.sentence_queue.put(None)
                    break

                # Interrupt if speaking
                self.mouth.interrupt()
                self.ducker.restore()

                print(f"[you] {line}")
                signals.write_state("thinking")
                await self.brain.process_and_chunk(line, self.sentence_queue)
                signals.write_state("idle")
            except EOFError:
                break
            except Exception:
                await asyncio.sleep(0.1)

    @staticmethod
    def _read_line() -> str | None:
        """Read a line from stdin, returning None on EOF."""
        try:
            import sys
            return sys.stdin.readline()
        except EOFError:
            return None

    async def run(self) -> None:
        """Main entry point for the voice-line system."""
        print("\n[voice-line] Starting Voice Line...")
        print(f"[voice-line] Mode: {'open-mic' if OPEN_MIC_MODE else 'push-to-talk (' + HOTKEY + ')'}")

        # Check services
        if not await self.check_services():
            return

        # Start brain (warmup)
        print("[voice-line] Warming up AI session...")
        await self.brain.start()
        print("[voice-line] AI session ready.")

        # Start mouth
        await self.mouth.start()

        signals.write_state("idle")
        print("[voice-line] Ready. Hold " + HOTKEY + " to talk (or type).")
        print("[voice-line] Say \"goodbye\" or Ctrl-C to exit.\n")

        loop = asyncio.get_event_loop()

        # Set up Ctrl-C handler
        def handle_sigint():
            if not self._shutdown:
                self._shutdown = True
                asyncio.ensure_future(self._shutdown_async())

        loop.add_signal_handler(sig.SIGINT, handle_sigint)

        if OPEN_MIC_MODE:
            # Open-mic mode
            open_mic = OpenMicController(
                ears=self.ears,
                on_speech=self.handle_open_mic_speech,
            )
            open_mic.set_loop(loop)

            tasks = [
                asyncio.create_task(self.mouth_loop()),
                asyncio.create_task(self.typed_input_loop()),
                asyncio.create_task(open_mic.run()),
            ]
        else:
            # PTT mode
            ptt = PTTController(
                key=HOTKEY,
                on_press=self.handle_press,
                on_release=self.handle_release,
                on_interrupt=self.handle_interrupt,
            )
            ptt.set_loop(loop)
            ptt.start()

            tasks = [
                asyncio.create_task(self.mouth_loop()),
                asyncio.create_task(self.typed_input_loop()),
            ]

        try:
            # Wait for quit signal or shutdown
            done, pending = await asyncio.wait(
                tasks, return_when=asyncio.FIRST_COMPLETED
            )
            # Cancel remaining tasks
            for t in pending:
                t.cancel()
                try:
                    await t
                except asyncio.CancelledError:
                    pass
        finally:
            if not OPEN_MIC_MODE:
                ptt.stop()
            await self.brain.stop()
            await self.mouth.stop()
            signals.write_state("idle")
            print("\n[voice-line] Session ended.")

    async def _shutdown_async(self) -> None:
        """Graceful shutdown."""
        self._shutdown = True
        await self.sentence_queue.put(None)


if __name__ == "__main__":
    vl = VoiceLine()
    asyncio.run(vl.run())
