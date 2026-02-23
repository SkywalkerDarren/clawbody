# Silero VAD Service

Voice Activity Detection service using Silero VAD model.

## Usage

```bash
./start.sh
```

## API

- `GET /health` - Health check
- `POST /process` - Process audio chunk
- `GET /config` - Get configuration
- `POST /config` - Update configuration
- `POST /reset` - Reset detector state
