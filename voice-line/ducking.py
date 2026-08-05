"""
Spotify ducking module.
While the assistant speaks, if Spotify is playing above volume 30%,
drop it to max(30, current * 0.6). Restore with 1.2s debounce.
Never launch Spotify if it is not running.
"""

import asyncio
import platform
import subprocess
import time


class SpotifyDucker:
    def __init__(self, threshold: int = 30, ratio: float = 0.6,
                 debounce: float = 1.2):
        self.threshold = threshold
        self.ratio = ratio
        self.debounce = debounce
        self._original_volume: int | None = None
        self._ducked = False
        self._restore_task: asyncio.Task | None = None
        self._system = platform.system()

    def duck(self) -> None:
        """Lower Spotify volume if it is playing above threshold."""
        if self._ducked:
            return

        current_vol = self._get_spotify_volume()
        if current_vol is None or current_vol <= self.threshold:
            return

        self._original_volume = current_vol
        new_vol = max(self.threshold, int(current_vol * self.ratio))
        self._set_spotify_volume(new_vol)
        self._ducked = True

        # Cancel any pending restore
        if self._restore_task and not self._restore_task.done():
            self._restore_task.cancel()

    def request_restore(self) -> None:
        """Request volume restore with debounce."""
        if self._restore_task and not self._restore_task.done():
            self._restore_task.cancel()
        self._restore_task = asyncio.create_task(self._restore_after_debounce())

    async def _restore_after_debounce(self) -> None:
        """Wait for debounce period, then restore volume."""
        try:
            await asyncio.sleep(self.debounce)
            self.restore()
        except asyncio.CancelledError:
            pass

    def restore(self) -> None:
        """Restore Spotify volume to original level."""
        if not self._ducked or self._original_volume is None:
            return
        self._set_spotify_volume(self._original_volume)
        self._original_volume = None
        self._ducked = False

    def _get_spotify_volume(self) -> int | None:
        """Get current Spotify volume. Returns None if not playing."""
        try:
            if self._system == "Darwin":
                return self._macos_get_volume()
            elif self._system == "Linux":
                return self._linux_get_volume()
            elif self._system == "Windows":
                return self._windows_get_volume()
        except Exception:
            pass
        return None

    def _set_spotify_volume(self, vol: int) -> None:
        """Set Spotify volume."""
        try:
            if self._system == "Darwin":
                self._macos_set_volume(vol)
            elif self._system == "Linux":
                self._linux_set_volume(vol)
            elif self._system == "Windows":
                self._windows_set_volume(vol)
        except Exception:
            pass

    # ── macOS (AppleScript) ──

    def _macos_get_volume(self) -> int | None:
        script = (
            'tell application "Spotify" to get sound volume'
        )
        result = subprocess.run(
            ["osascript", "-e", script],
            capture_output=True, text=True, timeout=3,
        )
        if result.returncode == 0:
            try:
                return int(result.stdout.strip())
            except ValueError:
                pass
        return None

    def _macos_set_volume(self, vol: int) -> None:
        script = (
            f'tell application "Spotify" to set sound volume to {vol}'
        )
        subprocess.run(
            ["osascript", "-e", script],
            capture_output=True, timeout=3,
        )

    # ── Linux (D-Bus / MPRIS) ──

    def _linux_get_volume(self) -> int | None:
        try:
            result = subprocess.run(
                ["dbus-send", "--print-reply", "--dest=org.mpris.MediaPlayer2.spotify",
                 "/org/mpris/MediaPlayer2",
                 "org.freedesktop.DBus.Properties.Get",
                 "string:org.mpris.MediaPlayer2.Player", "string:Volume"],
                capture_output=True, text=True, timeout=3,
            )
            if result.returncode == 0 and "double" in result.stdout:
                # Parse D-Bus double value
                for line in result.stdout.split("\n"):
                    if "double" in line:
                        val = float(line.split()[-1])
                        return int(val * 100)
        except Exception:
            pass
        return None

    def _linux_set_volume(self, vol: int) -> None:
        val = vol / 100.0
        try:
            subprocess.run(
                ["dbus-send", "--print-reply",
                 "--dest=org.mpris.MediaPlayer2.spotify",
                 "/org/mpris/MediaPlayer2",
                 "org.freedesktop.DBus.Properties.Set",
                 "string:org.mpris.MediaPlayer2.Player",
                 "string:Volume", "double:" + str(val)],
                capture_output=True, timeout=3,
            )
        except Exception:
            pass

    # ── Windows (stub) ──

    def _windows_get_volume(self) -> int | None:
        # Windows implementation via COM/WSH would go here
        return None

    def _windows_set_volume(self, vol: int) -> None:
        # Windows implementation via COM/WSH would go here
        pass
