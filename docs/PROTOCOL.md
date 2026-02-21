# 通信协议文档

## 概述

ClawBody 使用 gRPC 作为 Brain-Body 之间的主要通信协议（神经系统）。

## 协议定义

### 服务接口

```protobuf
service NervousSystem {
  // 双向流：Brain <-> Body 实时通信
  rpc Connect(stream BrainMessage) returns (stream BodyMessage);

  // 单次调用：执行能力操作
  rpc Execute(ExecuteRequest) returns (ExecuteResponse);

  // 流式调用：执行流式操作 (如 TTS 流式播放)
  rpc ExecuteStream(ExecuteRequest) returns (stream ExecuteChunk);

  // 查询能力
  rpc GetCapabilities(GetCapabilitiesRequest) returns (GetCapabilitiesResponse);

  // 健康检查
  rpc HealthCheck(HealthCheckRequest) returns (HealthCheckResponse);
}
```

## 消息类型

### Brain -> Body 消息

```protobuf
message BrainMessage {
  string request_id = 1;
  google.protobuf.Timestamp timestamp = 2;

  oneof payload {
    CommandMessage command = 10;      // 执行命令
    QueryMessage query = 11;          // 查询状态
    SubscribeMessage subscribe = 12;  // 订阅事件
    HeartbeatMessage heartbeat = 13;  // 心跳
  }
}
```

### Body -> Brain 消息

```protobuf
message BodyMessage {
  string request_id = 1;
  google.protobuf.Timestamp timestamp = 2;

  oneof payload {
    ResponseMessage response = 10;    // 命令响应
    EventMessage event = 11;          // 事件推送
    ErrorMessage error = 12;          // 错误信息
    HeartbeatAck heartbeat_ack = 13;  // 心跳确认
  }
}
```

### 命令消息

```protobuf
message CommandMessage {
  string capability_id = 1;   // 能力 ID (如 "tts", "live2d")
  string operation = 2;       // 操作名称 (如 "speak", "expression")
  bytes input = 3;            // JSON 编码的输入参数
  ExecutionOptions options = 4;
}

message ExecutionOptions {
  int32 timeout_ms = 1;       // 超时时间
  Priority priority = 2;      // 优先级
  bool async = 3;             // 是否异步执行
}

enum Priority {
  PRIORITY_LOW = 0;
  PRIORITY_NORMAL = 1;
  PRIORITY_HIGH = 2;
}
```

### 响应消息

```protobuf
message ResponseMessage {
  bool success = 1;
  bytes output = 2;           // JSON 编码的输出
  int64 duration_ms = 3;      // 执行耗时
}
```

### 事件消息

```protobuf
message EventMessage {
  string capability_id = 1;
  string event_type = 2;      // 事件类型
  bytes data = 3;             // 事件数据
}
```

### 错误消息

```protobuf
message ErrorMessage {
  ErrorCode code = 1;
  string message = 2;
  string details = 3;
}

enum ErrorCode {
  ERROR_UNKNOWN = 0;
  ERROR_CAPABILITY_NOT_FOUND = 1;
  ERROR_OPERATION_NOT_FOUND = 2;
  ERROR_INVALID_INPUT = 3;
  ERROR_TIMEOUT = 4;
  ERROR_CAPABILITY_UNAVAILABLE = 5;
  ERROR_INTERNAL = 6;
}
```

## 通信模式

### 1. 请求-响应模式

适用于单次操作，如截图、查询状态。

```
Brain                          Body
  │                              │
  │──── ExecuteRequest ─────────▶│
  │                              │ (执行操作)
  │◀─── ExecuteResponse ─────────│
  │                              │
```

### 2. 双向流模式

适用于实时交互，如持续对话。

```
Brain                          Body
  │                              │
  │◀═══════ Connect ════════════▶│
  │                              │
  │──── CommandMessage ─────────▶│
  │◀─── ResponseMessage ─────────│
  │                              │
  │◀──── EventMessage ───────────│ (主动推送)
  │                              │
  │──── HeartbeatMessage ───────▶│
  │◀─── HeartbeatAck ────────────│
  │                              │
```

### 3. 服务端流模式

适用于流式输出，如 TTS 音频流。

```
Brain                          Body
  │                              │
  │──── ExecuteRequest ─────────▶│
  │                              │
  │◀─── ExecuteChunk (1) ────────│
  │◀─── ExecuteChunk (2) ────────│
  │◀─── ExecuteChunk (3) ────────│
  │◀─── ExecuteChunk (final) ────│
  │                              │
```

## 服务发现

### mDNS 服务注册

Body 启动时自动注册 mDNS 服务：

- 服务类型: `_clawbody._tcp`
- 端口: gRPC 端口 (默认 50051)
- TXT 记录:
  - `version`: 协议版本
  - `hostname`: 主机名
  - `grpc`: gRPC 端口
  - `http`: HTTP 端口 (可选)

### Brain 端发现

```typescript
const discovery = new BodyDiscovery();
discovery.startDiscovery();

discovery.subscribe((bodies) => {
  console.log('发现的 Body:', bodies);
  // [{ name: 'clawbody-desktop', host: '192.168.1.100', grpcPort: 50051 }]
});
```

## 能力操作

### TTS 能力

| 操作 | 输入 | 输出 | 流式 |
|------|------|------|------|
| speak | `{ text, voice?, provider?, speed? }` | `{ duration, provider }` | ✓ |
| synthesize | `{ text, voice?, format? }` | `{ audio, format, sampleRate }` | ✗ |
| listVoices | `{ provider? }` | `Voice[]` | ✗ |

### Live2D 能力

| 操作 | 输入 | 输出 | 流式 |
|------|------|------|------|
| expression | `{ name }` | `{ success }` | ✗ |
| motion | `{ group, index? }` | `{ success }` | ✗ |
| show | `{ visible }` | `{ success }` | ✗ |

### Vision 能力

| 操作 | 输入 | 输出 | 流式 |
|------|------|------|------|
| capture | `{ format?, quality? }` | `{ image, width, height }` | ✗ |

## 错误处理

### 重试策略

- 网络错误: 指数退避重试，最多 3 次
- 超时错误: 不重试，返回错误
- 能力不可用: 不重试，返回错误

### 降级策略

- TTS 提供商不可用时，自动切换到备选提供商
- 能力部分功能不可用时，返回 `degraded` 状态

## HTTP 兼容层

为向后兼容，Gateway 同时提供 HTTP REST API：

| HTTP | gRPC |
|------|------|
| `POST /api/execute` | `Execute` |
| `GET /api/capabilities` | `GetCapabilities` |
| `GET /api/health` | `HealthCheck` |
| `GET /api/events` (SSE) | `Connect` (单向) |

## 安全

### 认证

- gRPC: 使用 metadata 传递 API Key
- HTTP: 使用 `X-Api-Key` 头

### 加密

- 内网部署: 可选 TLS
- 公网部署: 必须启用 TLS
