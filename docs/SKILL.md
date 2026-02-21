# ClawBody Skill Guide

本文档指导 Brain（AI 大脑）如何使用 ClawBody（身体）的各项能力。

## 架构概述

```
┌─────────────────────────────────────────────────────────────┐
│                         Brain (你)                          │
│                    AI Agent / LLM                           │
└─────────────────────────┬───────────────────────────────────┘
                          │ gRPC (localhost:50051)
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

## 连接方式

### gRPC 连接

```
地址: localhost:50051
协议: gRPC (proto/nervous.proto)
```

### 服务发现 (mDNS)

ClawBody 会广播 `_clawbody._tcp.local` 服务，可自动发现。

## 能力列表

| 能力 ID | 名称 | 类型 | 描述 |
|---------|------|------|------|
| `live2d` | Live2D Desktop Companion | output | 桌面角色控制 |
| `tts` | Text-to-Speech | output | 语音合成 |
| `vision` | Screen Vision | input | 屏幕截图 |

## gRPC API

### 1. 健康检查

```protobuf
rpc HealthCheck(HealthCheckRequest) returns (HealthCheckResponse)
```

检查身体状态和各能力可用性。

### 2. 获取能力列表

```protobuf
rpc GetCapabilities(GetCapabilitiesRequest) returns (GetCapabilitiesResponse)
```

获取所有可用能力及其操作。

### 3. 执行操作

```protobuf
rpc Execute(ExecuteRequest) returns (ExecuteResponse)
```

执行单次能力操作。

**请求格式:**
```json
{
  "request_id": "unique-id",
  "capability_id": "live2d",
  "operation": "expression",
  "input": "{\"name\": \"f01\"}"  // JSON 编码
}
```

---

## Live2D 能力

控制桌面 Live2D 角色的表情和动作。

### 操作列表

| 操作 | 描述 | 输入参数 |
|------|------|----------|
| `expression` | 设置表情 | `{ name: string }` |
| `motion` | 触发动作 | `{ group: string, index?: number }` |
| `getModelInfo` | 获取模型信息 | `{}` |

### 可用表情

| 表情 ID | 描述 |
|---------|------|
| `f01` | 默认/微笑 |
| `f02` | 开心 |
| `f03` | 惊讶 |
| `f04` | 害羞 |

### 可用动作组

| 动作组 | 数量 | 描述 |
|--------|------|------|
| `idle` | 3 | 待机动作 |
| `tap_body` | 3 | 点击身体反应 |
| `flick_head` | 3 | 摸头反应 |
| `pinch_in` | 3 | 捏合手势 |
| `pinch_out` | 3 | 展开手势 |
| `shake` | 3 | 摇晃反应 |

### 使用示例

```json
// 设置开心表情
{
  "capability_id": "live2d",
  "operation": "expression",
  "input": "{\"name\": \"f02\"}"
}

// 触发待机动作
{
  "capability_id": "live2d",
  "operation": "motion",
  "input": "{\"group\": \"idle\", \"index\": 0}"
}

// 获取模型信息
{
  "capability_id": "live2d",
  "operation": "getModelInfo",
  "input": "{}"
}
```

### 使用建议

- 说话时配合 `tap_body` 动作
- 思考时使用 `idle` 动作
- 根据情绪切换表情：开心用 `f02`，惊讶用 `f03`
- 动作和表情可以同时设置

---

## TTS 能力

将文本转换为语音。

### 操作列表

| 操作 | 描述 | 输入参数 |
|------|------|----------|
| `synthesize` | 合成语音 | `{ text, voice?, provider? }` |
| `listVoices` | 获取声音列表 | `{}` |
| `listProviders` | 获取提供商列表 | `{}` |

### 可用声音 (Qwen3-TTS)

| 声音 ID | 描述 | 推荐语言 |
|---------|------|----------|
| `vivian` | 明亮女声 | 中文 |
| `serena` | 温柔女声 | 中文 |
| `uncle_fu` | 醇厚男声 | 中文 |
| `dylan` | 北京男声 | 中文 |
| `eric` | 四川男声 | 中文 |
| `ryan` | 动感男声 | 英文 |
| `aiden` | 美式男声 | 英文 |

### 使用示例

```json
// 合成中文语音
{
  "capability_id": "tts",
  "operation": "synthesize",
  "input": "{\"text\": \"你好，很高兴认识你！\", \"voice\": \"vivian\"}"
}

// 合成英文语音
{
  "capability_id": "tts",
  "operation": "synthesize",
  "input": "{\"text\": \"Hello, nice to meet you!\", \"voice\": \"ryan\"}"
}
```

### 使用建议

- 中文内容使用 `vivian` 或 `serena`
- 英文内容使用 `ryan` 或 `aiden`
- 说话时同时触发 Live2D 的 `tap_body` 动作
- 长文本建议分段合成

---

## Vision 能力

截取屏幕内容。

### 操作列表

| 操作 | 描述 | 输入参数 |
|------|------|----------|
| `screenshot` | 截取屏幕 | `{}` |

### 返回格式

```json
{
  "width": 1920,
  "height": 1080,
  "format": "png",
  "data": "base64-encoded-image"
}
```

### 使用示例

```json
// 截取屏幕
{
  "capability_id": "vision",
  "operation": "screenshot",
  "input": "{}"
}
```

### 使用建议

- 用户询问屏幕内容时使用
- 需要理解用户正在做什么时使用
- 截图数据较大，按需使用

---

## 组合使用示例

### 场景 1: 打招呼

```
1. Live2D: expression = "f02" (开心)
2. Live2D: motion = "tap_body" (说话动作)
3. TTS: synthesize = "你好！很高兴见到你！"
```

### 场景 2: 思考问题

```
1. Live2D: expression = "f01" (默认)
2. Live2D: motion = "idle" (待机)
3. (处理问题...)
4. Live2D: expression = "f02" (开心)
5. Live2D: motion = "tap_body"
6. TTS: synthesize = "我想到了！答案是..."
```

### 场景 3: 查看屏幕

```
1. Vision: screenshot
2. (分析截图内容...)
3. Live2D: expression = "f03" (惊讶/专注)
4. TTS: synthesize = "我看到你正在..."
```

### 场景 4: 表达惊讶

```
1. Live2D: expression = "f03" (惊讶)
2. Live2D: motion = "shake"
3. TTS: synthesize = "哇！这太厉害了！"
```

---

## 最佳实践

1. **先检查能力可用性**: 调用 `HealthCheck` 确认能力状态
2. **表情配合语音**: 说话时切换合适的表情和动作
3. **异步执行**: TTS 合成需要时间，可以先触发动作
4. **错误处理**: 检查响应的 `success` 字段
5. **节制使用 Vision**: 截图数据量大，按需调用

## 错误码

| 错误 | 描述 | 处理建议 |
|------|------|----------|
| `CAPABILITY_NOT_FOUND` | 能力不存在 | 检查 capability_id |
| `OPERATION_NOT_FOUND` | 操作不存在 | 检查 operation |
| `CAPABILITY_UNAVAILABLE` | 能力不可用 | 等待或跳过 |
| `EXECUTION_FAILED` | 执行失败 | 查看错误详情 |

---

## 快速参考

```
# 设置表情
Execute(live2d, expression, {name: "f02"})

# 触发动作
Execute(live2d, motion, {group: "tap_body", index: 0})

# 合成语音
Execute(tts, synthesize, {text: "你好", voice: "vivian"})

# 截取屏幕
Execute(vision, screenshot, {})
```
