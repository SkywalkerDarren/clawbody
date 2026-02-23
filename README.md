# ClawBody

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-%3E%3D9-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![gRPC](https://img.shields.io/badge/gRPC-Protocol-244c5a?logo=grpc&logoColor=white)](https://grpc.io/)

The "body" component for [OpenClaw AI](https://github.com/openclaw) - providing physical interaction capabilities for a remote AI brain.

[English](./README.md) | [中文](./README.zh.md)

## Overview

ClawBody gives your AI a physical presence. While the AI brain runs remotely, ClawBody provides the sensory and output capabilities on the local machine.

| Body Part | Capability | Function |
|-----------|------------|----------|
| Eyes/Expression | Live2D | Desktop companion with expressions and motions |
| Mouth | TTS | Text-to-speech synthesis (multi-provider) |
| Ears | STT | Speech-to-text recognition (streaming supported) |
| Eyes | Vision | Screen capture |
| Hands | Executor | Script execution (planned) |
| Nervous System | Gateway | Brain-Body gRPC communication |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        OpenClaw Brain                           │
│                    (Remote Device / Cloud)                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ gRPC (Nervous System)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      ClawBody Gateway                           │
│              (Capability Registry + Routing + State)            │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │  Live2D  │  │   TTS    │  │   STT    │  │  Vision  │  ...   │
│  │  (Face)  │  │ (Mouth)  │  │  (Ears)  │  │  (Eyes)  │        │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │
│       │              │              │              │            │
│       ▼              ▼              ▼              ▼            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │ Electron │  │Qwen/Edge │  │Qwen3-ASR │  │  Screen  │        │
│  │ + PIXI   │  │   TTS    │  │          │  │ Capture  │        │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │
└─────────────────────────────────────────────────────────────────┘
```

## Features

- **Live2D Desktop Companion** - Animated character with expressions and motions via PIXI.js
- **Multi-Provider TTS** - Support for Qwen3-TTS (local GPU), Edge-TTS (cloud), and more
- **Speech-to-Text (STT)** - Real-time streaming transcription with Qwen3-ASR
- **Screen Capture** - Vision capability for AI to "see" the screen
- **gRPC Communication** - Low-latency, bidirectional streaming between Brain and Body
- **mDNS Discovery** - Automatic service discovery on local network
- **Plugin Architecture** - Extensible capability system with standardized interfaces
- **HTTP Compatibility** - REST API and SSE for browser integration

## Quick Start

### Prerequisites

- Node.js >= 20
- pnpm >= 9
- Python >= 3.12 (for Qwen TTS)

### Installation

```bash
# Clone the repository
git clone https://github.com/openclaw/clawbody.git
cd clawbody

# Install dependencies
pnpm install

# Generate protobuf code
pnpm proto:gen

# Build all packages
pnpm build
```

### Running

```bash
# Terminal 1: Start Gateway (gRPC:50051, HTTP:4000)
pnpm --filter @clawbody/gateway dev

# Terminal 2: Start Desktop (Live2D widget)
pnpm --filter @clawbody/desktop start

# Terminal 3 (optional): Start Qwen TTS service
cd services/qwen3-tts
uv sync
./start.sh

# Terminal 4 (optional): Start Qwen STT service
cd services/qwen3-stt
uv sync
./start.sh
```

## Development

### Commands

| Command | Description |
|---------|-------------|
| `pnpm install` | Install all dependencies |
| `pnpm build` | Build all packages |
| `pnpm dev` | Start development mode |
| `pnpm test` | Run all tests |
| `pnpm test:coverage` | Run tests with coverage |
| `pnpm lint` | ESLint check |
| `pnpm typecheck` | TypeScript type check |
| `pnpm format` | Format code with Prettier |
| `pnpm proto:gen` | Generate protobuf code |

### Single Package Commands

```bash
# Build specific package
pnpm --filter @clawbody/core build

# Run tests for specific package
pnpm --filter @clawbody/gateway test

# Start specific service in dev mode
pnpm --filter @clawbody/desktop start
```

## Project Structure

```
clawbody/
├── packages/
│   ├── core/           # Core library: interfaces, registry, state, logging
│   ├── gateway/        # Gateway: gRPC + HTTP/WS/SSE server, routing, mDNS
│   └── proto-gen/      # Generated protobuf code
├── capabilities/
│   ├── live2d/         # Live2D capability (expressions, motions)
│   ├── tts/            # TTS capability (multi-provider)
│   ├── stt/            # STT capability (speech recognition)
│   └── vision/         # Vision capability (screen capture)
├── apps/
│   └── desktop/        # Electron desktop widget
├── services/
│   ├── qwen3-tts/      # Qwen TTS Python service
│   └── qwen3-stt/      # Qwen STT Python service
├── proto/              # Protocol Buffers definitions
├── config/             # Configuration files (YAML)
└── docs/               # Documentation
```

## TTS Providers

| Provider | Type | Features |
|----------|------|----------|
| Qwen3-TTS | Local GPU | High-quality Chinese, requires GPU |
| Edge-TTS | Cloud (Free) | Microsoft voices, no GPU needed |
| Coqui TTS | Local OSS | Multi-language, offline capable |
| OpenAI TTS | Cloud (Paid) | High quality, requires API key |

## STT Providers

| Provider | Type | Features |
|----------|------|----------|
| Qwen3-ASR | Local GPU | High-quality Chinese/English, streaming support |
| Whisper | Local | Multi-language, offline capable (planned) |
| Azure Speech | Cloud (Paid) | High accuracy, requires API key (planned) |

## Documentation

- [Architecture](docs/ARCHITECTURE.md) - System design and components
- [Protocol](docs/PROTOCOL.md) - gRPC communication protocol
- [API Reference](docs/API.md) - API documentation
- [Development Guide](docs/DEVELOPMENT.md) - Development setup and workflow
- [Deployment](docs/DEPLOYMENT.md) - Deployment instructions
- [Roadmap](docs/ROADMAP.md) - Product roadmap

## Contributing

1. Read the [Development Guide](docs/DEVELOPMENT.md)
2. Open an issue to discuss new features
3. Submit a PR with tests

## License

MIT
