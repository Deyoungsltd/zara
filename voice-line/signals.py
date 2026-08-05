"""
Signal bus for the voice-line system.
Writes state files to the project root so the visualizer can read them.
The bus must never crash the voice line — all errors are silently caught.
"""

import json
import time
import os
from pathlib import Path

BUS_DIR = Path(__file__).parent


def write_state(state: str) -> None:
    """Write the current voice state to .voice_state.
    
    States: idle, listening, thinking, speaking
    """
    try:
        (BUS_DIR / ".voice_state").write_text(state)
    except Exception:
        pass


def write_waveform(samples: list[float]) -> None:
    """Write waveform data to .voice_waveform.
    
    Also re-writes state to 'speaking' as a self-heal rule.
    """
    try:
        data = {"ts": time.time(), "samples": samples}
        (BUS_DIR / ".voice_waveform").write_text(json.dumps(data))
        # Self-heal: every waveform write also re-writes state to speaking
        write_state("speaking")
    except Exception:
        pass


def write_loading_pid(pid: int | None) -> None:
    """Create or remove the .voice_loading_pid file."""
    try:
        path = BUS_DIR / ".voice_loading_pid"
        if pid is not None:
            path.write_text(str(pid))
        elif path.exists():
            path.unlink()
    except Exception:
        pass


def clear_alert() -> None:
    """Remove .voice_alert if it exists."""
    try:
        path = BUS_DIR / ".voice_alert"
        if path.exists():
            path.unlink()
    except Exception:
        pass
