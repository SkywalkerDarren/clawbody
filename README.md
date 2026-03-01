# ClawBody

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-%3E%3D9-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

The "body" component for [OpenClaw AI](https://github.com/openclaw) - providing physical interaction capabilities for a remote AI brain.

## Overview

ClawBody gives your AI a physical presence. While the AI brain runs remotely, ClawBody provides the sensory and output capabilities on the local machine.

| Body Part | Capability | Function |
|-----------|------------|----------|
| Face | Live2D | Desktop companion with expressions and lip-sync |
| Mouth | TTS | Text-to-speech synthesis (Qwen3-TTS, Edge-TTS) |
| Ears | STT | Speech-to-text recognition (Qwen3-ASR, streaming) |
| Ears | VAD | Voice activity detection (Silero VAD) |
| Voice ID | SV | Speaker verification (WeSpeaker) |
| Eyes | Vision | Screen capture |
| Nervous System | Gateway | Brain-Body communication |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        OpenClaw Brain                           │
│                    (Remote Device / Cloud)                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP Webhook
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      ClawBody Gateway                           │
│              (Capability Registry + Pipeline + State)           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│    Mic → VAD → SV → STT → OpenClaw → TTS → Live2D (lip-sync)    │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐         │
│  │ Live2D │ │  TTS   │ │  STT   │ │  VAD   │ │   SV   │         │
│  │ (Face) │ │(Mouth) │ │ (Ears) │ │ (Ears) │ │(Voice) │         │
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘         │
│      │          │          │          │          │              │
│      ▼          ▼          ▼          ▼          ▼              │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌─────────┐        │
│  │Electron│ │ Qwen3  │ │ Qwen3  │ │ Silero │ │WeSpeaker│        │
│  │+ PIXI  │ │  TTS   │ │  ASR   │ │  VAD   │ │  ONNX   │        │
│  └────────┘ └────────┘ └────────┘ └────────┘ └─────────┘        │
└─────────────────────────────────────────────────────────────────┘
```

## Features

- **Voice Pipeline** - VAD → Speaker Verification → STT → AI → TTS (hands-free)
- **Speaker Verification** - Only respond to registered voices (WeSpeaker ONNX)
- **Live2D Desktop Companion** - Animated character with expressions and lip-sync
- **Multi-Provider TTS** - Qwen3-TTS (local GPU), Edge-TTS (cloud)
- **Streaming STT** - Real-time transcription with Qwen3-ASR
- **Web Dashboard** - Monitor and control at http://localhost:4000/dashboard.html
- **HTTP/WebSocket/SSE** - REST API and real-time events

## Quick Start

### Prerequisites

- Node.js >= 20, pnpm >= 9
- Python >= 3.12, uv
- CUDA GPU (for Qwen TTS/STT/SV models)
- tmux (for start script)

### Installation

```bash
git clone https://github.com/SkywalkerDarren/clawbody.git
cd clawbody

# Install Node.js dependencies
pnpm install
pnpm build

# Install Python services
cd services/qwen3-tts && uv sync && cd ../..
cd services/qwen3-stt && uv sync && cd ../..
cd services/silero-vad && uv sync && cd ../..
cd services/wespeaker-sv && uv sync && cd ../..
```

### Running

```bash
# Start all services (tmux)
./scripts/start.sh

# Wait for services to be ready
./scripts/start.sh --wait

# Check service status
./scripts/start.sh --check

# Stop all services
./scripts/start.sh --stop
```

### Register Your Voice

```bash
# Register speaker for voice verification
uv run --with sounddevice --with numpy --with httpx python scripts/enroll_speaker.py
```

### Test Voice Pipeline

```bash
# Test full pipeline: VAD → SV → STT → OpenClaw → TTS
uv run --with sounddevice --with numpy --with httpx python scripts/test_vad_pipeline.py
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| Gateway | 4000 | HTTP/WS/SSE API |
| gRPC | 50051 | gRPC server |
| TTS | 8765 | Qwen3-TTS |
| STT | 8766 | Qwen3-ASR |
| VAD | 8767 | Silero VAD |
| SV | 8768 | WeSpeaker SV |

## Dashboard

Access the web dashboard at: http://localhost:4000/dashboard/

Features:
- Pipeline enable/disable control
- Service status monitoring
- Speaker management
- TTS testing
- Real-time event log

Development:
```bash
cd apps/dashboard
pnpm dev      # Dev server at :5173 (proxies to :4000)
pnpm build    # Build to packages/gateway/public/dashboard/
```

## Configuration

Copy `config/default.yaml` to `config/local.yaml` and customize:

```yaml
# OpenClaw integration
openclaw:
  webhookUrl: "http://localhost:18789"
  sessionKey: "voice:default"

# Capabilities
capabilities:
  tts:
    providers:
      qwen:
        baseUrl: "http://localhost:8765"
  stt:
    providers:
      qwen:
        baseUrl: "http://localhost:8766"
```

## Project Structure

```
clawbody/
├── packages/
│   ├── core/              # Core library
│   └── gateway/           # Gateway server
├── capabilities/
│   ├── live2d/            # Live2D capability
│   ├── tts/               # TTS capability
│   ├── stt/               # STT capability
│   ├── vad/               # VAD capability
│   └── speaker-verification/  # SV capability
├── services/
│   ├── qwen3-tts/         # Qwen TTS (Python)
│   ├── qwen3-stt/         # Qwen STT (Python)
│   ├── silero-vad/        # Silero VAD (Python)
│   └── wespeaker-sv/      # WeSpeaker SV (Python)
├── apps/
│   └── desktop/           # Electron desktop
├── scripts/
│   ├── start.sh           # Service management
│   ├── enroll_speaker.py  # Voice registration
│   └── test_vad_pipeline.py  # Pipeline test
└── config/                # Configuration
```

## API Reference

### Pipeline Control

```bash
# Get pipeline status
curl http://localhost:4000/api/pipeline

# Enable pipeline
curl -X POST http://localhost:4000/api/pipeline/enable

# Disable pipeline
curl -X POST http://localhost:4000/api/pipeline/disable
```

### Diagnostics

```bash
# Get service diagnostics
curl http://localhost:4000/api/diagnostics
```

### TTS

```bash
# Speak text
curl -X POST http://localhost:4000/api/speak \
  -H "Content-Type: application/json" \
  -d '{"text": "你好世界"}'
```

## License

MIT
