# API 参考文档

## 概述

ClawBody 提供两种 API 访问方式：
- gRPC (推荐): 低延迟、类型安全、支持流式
- HTTP REST: 向后兼容、易于调试

## 能力 API

### TTS 能力 (`tts`)

#### speak - 语音合成并播放

将文本转换为语音并立即播放。

**输入参数:**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| text | string | ✓ | 要合成的文本 |
| voice | string | | 声音名称 |
| provider | string | | TTS 提供商 (qwen/edge/coqui/openai) |
| speed | number | | 语速 (0.5-2.0，默认 1.0) |

**输出:**

```json
{
  "duration": 3.5,
  "provider": "qwen"
}
```

**示例 (gRPC):**

```typescript
const response = await client.execute({
  capabilityId: 'tts',
  operation: 'speak',
  input: JSON.stringify({
    text: '你好，我是 OpenClaw',
    voice: 'Vivian',
    provider: 'qwen'
  })
});
```

**示例 (HTTP):**

```bash
curl -X POST http://localhost:3000/api/execute \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: your-api-key" \
  -d '{
    "capability_id": "tts",
    "operation": "speak",
    "input": {
      "text": "你好，我是 OpenClaw",
      "voice": "Vivian"
    }
  }'
```

#### synthesize - 合成语音 (不播放)

合成语音并返回音频数据。

**输入参数:**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| text | string | ✓ | 要合成的文本 |
| voice | string | | 声音名称 |
| provider | string | | TTS 提供商 |
| format | string | | 音频格式 (wav/mp3/opus) |

**输出:**

```json
{
  "audio": "base64-encoded-audio-data",
  "format": "wav",
  "sampleRate": 24000,
  "duration": 3.5
}
```

#### listVoices - 列出可用声音

**输入参数:**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| provider | string | | 指定提供商，不填则返回所有 |

**输出:**

```json
[
  {
    "id": "Vivian",
    "name": "Vivian",
    "language": "en",
    "gender": "female",
    "provider": "qwen"
  },
  {
    "id": "zh-CN-XiaoxiaoNeural",
    "name": "晓晓",
    "language": "zh-CN",
    "gender": "female",
    "provider": "edge"
  }
]
```

---

### STT 能力 (`stt`)

#### transcribe - 批量转录

将完整音频转换为文本。

**输入参数:**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| audio | string | ✓ | Base64 编码的音频数据 |
| language | string | | 语言代码 (auto/zh/en/ja/ko) |
| provider | string | | STT 提供商 (qwen) |
| enableTimestamps | boolean | | 是否返回时间戳 |

**输出:**

```json
{
  "text": "识别出的文本内容",
  "segments": [
    {
      "text": "识别出的文本内容",
      "start_time": 0.0,
      "end_time": 3.5,
      "confidence": 0.95,
      "is_final": true
    }
  ],
  "language": "zh",
  "duration": 3.5
}
```

#### startSession - 创建流式会话

创建流式转录会话，用于实时语音识别。

**输入参数:**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| language | string | | 语言代码 |
| provider | string | | STT 提供商 |

**输出:**

```json
{
  "sessionId": "sess_abc123",
  "state": "idle"
}
```

#### sendChunk - 发送音频块

向流式会话发送音频数据块。

**输入参数:**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| sessionId | string | ✓ | 会话 ID |
| audio | string | ✓ | Base64 编码的 PCM 音频块 (16kHz, 16-bit, mono) |

**输出:**

```json
{
  "text": "部分识别结果",
  "isFinal": false,
  "confidence": 0.85
}
```

#### endSession - 结束会话

结束流式会话并获取最终转录结果。

**输入参数:**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| sessionId | string | ✓ | 会话 ID |

**输出:**

```json
{
  "text": "完整的转录文本",
  "segments": [...],
  "language": "zh",
  "duration": 10.5
}
```

#### listLanguages - 列出支持的语言

**输出:**

```json
["auto", "zh", "en", "ja", "ko", "yue"]
```

---

### Live2D 能力 (`live2d`)

#### expression - 设置表情

**输入参数:**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | ✓ | 表情名称 (f01/f02/f03/f04) |

**输出:**

```json
{
  "success": true
}
```

**示例:**

```bash
curl -X POST http://localhost:3000/api/execute \
  -H "X-Api-Key: your-api-key" \
  -d '{
    "capability_id": "live2d",
    "operation": "expression",
    "input": { "name": "f02" }
  }'
```

#### motion - 播放动作

**输入参数:**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| group | string | ✓ | 动作组 (idle/tap_body/flick_head/...) |
| index | number | | 动作索引，不填则随机 |

**输出:**

```json
{
  "success": true,
  "motion": "tap_body_01"
}
```

#### show - 显示/隐藏窗口

**输入参数:**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| visible | boolean | ✓ | 是否显示 |

---

### Vision 能力 (`vision`)

#### capture - 截取屏幕

**输入参数:**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| format | string | | 图片格式 (png/jpg) |
| quality | number | | JPEG 质量 (1-100) |
| region | object | | 截取区域 {x, y, width, height} |

**输出:**

```json
{
  "image": "base64-encoded-image",
  "width": 1920,
  "height": 1080,
  "format": "png"
}
```

---

## 系统 API

### GetCapabilities - 获取能力列表

返回所有已注册能力及其状态。

**gRPC:**

```typescript
const response = await client.getCapabilities({});
```

**HTTP:**

```bash
curl http://localhost:3000/api/capabilities \
  -H "X-Api-Key: your-api-key"
```

**响应:**

```json
{
  "capabilities": [
    {
      "id": "tts",
      "name": "Text-to-Speech",
      "version": "1.0.0",
      "type": "output",
      "status": "ready",
      "operations": [
        {
          "name": "speak",
          "description": "将文本转换为语音并播放",
          "streaming": true
        }
      ]
    }
  ]
}
```

### HealthCheck - 健康检查

**gRPC:**

```typescript
const response = await client.healthCheck({
  capabilityIds: ['tts', 'live2d']  // 可选，不填检查所有
});
```

**HTTP:**

```bash
curl http://localhost:3000/api/health
```

**响应:**

```json
{
  "overall_status": "healthy",
  "uptime_seconds": 3600,
  "capabilities": [
    {
      "id": "tts",
      "status": "ready",
      "message": "All providers available"
    },
    {
      "id": "live2d",
      "status": "ready"
    }
  ]
}
```

---

## 事件订阅

### SSE 事件流 (HTTP)

```javascript
const eventSource = new EventSource('http://localhost:3000/api/events');

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Event:', data);
};

eventSource.addEventListener('capability_status', (event) => {
  const data = JSON.parse(event.data);
  console.log('Capability status changed:', data);
});
```

### 双向流 (gRPC)

```typescript
const stream = client.connect();

stream.on('data', (message) => {
  if (message.payload.oneofKind === 'event') {
    console.log('Event:', message.payload.event);
  }
});

// 发送命令
stream.write({
  requestId: 'req-001',
  timestamp: new Date(),
  payload: {
    oneofKind: 'command',
    command: {
      capabilityId: 'tts',
      operation: 'speak',
      input: Buffer.from(JSON.stringify({ text: 'Hello' }))
    }
  }
});
```

---

## 错误码

| 错误码 | 说明 |
|--------|------|
| ERROR_UNKNOWN | 未知错误 |
| ERROR_CAPABILITY_NOT_FOUND | 能力不存在 |
| ERROR_OPERATION_NOT_FOUND | 操作不存在 |
| ERROR_INVALID_INPUT | 输入参数无效 |
| ERROR_TIMEOUT | 操作超时 |
| ERROR_CAPABILITY_UNAVAILABLE | 能力不可用 |
| ERROR_INTERNAL | 内部错误 |

---

## 认证

所有受保护的 API 需要提供 API Key：

**gRPC:**

```typescript
const metadata = new grpc.Metadata();
metadata.add('x-api-key', 'your-api-key');

client.execute(request, metadata, callback);
```

**HTTP:**

```bash
curl -H "X-Api-Key: your-api-key" http://localhost:3000/api/...
```

## 速率限制

- 默认: 100 请求/分钟
- TTS speak: 10 请求/分钟
- Vision capture: 30 请求/分钟
