"""
Visualizer signal-bus server.
Reads voice-line bus files and serves /state as JSON.
Read-only: never writes bus files.
Standard library only.

Usage:
  python3 server.py              # Serve on 127.0.0.1:8777
  python3 server.py --mock     # Mock mode on port 8778
"""

import json
import os
import sys
import time
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

# Bus directory (voice-line project root)
BUS_DIR = Path(os.environ.get(
    "VOICE_LINE_BUS_DIR",
    str(Path(__file__).resolve().parent.parent / "voice-line"),
))

PORT = 8777
MOCK_PORT = 8778
MOCK_MODE = "--mock" in sys.argv


# ── Mock state machine for --mock mode ──
MOCK_STATES = ["idle", "listening", "thinking", "speaking", "idle"]
MOCK_STATE_DURATIONS = [3.0, 1.5, 2.0, 4.0, 3.0]  # seconds per state


class StateHandler(SimpleHTTPRequestHandler):
    """Serves the visualizer page and the /state JSON endpoint."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(Path(__file__).parent), **kwargs)
        self._mock_index = 0
        self._mock_start = time.time()

    def do_GET(self):
        if self.path == "/state":
            self._serve_state()
        else:
            # Serve index.html for root
            if self.path == "/":
                self.path = "/index.html"
            super().do_GET()

    def _serve_state(self):
        """Serve the current state as JSON."""
        if MOCK_MODE:
            state, level, alert = self._mock_state()
        else:
            state, level, alert = self._read_bus()

        payload = json.dumps({
            "state": state,
            "level": level,
            "alert": alert,
        })
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(payload.encode())

    def _read_bus(self) -> tuple[str, float, bool]:
        """Read voice-line signal bus files.
        
        Returns (state, level, alert).
        Stomp-tolerance: if waveform is fresh, report speaking.
        """
        state = "idle"
        level = 0.0
        alert = False

        # Read .voice_state
        state_file = BUS_DIR / ".voice_state"
        if state_file.exists():
            try:
                state = state_file.read_text().strip()
            except Exception:
                pass

        # Read .voice_waveform for level (if fresh)
        waveform_file = BUS_DIR / ".voice_waveform"
        if waveform_file.exists():
            try:
                data = json.loads(waveform_file.read_text())
                ts = data.get("ts", 0)
                samples = data.get("samples", [])
                # Fresh if less than 0.5 seconds old
                if time.time() - ts < 0.5 and samples:
                    level = sum(abs(s) for s in samples) / len(samples)
                    # Stomp-tolerance: fresh waveform overrides state
                    state = "speaking"
            except Exception:
                pass

        # Check .voice_alert
        alert_file = BUS_DIR / ".voice_alert"
        alert = alert_file.exists()

        return state, level, alert

    def _mock_state(self) -> tuple[str, float, bool]:
        """Generate a mock state for testing."""
        elapsed = time.time() - self._mock_start
        cumulative = 0.0
        idx = self._mock_index
        for i, dur in enumerate(MOCK_STATE_DURATIONS):
            if idx > i:
                cumulative += dur
                continue
            break

        phase_elapsed = elapsed - cumulative
        if phase_elapsed >= MOCK_STATE_DURATIONS[idx]:
            self._mock_index = (self._mock_index + 1) % len(MOCK_STATES)
            self._mock_start = time.time()
            idx = self._mock_index
            phase_elapsed = 0.0

        state = MOCK_STATES[idx]

        # Generate a level value based on state
        if state == "speaking":
            level = 0.3 + 0.4 * abs((time.time() % 1.0) - 0.5) * 2
        elif state == "listening":
            level = 0.05 + 0.1 * abs((time.time() % 0.5) - 0.25) * 4
        elif state == "thinking":
            level = 0.1 + 0.15 * abs((time.time() % 0.7) - 0.35) * 2.8
        else:
            level = 0.02 + 0.02 * abs((time.time() % 3.0) - 1.5) / 1.5

        return state, level, False

    def log_message(self, format, *args):
        # Suppress request logging
        pass


def main():
    port = MOCK_PORT if MOCK_MODE else PORT
    server = HTTPServer(("127.0.0.1", port), StateHandler)
    mode = "MOCK" if MOCK_MODE else "LIVE"
    print(f"[visualizer] {mode} server on http://127.0.0.1:{port}")
    print(f"[visualizer] Reading bus from: {BUS_DIR}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[visualizer] Stopped.")
        server.server_close()


if __name__ == "__main__":
    main()
