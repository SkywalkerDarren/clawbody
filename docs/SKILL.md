# ClawBody Skill Guide

本文档指导 Brain（AI 大脑）如何使用 ClawBody（身体）的各项能力。

## 架构概述

```
┌─────────────────────────────────────────────────────────────┐
│                         Brain (你)                          │
│                    AI Agent / LLM                           │
└─────────────────────────┬───────────────────────────────────┘
                          │ HTTP (localhost:4000)
                          │ 或 gRPC (localhost:50051)
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

---

## 🚀 简化 API (推荐)

Brain 只需调用简单的 HTTP 接口，身体会根据配置自动处理声音、表情、动作。

### POST /api/speak - 说话

最常用的接口，只需传文本即可。

```bash
curl -X POST http://localhost:4000/api/speak \
  -H "Content-Type: application/json" \
  -d '{"text": "你好！很高兴认识你！"}'
```

带情绪：

```bash
curl -X POST http://localhost:4000/api/speak \
  -H "Content-Type: application/json" \
  -d '{"text": "哇！太厉害了！", "emotion": "surprised"}'
```

**参数:**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| text | string | ✓ | 要说的话 |
| emotion | string | | 情绪 (default, happy, surprised, shy) |

**响应:**
```json
{
  "ok": true,
  "text": "你好！很高兴认识你！",
  "emotion": "default",
  "audio": { "duration": 2.5 }
}
```

### POST /api/emote - 设置情绪

只改变表情，不说话。

```bash
curl -X POST http://localhost:4000/api/emote \
  -H "Content-Type: application/json" \
  -d '{"emotion": "happy"}'
```

**可用情绪:** `default`, `happy`, `surprised`, `shy`

### POST /api/action - 触发动作

触发身体动作。

```bash
curl -X POST http://localhost:4000/api/action \
  -H "Content-Type: application/json" \
  -d '{"action": "greeting"}'
```

**可用动作:** `idle`, `speaking`, `thinking`, `greeting`, `surprised`

### GET /api/screen - 截取屏幕

获取当前屏幕截图。

```bash
curl http://localhost:4000/api/screen
```

### GET /api/persona - 获取角色配置

查看当前角色的配置信息。

```bash
curl http://localhost:4000/api/persona
```

---

## 使用示例

### 场景 1: 简单打招呼

```bash
curl -X POST http://localhost:4000/api/speak \
  -d '{"text": "你好！我是你的助手，有什么可以帮你的吗？"}'
```

### 场景 2: 表达惊讶

```bash
curl -X POST http://localhost:4000/api/speak \
  -d '{"text": "哇！这个结果太棒了！", "emotion": "surprised"}'
```

### 场景 3: 思考后回答

```bash
# 先显示思考状态
curl -X POST http://localhost:4000/api/action -d '{"action": "thinking"}'

# 思考完成后回答
curl -X POST http://localhost:4000/api/speak \
  -d '{"text": "我想到了！答案是42。", "emotion": "happy"}'
```

### 场景 4: 查看屏幕并描述

```bash
# 截取屏幕
screen=$(curl -s http://localhost:4000/api/screen)

# 然后描述看到的内容
curl -X POST http://localhost:4000/api/speak \
  -d '{"text": "我看到你正在编写代码，看起来是一个很有趣的项目！"}'
```

---

## 配置文件

角色配置在 `config/default.yaml`:

```yaml
persona:
  name: "Assistant"

  # 语音配置
  voice:
    provider: "qwen"      # TTS 提供商
    id: "1"               # 声音 ID (自定义声音)
    language: "Auto"

  # 表情映射
  expressions:
    default: "f01"
    happy: "f02"
    surprised: "f03"
    shy: "f04"

  # 动作映射
  motions:
    idle: "idle"
    speaking: "tap_body"
    thinking: "idle"
    greeting: "tap_body"
    surprised: "shake"
```

修改配置后重启 Gateway 即可生效。

---

## 高级 API (gRPC)

如果需要更细粒度的控制，可以使用 gRPC API 直接操作各个能力。

### 连接

```
地址: localhost:50051
协议: gRPC (proto/nervous.proto)
```

### 执行操作

```protobuf
rpc Execute(ExecuteRequest) returns (ExecuteResponse)
```

**请求格式:**
```json
{
  "request_id": "unique-id",
  "capability_id": "live2d",
  "operation": "expression",
  "input": "{\"name\": \"f02\"}"
}
```

### Live2D 操作

| 操作 | 输入参数 |
|------|----------|
| `expression` | `{ name: "f01" }` |
| `motion` | `{ group: "idle", index: 0 }` |
| `getModelInfo` | `{}` |

### TTS 操作

| 操作 | 输入参数 |
|------|----------|
| `synthesize` | `{ text: "你好", voice: "1" }` |
| `listVoices` | `{}` |

### Vision 操作

| 操作 | 输入参数 |
|------|----------|
| `screenshot` | `{}` |

---

## 快速参考

```bash
# 简化 API (推荐)
curl -X POST http://localhost:4000/api/speak -d '{"text": "你好"}'
curl -X POST http://localhost:4000/api/emote -d '{"emotion": "happy"}'
curl -X POST http://localhost:4000/api/action -d '{"action": "greeting"}'
curl http://localhost:4000/api/screen

# gRPC (高级)
Execute(live2d, expression, {name: "f02"})
Execute(live2d, motion, {group: "tap_body"})
Execute(tts, synthesize, {text: "你好", voice: "1"})
Execute(vision, screenshot, {})
```
