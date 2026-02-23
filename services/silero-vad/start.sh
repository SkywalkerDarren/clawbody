#!/bin/bash
# Start Silero VAD service

set -e

cd "$(dirname "$0")"

# Environment variables
export HOST=${HOST:-0.0.0.0}
export PORT=${PORT:-8767}
export VAD_THRESHOLD=${VAD_THRESHOLD:-0.5}
export MIN_SPEECH_MS=${MIN_SPEECH_MS:-250}
export MIN_SILENCE_MS=${MIN_SILENCE_MS:-500}
export SPEECH_PAD_MS=${SPEECH_PAD_MS:-300}

echo "Starting Silero VAD service..."
echo "  Host: $HOST"
echo "  Port: $PORT"
echo "  Threshold: $VAD_THRESHOLD"
echo "  Min Speech: ${MIN_SPEECH_MS}ms"
echo "  Min Silence: ${MIN_SILENCE_MS}ms"

# Run server
uv run silero-vad-server
