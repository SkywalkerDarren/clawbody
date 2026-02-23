# WeSpeaker Speaker Verification Service

Speaker verification service using WeSpeaker for voice biometric authentication.

## Features

- Speaker enrollment with voice samples
- Speaker verification against enrolled voices
- Multi-enrollment support (averaging embeddings)
- JSON-based speaker storage

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/enroll` | POST | Enroll speaker voice |
| `/verify` | POST | Verify speaker identity |
| `/speakers` | GET | List enrolled speakers |
| `/speakers/{id}` | DELETE | Delete speaker |
| `/config` | GET/POST | Get/update configuration |

## Usage

```bash
./start.sh
```

Default port: 8768
