#!/usr/bin/env bash
# Deploy the OpenRouter proxy Edge Function to Supabase.
# Requires: supabase CLI (npm install -g supabase)
# Usage: ./deploy-edge-function.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if ! command -v supabase &>/dev/null; then
    echo "Installing Supabase CLI..."
    npm install -g supabase
fi

echo "=== Deploying Edge Function ==="

# Set OpenRouter API key as a Supabase secret
echo "Setting OPENROUTER_API_KEY secret..."
supabase secrets set OPENROUTER_API_KEY="$OPENROUTER_API_KEY" --project-ref jnizeiwlvylowlmwuctw 2>&1

echo "Deploying 'chat' function..."
supabase functions deploy chat --project-ref jnizeiwlvylowlmwuctw 2>&1

echo ""
echo "=== Done ==="
echo "Edge Function is live at:"
echo "  https://jnizeiwlvylowlmwuctw.supabase.co/functions/v1/chat"
