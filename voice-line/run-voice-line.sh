#!/usr/bin/env bash
# Voice Line launcher
# Checks dependencies and starts the voice assistant.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== Voice Line Launcher ==="
echo ""

# Check Python 3.12+
if ! command -v python3 &>/dev/null; then
    echo "ERROR: python3 not found. Install Python 3.12+."
    exit 1
fi

PYVER=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
if [ "$(printf '%s\n' "3.12" "$PYVER" | sort -V | head -n1)" != "3.12" ]; then
    echo "ERROR: Python 3.12+ required, found $PYVER"
    exit 1
fi
echo "[check] Python $PYVER: OK"

# Check ffmpeg
if ! command -v ffmpeg &>/dev/null; then
    echo "ERROR: ffmpeg not found. Install it via your package manager."
    exit 1
fi
echo "[check] ffmpeg: OK"

# Check/install uv
if ! command -v uv &>/dev/null; then
    echo "[setup] Installing uv..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
    export PATH="$HOME/.local/bin:$PATH"
fi
echo "[check] uv: OK"

# Load .env file if it exists
if [ -f ".env" ]; then
    echo "[setup] Loading .env..."
    set -a
    source .env
    set +a
fi

# Sync dependencies
if [ ! -d ".venv" ]; then
    echo "[setup] Creating virtual environment..."
    uv venv --python 3.12
fi
echo "[setup] Syncing dependencies..."
uv pip install -e . 2>/dev/null || uv sync

# Activate venv
source .venv/bin/activate

# Check required env vars (warnings only, not hard failures)
echo ""
echo "[check] Environment variables..."
if [ -z "$OPENROUTER_API_KEY" ]; then
    echo "  WARNING: OPENROUTER_API_KEY not set. AI will not work."
else
    echo "  OPENROUTER_API_KEY: set"
fi
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_ANON_KEY" ]; then
    echo "  SUPABASE_URL / SUPABASE_ANON_KEY: not set (DB disabled)"
else
    echo "  SUPABASE: configured"
fi

# Check Whisper server
echo ""
echo "[check] Whisper server on port 2022..."
if curl -s --max-time 3 http://localhost:2022/v1/models > /dev/null 2>&1; then
    echo "  Whisper server: OK"
else
    echo "  Whisper server: NOT FOUND"
    echo "  Start it with:"
    echo "    ./whisper.cpp/server -m models/ggml-base.en.bin -p 2022"
    echo "  Download models from: https://huggingface.co/ggerganov/whisper.cpp"
fi

# Check Kokoro TTS server
echo "[check] Kokoro TTS server on port 8880..."
if curl -s --max-time 3 http://localhost:8880/v1/voices > /dev/null 2>&1; then
    echo "  Kokoro TTS server: OK"
else
    echo "  Kokoro TTS server: NOT FOUND"
    echo "  Start your Kokoro TTS server on port 8880."
fi

echo ""
echo "=== Starting Voice Line ==="
echo ""
python3 main.py "$@"