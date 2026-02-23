#!/bin/bash
# Start WeSpeaker Speaker Verification service

set -e

cd "$(dirname "$0")"

# Environment variables
export HOST=${HOST:-0.0.0.0}
export PORT=${PORT:-8768}
export SV_MODEL=${SV_MODEL:-voxblink2_samresnet100_ft}
export SV_THRESHOLD=${SV_THRESHOLD:-0.6}
export SV_DEVICE=${SV_DEVICE:-cpu}
export SV_APPLY_VAD=${SV_APPLY_VAD:-true}
export SV_STORAGE_PATH=${SV_STORAGE_PATH:-./data/speakers.json}

echo "Starting WeSpeaker Speaker Verification service..."
echo "  Host: $HOST"
echo "  Port: $PORT"
echo "  Model: $SV_MODEL"
echo "  Threshold: $SV_THRESHOLD"
echo "  Device: $SV_DEVICE"
echo "  Apply VAD: $SV_APPLY_VAD"
echo "  Storage: $SV_STORAGE_PATH"

# Run server
uv run wespeaker-sv-server
