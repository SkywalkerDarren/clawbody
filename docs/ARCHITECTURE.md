# ClawBody 架构设计文档

## 1. 项目概述

ClawBody 是 OpenClaw AI 系统的"身体"部分，负责提供各种物理交互能力。AI 大脑（Brain）运行在另一台设备上，通过网络与身体通信。

### 1.1 设计隐喻

| 身体部位 | 能力模块 | 功能 |
|----------|----------|------|
| 眼神/表情 | Live2D | 桌面伴侣，视觉呈现 |
| 嘴巴 | TTS | 语音合成输出 |
| 耳朵 | STT | 语音识别输入（流式支持） |
| 听觉神经 | VAD | 语音活动检测，触发 STT |
| 眼睛 | Vision | 屏幕截图/视觉输入 |
| 手 | Executor | 脚本执行/工具使用 (计划中) |
| 神经系统 | Gateway | Brain-Body 通信 |

### 1.2 系统架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        OpenClaw Brain                            │
│                    (Raspberry Pi / 远程设备)                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ gRPC (神经系统)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      ClawBody Gateway                            │
│                    (能力注册 + 路由 + 状态)                        │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │  Live2D  │  │   TTS    │  │   STT    │  │   VAD    │  ...   │
│  │  (眼神)  │  │  (嘴巴)  │  │  (耳朵)  │  │(听觉神经)│        │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │
│       │              │              │              │            │
│       ▼              ▼              ▼              ▼            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │ Electron │  │Qwen/Edge │  │Qwen3-ASR │  │Silero VAD│        │
│  │ + PIXI   │  │ /Coqui   │  │          │  │          │        │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │
└─────────────────────────────────────────────────────────────────┘
```

## 2. 目录结构

```
clawbody/
├── proto/                          # Protocol Buffers 定义
│   ├── capability.proto            # 能力接口定义
│   ├── nervous.proto               # 神经系统通信协议
│   └── types.proto                 # 共享类型
│
├── packages/
│   ├── core/                       # 核心库 (TypeScript)
│   │   └── src/
│   │       ├── capability/         # 能力插件接口
│   │       ├── nervous/            # 神经系统客户端
│   │       ├── state/              # 状态管理
│   │       └── logger/             # 统一日志
│   │
│   ├── gateway/                    # Body 网关服务
│   │   └── src/
│   │       ├── server.ts           # gRPC 服务端
│   │       ├── router.ts           # 能力路由
│   │       ├── discovery.ts        # 服务发现 (mDNS)
│   │       └── health.ts           # 健康检查
│   │
│   └── proto-gen/                  # 生成的 protobuf 代码
│
├── capabilities/                   # 能力插件 (独立部署)
│   ├── live2d/                     # Live2D 桌面伴侣
│   ├── tts/                        # TTS 语音合成 (多提供商)
│   ├── stt/                        # STT 语音识别 (流式支持)
│   ├── vad/                        # VAD 语音活动检测
│   ├── vision/                     # 视觉/截图能力
│   └── executor/                   # 脚本执行 (计划中)
│
├── services/                       # 外部服务
│   ├── qwen3-tts/                  # Qwen TTS Python 服务
│   ├── qwen3-stt/                  # Qwen STT Python 服务 (流式)
│   └── silero-vad/                 # Silero VAD Python 服务
│
├── config/                         # 配置文件
│   ├── default.yaml
│   └── production.yaml
│
└── docs/                           # 文档
```

## 3. 核心设计

### 3.1 能力插件接口

所有能力模块必须实现 `ICapability` 接口：

```typescript
interface ICapability<TConfig = unknown> {
  readonly meta: CapabilityMeta;
  readonly status: CapabilityStatus;

  initialize(config: TConfig): Promise<void>;
  healthCheck(): Promise<CapabilityHealth>;
  getOperations(): OperationDescriptor[];
  execute<TInput, TOutput>(operation: string, input: TInput): Promise<TOutput>;
  shutdown(): Promise<void>;
}
```

### 3.2 能力类型

| 类型 | 说明 | 示例 |
|------|------|------|
| output | 输出型，向外界发送信息 | TTS, Live2D |
| input | 输入型，从外界接收信息 | Microphone, Vision |
| action | 动作型，执行操作 | Executor |
| composite | 组合型，包含多种能力 | - |

### 3.3 能力状态

```
initializing → ready ⇄ busy
                 ↓
              degraded → unavailable
                 ↓
               error
```

## 4. 通信协议

### 4.1 协议选型

| 协议 | 延迟 | 双向 | 流式 | 类型安全 | 选择 |
|------|------|------|------|----------|------|
| gRPC | 低 | ✓ | ✓ | ✓ | 主协议 |
| WebSocket | 中 | ✓ | ✓ | ✗ | 浏览器兼容 |
| HTTP REST | 高 | ✗ | ✗ | ✗ | 向后兼容 |

### 4.2 gRPC 服务定义

```protobuf
service NervousSystem {
  // 双向流：Brain <-> Body 实时通信
  rpc Connect(stream BrainMessage) returns (stream BodyMessage);

  // 单次调用：执行能力操作
  rpc Execute(ExecuteRequest) returns (ExecuteResponse);

  // 流式调用：执行流式操作
  rpc ExecuteStream(ExecuteRequest) returns (stream ExecuteChunk);

  // 查询能力
  rpc GetCapabilities(GetCapabilitiesRequest) returns (GetCapabilitiesResponse);
}
```

### 4.3 服务发现

使用 mDNS (Bonjour) 实现局域网内自动发现：

- 服务类型: `_clawbody._tcp.local`
- Brain 无需硬编码 Body 地址
- 支持多 Body 实例

## 5. TTS 多提供商架构

### 5.1 提供商接口

```typescript
interface ITTSProvider {
  readonly id: string;
  readonly name: string;

  isAvailable(): Promise<boolean>;
  listVoices(): Promise<Voice[]>;
  synthesize(options: SynthesisOptions): Promise<SynthesisResult>;
  synthesizeStream?(options: SynthesisOptions): AsyncIterable<Buffer>;
}
```

### 5.2 支持的提供商

| 提供商 | 类型 | 特点 |
|--------|------|------|
| Qwen3-TTS | 本地 GPU | 高质量中文，需要 GPU |
| Edge-TTS | 云端免费 | 微软语音，无需 GPU |
| Coqui TTS | 本地开源 | 多语言，可离线 |
| OpenAI TTS | 云端付费 | 高质量，需要 API Key |

### 5.3 提供商选择策略

1. 优先使用配置的默认提供商
2. 如果默认不可用，自动降级到备选
3. 支持按请求指定提供商

## 6. STT 多提供商架构

### 6.1 提供商接口

```typescript
interface ISTTProvider {
  readonly id: string;
  readonly name: string;
  readonly supportedLanguages: SupportedLanguage[];

  isAvailable(): Promise<boolean>;
  transcribe(audio: Buffer, options?: TranscriptionOptions): Promise<TranscriptionResult>;
  transcribeStream(audioStream: AsyncIterable<Buffer>, options?: TranscriptionOptions): AsyncIterable<TranscriptSegment>;
  createStreamingSession(options?: StreamingSessionOptions): Promise<StreamingSession>;
  sendAudioChunk(sessionId: string, chunk: Buffer): Promise<TranscriptSegment | null>;
  endStreamingSession(sessionId: string): Promise<TranscriptionResult>;
  cancelStreamingSession(sessionId: string): Promise<void>;
}
```

### 6.2 支持的提供商

| 提供商 | 类型 | 特点 |
|--------|------|------|
| Qwen3-ASR | 本地 GPU | 高质量中英文，支持流式，需要 GPU |
| Whisper | 本地 | 多语言，可离线（计划中） |
| Azure Speech | 云端付费 | 高准确率，需要 API Key（计划中） |

### 6.3 流式转录流程

```
┌─────────┐    创建会话     ┌─────────────┐
│  客户端  │ ──────────────► │  STT 服务   │
└─────────┘                 └─────────────┘
     │                            │
     │  WebSocket 连接            │
     │ ◄─────────────────────────►│
     │                            │
     │  发送音频块 (PCM 16-bit)    │
     │ ──────────────────────────►│
     │                            │
     │  返回部分转录结果           │
     │ ◄──────────────────────────│
     │                            │
     │  发送结束信号               │
     │ ──────────────────────────►│
     │                            │
     │  返回最终结果               │
     │ ◄──────────────────────────│
```

## 7. VAD 语音活动检测

### 7.1 提供商接口

```typescript
interface IVADProvider {
  readonly id: string;
  readonly name: string;

  isAvailable(): Promise<boolean>;
  processChunk(audio: Buffer): Promise<VADEvent | null>;
  reset(): Promise<void>;
  getConfig(): VADConfig;
  updateConfig(config: Partial<VADConfig>): Promise<void>;
}

interface VADEvent {
  type: 'speech_start' | 'speech_end' | 'speech_segment';
  timestamp: number;
  segment?: VADSegment;
  audioBuffer?: Buffer;  // speech_end 时包含完整音频
}
```

### 7.2 支持的提供商

| 提供商 | 类型 | 特点 |
|--------|------|------|
| Silero VAD | 本地 CPU | 轻量级 (~1MB)，低延迟 (<10ms)，MIT 许可 |
| Pyannote | 本地 GPU | 支持说话人分离（计划中） |

### 7.3 VAD → STT 集成流程

```
┌─────────────┐     音频流      ┌─────────────┐
│  Microphone │ ──────────────► │     VAD     │
│   (输入)    │   PCM 16kHz     │   Capability │
└─────────────┘                 └──────┬──────┘
                                       │
                    ┌──────────────────┼──────────────────┐
                    │                  │                  │
                    ▼                  ▼                  ▼
            speech_start         speech_segment      speech_end
                                                         │
                                                         ▼
                                                ┌───────────────┐
                                                │  STT 转录     │
                                                │  (完整音频)   │
                                                └───────────────┘
```

## 8. 部署模式

### 8.1 单机部署 (开发)

所有组件在单一进程中运行，适合开发和简单场景。

### 8.2 分离部署 (生产)

```
Gateway (主进程)
    ├── Live2D (Electron 进程)
    ├── TTS (Python 进程)
    ├── STT (Python 进程)
    ├── VAD (Python 进程)
    └── Vision (Node 进程)
```

通过本地 IPC 或 Unix Socket 通信。

### 8.3 分布式部署 (高可用)

多机部署，通过 gRPC 跨网络通信：

- Machine 1: Gateway + Live2D
- Machine 2: TTS + STT + VAD (GPU 机器)
- Machine 3: Vision (多屏幕)

## 9. 配置管理

### 9.1 配置文件

```yaml
# config/default.yaml
gateway:
  grpc:
    port: 50051
  discovery:
    enabled: true

capabilities:
  tts:
    defaultProvider: "qwen"
    providers:
      qwen:
        baseUrl: "http://localhost:8765"
      edge:
        defaultVoice: "zh-CN-XiaoxiaoNeural"
  stt:
    defaultProvider: "qwen"
    providers:
      qwen:
        baseUrl: "http://localhost:8766"
    streaming:
      chunkDurationMs: 100
      sessionTimeoutSec: 30
  vad:
    defaultProvider: "silero"
    providers:
      silero:
        baseUrl: "http://localhost:8767"
    detection:
      threshold: 0.5
      minSpeechDurationMs: 250
      minSilenceDurationMs: 500
```

### 9.2 环境变量

- `NODE_ENV`: 运行环境 (development/production)
- `API_KEY`: 认证密钥
- `CUDA_VISIBLE_DEVICES`: GPU 设备 (TTS/STT 服务)

## 10. 扩展指南

### 10.1 添加新能力

1. 在 `capabilities/` 下创建新目录
2. 实现 `ICapability` 接口
3. 在配置文件中添加能力配置
4. 在 Gateway 中注册能力

### 10.2 添加新 TTS 提供商

1. 在 `capabilities/tts/src/providers/` 下创建新文件
2. 实现 `ITTSProvider` 接口
3. 在配置文件中添加提供商配置

### 10.3 添加新 STT 提供商

1. 在 `capabilities/stt/src/providers/` 下创建新文件
2. 实现 `ISTTProvider` 接口
3. 在配置文件中添加提供商配置

### 10.4 添加新 VAD 提供商

1. 在 `capabilities/vad/src/providers/` 下创建新文件
2. 实现 `IVADProvider` 接口
3. 在配置文件中添加提供商配置

## 11. 参考

- [Protocol Buffers](https://protobuf.dev/)
- [gRPC Node.js](https://grpc.io/docs/languages/node/)
- [mDNS/Bonjour](https://developer.apple.com/bonjour/)
- [Live2D Cubism SDK](https://www.live2d.com/en/sdk/)
