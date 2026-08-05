#!/usr/bin/env bash
# Visualizer launcher
# Starts server if not running, opens Chrome kiosk.

VIS_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT=8777
URL="http://127.0.0.1:${PORT}"
LOG_DIR=$(mktemp -d)
PID_FILE="$LOG_DIR/server.pid"

echo "=== Voice Visualizer Launcher ==="

# Check if port is already answering
if curl -s --max-time 1 "$URL/state" > /dev/null 2>&1; then
    echo "[launcher] Server already running on port $PORT"
else
    echo "[launcher] Starting visualizer server..."
    python3 "$VIS_DIR/server.py" > "$LOG_DIR/server.log" 2>&1 &
    SERVER_PID=$!
    echo "$SERVER_PID" > "$PID_FILE"
    echo "[launcher] Server PID: $SERVER_PID"
    # Wait for server to be ready
    for i in $(seq 1 20); do
        if curl -s --max-time 1 "$URL/state" > /dev/null 2>&1; then
            echo "[launcher] Server ready."
            break
        fi
        sleep 0.25
    done
fi

# Try Chrome kiosk mode
if command -v google-chrome &>/dev/null; then
    echo "[launcher] Opening Chrome kiosk..."
    google-chrome \
        --kiosk \
        --app="$URL" \
        --user-data-dir="$LOG_DIR/chrome-profile" \
        --disable-infobars \
        --no-first-run 2>/dev/null &
    echo "[launcher] Press Ctrl-C in this terminal to quit."
    echo "[launcher] Closing the Chrome window leaves the server warm."
    wait
elif command -v chromium-browser &>/dev/null; then
    echo "[launcher] Opening Chromium kiosk..."
    chromium-browser --kiosk "$URL" 2>/dev/null &
    wait
else
    echo "[launcher] Chrome/Chromium not found."
    echo "[launcher] Open manually: $URL"
    echo "[launcher] (Go fullscreen with F11)"
    # Open default browser
    if command -v xdg-open &>/dev/null; then
        xdg-open "$URL" 2>/dev/null
    elif command -v open &>/dev/null; then
        open "$URL" 2>/dev/null
    fi
    read -p "Press Enter to quit..."
fi

# Cleanup
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    kill "$OLD_PID" 2>/dev/null
fi
