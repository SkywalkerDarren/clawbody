# API 参考文档

## 概述

ClawBody Gateway 提供 HTTP REST API，端口默认 4000。

基础 URL: `http://localhost:4000/api`

## 系统 API

### GET /health - 健康检查

```bash
curl http://localhost:4000/api/health
```

响应:
```json
{
  "ok": true,
  "uptime": 3600,
  "wsClients": 1,
  "sseClients": 2
}
```

### GET /diagnostics - 全面诊断

检测所有服务状态。

```bash
curl http://localhost:4000/api/diagnostics
```

响应:
```json
{
  "gateway": { "status": "ok", "uptime": 3600 },
  "services": {
    "tts": { "status": "ok", "latency": 15 },
    "stt": { "status": "ok", "latency": 20 },
    "vad": { "status": "ok", "latency": 5 },
    "speaker-verification": { "status": "ok", "latency": 10 },
    "vision": { "status": "ok", "latency": 50 },
    "live2d": { "status": "ok", "latency": 2 }
  },
  "openclaw": { "status": "ok", "message": "Connected to http://localhost:18789" },
  "overall": "ok"
}
```

### GET /capabilities - 能力列表

```bash
curl http://localhost:4000/api/capabilities
```

### GET /persona - 角色配置

```bash
curl http://localhost:4000/api/persona
```

---

## Pipeline API

控制 VAD → SV → STT → OpenClaw 语音链路。

### GET /pipeline - 获取状态

```bash
curl http://localhost:4000/api/pipeline
```

响应:
```json
{
  "enabled": false,
  "description": "VAD → SV → STT → OpenClaw pipeline"
}
```

### POST /pipeline/enable - 启用链路

```bash
curl -X POST http://localhost:4000/api/pipeline/enable
```

### POST /pipeline/disable - 禁用链路

```bash
curl -X POST http://localhost:4000/api/pipeline/disable
```

---

## TTS API

### POST /speak - 语音合成并播放

```bash
curl -X POST http://localhost:4000/api/speak \
  -H "Content-Type: application/json" \
  -d '{"text": "你好世界", "emotion": "happy"}'
```

参数:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| text | string | ✓ | 要合成的文本 |
| emotion | string | | 情感 (用于 Live2D 表情) |

响应:
```json
{
  "ok": true,
  "timings": {
    "expression_ms": 5,
    "motion_ms": 3,
    "tts_ms": 850
  }
}
```

### POST /speak/stream - 流式语音合成

```bash
curl -X POST http://localhost:4000/api/speak/stream \
  -H "Content-Type: application/json" \
  -d '{"text": "你好世界"}'
```

音频通过 SSE 事件 `audio_chunk` 推送。

---

## STT API

### POST /listen - 简化转录

```bash
curl -X POST http://localhost:4000/api/listen \
  -H "Content-Type: application/json" \
  -d '{"audio": "<base64 PCM>", "language": "auto"}'
```

响应:
```json
{
  "ok": true,
  "text": "识别出的文本",
  "language": "zh",
  "duration": 3.5
}
```

### POST /stt/transcribe - 完整转录

```bash
curl -X POST http://localhost:4000/api/stt/transcribe \
  -H "Content-Type: application/json" \
  -d '{
    "audio": "<base64>",
    "language": "auto",
    "enableTimestamps": true
  }'
```

### POST /stt/sessions - 创建流式会话

```bash
curl -X POST http://localhost:4000/api/stt/sessions \
  -H "Content-Type: application/json" \
  -d '{"language": "auto"}'
```

响应:
```json
{
  "sessionId": "sess_abc123",
  "state": "idle",
  "wsUrl": "/api/stt/sessions/sess_abc123/stream"
}
```

### POST /stt/sessions/:id/chunks - 发送音频块

```bash
curl -X POST http://localhost:4000/api/stt/sessions/sess_abc123/chunks \
  -H "Content-Type: application/json" \
  -d '{"audio": "<base64 PCM>"}'
```

### POST /stt/sessions/:id/end - 结束会话

```bash
curl -X POST http://localhost:4000/api/stt/sessions/sess_abc123/end
```

### DELETE /stt/sessions/:id - 取消会话

```bash
curl -X DELETE http://localhost:4000/api/stt/sessions/sess_abc123
```

### GET /stt/languages - 支持的语言

```bash
curl http://localhost:4000/api/stt/languages
```

---

## VAD API

### POST /vad/process - 处理音频块

```bash
curl -X POST http://localhost:4000/api/vad/process \
  -H "Content-Type: application/json" \
  -d '{"audio": "<base64 PCM>"}'
```

响应:
```json
{
  "isSpeech": true,
  "confidence": 0.95,
  "event": "speech_start"
}
```

事件类型:
- `speech_start` - 检测到语音开始
- `speech_end` - 语音结束
- `speech_end_with_audio` - 语音结束，附带完整音频

### POST /vad/reset - 重置状态

```bash
curl -X POST http://localhost:4000/api/vad/reset
```

### GET /vad/config - 获取配置

```bash
curl http://localhost:4000/api/vad/config
```

响应:
```json
{
  "threshold": 0.5,
  "minSpeechDurationMs": 250,
  "minSilenceDurationMs": 300,
  "speechPadMs": 30
}
```

### POST /vad/config - 更新配置

```bash
curl -X POST http://localhost:4000/api/vad/config \
  -H "Content-Type: application/json" \
  -d '{
    "threshold": 0.4,
    "minSpeechDurationMs": 200
  }'
```

---

## Speaker Verification API

### POST /sv/enroll - 注册说话人

```bash
curl -X POST http://localhost:4000/api/sv/enroll \
  -H "Content-Type: application/json" \
  -d '{
    "speakerId": "user001",
    "speakerName": "张三",
    "audio": "<base64 PCM>"
  }'
```

响应:
```json
{
  "success": true,
  "speaker_id": "user001",
  "speaker_name": "张三",
  "embedding_count": 1
}
```

### POST /sv/verify - 验证说话人

```bash
curl -X POST http://localhost:4000/api/sv/verify \
  -H "Content-Type: application/json" \
  -d '{"audio": "<base64 PCM>"}'
```

响应:
```json
{
  "verified": true,
  "speaker_id": "user001",
  "speaker_name": "张三",
  "confidence": 0.85,
  "threshold": 0.6
}
```

### GET /sv/speakers - 列出说话人

```bash
curl http://localhost:4000/api/sv/speakers
```

响应:
```json
[
  {
    "id": "user001",
    "name": "张三",
    "embedding_count": 1
  }
]
```

### DELETE /sv/speakers/:id - 删除说话人

```bash
curl -X DELETE http://localhost:4000/api/sv/speakers/user001
```

### GET /sv/config - 获取配置

```bash
curl http://localhost:4000/api/sv/config
```

响应:
```json
{
  "threshold": 0.6,
  "applyVAD": true
}
```

### POST /sv/config - 更新配置

```bash
curl -X POST http://localhost:4000/api/sv/config \
  -H "Content-Type: application/json" \
  -d '{"threshold": 0.5, "applyVAD": true}'
```

---

## Vision API

### GET /screen - 截取屏幕

```bash
curl http://localhost:4000/api/screen
```

响应:
```json
{
  "image": "<base64 PNG>",
  "width": 1920,
  "height": 1080,
  "format": "png"
}
```

### GET /desktop - 桌面信息

```bash
curl http://localhost:4000/api/desktop
```

---

## Live2D API

### GET /model-info - 模型信息

```bash
curl http://localhost:4000/api/model-info
```

响应:
```json
{
  "expressions": ["f01", "f02", "f03", "f04"],
  "motions": {
    "idle": 3,
    "tap_body": 2,
    "flick_head": 1
  }
}
```

### POST /emote - 设置表情

```bash
curl -X POST http://localhost:4000/api/emote \
  -H "Content-Type: application/json" \
  -d '{"expression": "f02"}'
```

### POST /action - 触发动作

```bash
curl -X POST http://localhost:4000/api/action \
  -H "Content-Type: application/json" \
  -d '{"group": "tap_body", "index": 0}'
```

---

## 事件订阅

### GET /events - SSE 事件流

```javascript
const es = new EventSource('http://localhost:4000/api/events');

es.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Event:', data);
};

// 事件类型
es.addEventListener('expression', (e) => { /* Live2D 表情 */ });
es.addEventListener('motion', (e) => { /* Live2D 动作 */ });
es.addEventListener('audio', (e) => { /* TTS 音频 */ });
es.addEventListener('audio_chunk', (e) => { /* 流式音频块 */ });
```

### WebSocket

```javascript
const ws = new WebSocket('ws://localhost:4000');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('WS:', data);
};
```

---

## 音频格式

所有音频 API 使用统一格式:
- 采样率: 16000 Hz
- 位深: 16-bit (signed int)
- 声道: 单声道 (mono)
- 编码: Base64

---

## 错误响应

```json
{
  "error": "错误描述"
}
```

HTTP 状态码:
- 400 - 请求参数错误
- 401 - 未授权 (需要 API Key)
- 404 - 资源不存在
- 500 - 服务器内部错误
- 503 - 服务不可用
