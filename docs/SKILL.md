# ClawBody Skill Guide

本文档指导 Brain（AI 大脑）如何使用 ClawBody（身体）的各项能力。

## 架构概述

```
┌─────────────────────────────────────────────────────────────┐
│                         Brain (你)                          │
│                    AI Agent / LLM                           │
└─────────────────────────┬───────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          │               │               │
          ▼               ▼               ▼
    ┌──────────┐   ┌──────────┐   ┌──────────┐
    │ HTTP API │   │   gRPC   │   │   gRPC   │
    │ 简单调用  │   │  单次调用 │   │  双向流  │
    │ /api/*   │   │ Execute  │   │ Connect  │
    └──────────┘   └──────────┘   └──────────┘
          │               │               │
          └───────────────┼───────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                        Gateway                              │
│              gRPC Server + HTTP/WS/SSE                      │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        │
│  │ Live2D  │  │   TTS   │  │ Vision  │  │  Mic    │        │
│  │ 表情动作 │  │ 语音合成 │  │ 屏幕截图 │  │ 语音输入 │        │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘        │
└─────────────────────────────────────────────────────────────┘
```

## 选择合适的 API

| 场景 | 推荐 API | 说明 |
|------|----------|------|
| 简单对话 | HTTP `/api/speak` | 一次性说完，最简单 |
| 需要细粒度控制 | gRPC `Execute` | 单独控制表情、动作、TTS |
| 流式输出 | gRPC `Connect` | LLM 边生成边说话 |
| 实时交互 | gRPC `Connect` | 思考状态、语音中断 |

---

## 一、HTTP 简化 API

适用于简单场景，Brain 只需传文本，Body 根据配置自动处理。

### POST /api/speak - 说话

```bash
curl -X POST http://localhost:4000/api/speak \
  -H "Content-Type: application/json" \
  -d '{"text": "你好！", "emotion": "happy"}'
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| text | string | ✓ | 要说的话 |
| emotion | string | | 情绪 (default, happy, surprised, shy) |

### POST /api/emote - 设置情绪

```bash
curl -X POST http://localhost:4000/api/emote \
  -d '{"emotion": "happy"}'
```

### POST /api/action - 触发动作

```bash
curl -X POST http://localhost:4000/api/action \
  -d '{"action": "thinking"}'
```

### GET /api/screen - 截屏

```bash
curl http://localhost:4000/api/screen
```

---

## 二、gRPC 单次调用 API

适用于需要细粒度控制的场景。

### 连接信息

```
地址: localhost:50051
协议: gRPC (proto/nervous.proto)
```

### Execute - 执行单次操作

```protobuf
rpc Execute(ExecuteRequest) returns (ExecuteResponse);
```

**请求:**
```json
{
  "request_id": "req-001",
  "capability_id": "live2d",
  "operation": "expression",
  "input": "{\"name\": \"f02\"}"
}
```

**响应:**
```json
{
  "request_id": "req-001",
  "success": true,
  "output": "{\"success\": true}",
  "duration_ms": 5
}
```

### 能力操作列表

#### Live2D

| 操作 | 输入 | 说明 |
|------|------|------|
| `expression` | `{name: "f01"}` | 设置表情 |
| `motion` | `{group: "idle", index: 0}` | 触发动作 |
| `getModelInfo` | `{}` | 获取模型信息 |

**表情:** `f01`(默认), `f02`(开心), `f03`(惊讶), `f04`(害羞)

**动作组:** `idle`, `tap_body`, `flick_head`, `pinch_in`, `pinch_out`, `shake`

#### TTS

| 操作 | 输入 | 说明 |
|------|------|------|
| `synthesize` | `{text, voice?, provider?}` | 合成语音 |
| `listVoices` | `{}` | 获取声音列表 |

#### Vision

| 操作 | 输入 | 说明 |
|------|------|------|
| `screenshot` | `{}` | 截取屏幕 |

---

## 三、gRPC 双向流 API (流式交互)

适用于 LLM 流式输出、实时状态更新、语音中断等场景。

### Connect - 双向流

```protobuf
rpc Connect(stream BrainMessage) returns (stream BodyMessage);
```

### Brain → Body 消息类型

#### 1. CommandMessage - 执行命令

```json
{
  "request_id": "cmd-001",
  "command": {
    "capability_id": "live2d",
    "operation": "expression",
    "input": "{\"name\": \"f02\"}"
  }
}
```

#### 2. QueryMessage - 查询状态

```json
{
  "request_id": "query-001",
  "query": {
    "capability_id": "live2d",
    "query_type": "status"
  }
}
```

#### 3. SubscribeMessage - 订阅事件

```json
{
  "request_id": "sub-001",
  "subscribe": {
    "capability_id": "microphone",
    "event_types": ["voice_activity", "transcription"]
  }
}
```

#### 4. HeartbeatMessage - 心跳

```json
{
  "heartbeat": {
    "sequence": 1
  }
}
```

### Body → Brain 消息类型

#### 1. ResponseMessage - 命令响应

```json
{
  "request_id": "cmd-001",
  "response": {
    "success": true,
    "output": "...",
    "duration_ms": 10
  }
}
```

#### 2. EventMessage - 事件推送

```json
{
  "event": {
    "capability_id": "microphone",
    "event_type": "voice_activity",
    "data": "{\"speaking\": true}"
  }
}
```

#### 3. HeartbeatAck - 心跳确认

```json
{
  "heartbeat_ack": {
    "sequence": 1
  }
}
```

---

## 四、流式场景示例

### 场景 1: LLM 流式输出 + 实时说话

```
Brain                              Body
  │                                  │
  │─── Subscribe(tts, audio_chunk) ──►│
  │                                  │
  │─── Command(live2d, expression) ──►│  设置表情
  │◄── Response(success) ────────────│
  │                                  │
  │─── Command(tts, synthesize_stream, {text: "你"}) ──►│
  │─── Command(tts, synthesize_stream, {text: "好"}) ──►│
  │─── Command(tts, synthesize_stream, {text: "！"}) ──►│
  │─── Command(tts, synthesize_stream, {end: true}) ───►│
  │                                  │
  │◄── Event(tts, audio_chunk, ...) ─│  音频流
  │◄── Event(tts, audio_chunk, ...) ─│
  │◄── Event(tts, audio_done) ───────│
  │                                  │
```

### 场景 2: 思考状态 + 语音中断

```
Brain                              Body
  │                                  │
  │─── Subscribe(mic, voice_activity) ►│
  │                                  │
  │─── Command(live2d, motion, {group: "idle"}) ──►│  开始思考
  │                                  │
  │    ... Brain 正在思考 ...         │
  │                                  │
  │◄── Event(mic, voice_activity, {speaking: true}) ─│  用户开始说话
  │                                  │
  │    ... Brain 停止当前输出 ...     │
  │                                  │
  │─── Command(tts, stop) ───────────►│  停止播放
  │                                  │
```

### 场景 3: 边思考边说话

```
Brain                              Body
  │                                  │
  │─── Command(live2d, expression, {name: "f01"}) ──►│
  │─── Command(live2d, motion, {group: "idle"}) ────►│  思考表情
  │                                  │
  │    ... 生成第一句 ...             │
  │                                  │
  │─── Command(live2d, expression, {name: "f02"}) ──►│
  │─── Command(live2d, motion, {group: "tap_body"}) ►│  说话表情
  │─── Command(tts, synthesize, {text: "我想到了"}) ─►│
  │                                  │
  │    ... 继续生成 ...               │
  │                                  │
  │─── Command(tts, synthesize, {text: "答案是42"}) ─►│
  │                                  │
```

---

## 五、配置文件

角色配置在 `config/default.yaml`，修改后重启 Gateway 生效：

```yaml
persona:
  name: "Assistant"

  # 语音配置 - 决定 /api/speak 使用什么声音
  voice:
    provider: "qwen"      # TTS 提供商
    id: "1"               # 声音 ID (自定义声音)
    language: "Auto"

  # 表情映射 - emotion 名称 → 表情 ID
  expressions:
    default: "f01"
    happy: "f02"
    surprised: "f03"
    shy: "f04"

  # 动作映射 - action 名称 → 动作组
  motions:
    idle: "idle"
    speaking: "tap_body"
    thinking: "idle"
    greeting: "tap_body"
    surprised: "shake"
```

---

## 六、快速参考

```bash
# === HTTP 简化 API ===
curl -X POST http://localhost:4000/api/speak -d '{"text": "你好"}'
curl -X POST http://localhost:4000/api/emote -d '{"emotion": "happy"}'
curl -X POST http://localhost:4000/api/action -d '{"action": "thinking"}'
curl http://localhost:4000/api/screen

# === gRPC 单次调用 ===
Execute(live2d, expression, {name: "f02"})
Execute(live2d, motion, {group: "tap_body"})
Execute(tts, synthesize, {text: "你好", voice: "1"})
Execute(vision, screenshot, {})

# === gRPC 双向流 ===
Connect() → 发送 BrainMessage, 接收 BodyMessage
```

---

## 七、错误处理

| 错误码 | 说明 | 处理 |
|--------|------|------|
| `CAPABILITY_NOT_FOUND` | 能力不存在 | 检查 capability_id |
| `OPERATION_NOT_FOUND` | 操作不存在 | 检查 operation |
| `CAPABILITY_UNAVAILABLE` | 能力不可用 | 等待初始化或跳过 |
| `EXECUTION_FAILED` | 执行失败 | 查看 error 详情 |
