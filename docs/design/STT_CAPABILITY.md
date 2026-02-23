# STT (Speech-to-Text) 能力设计文档

## 1. 概述

### 1.1 目标

STT (Speech-to-Text) 是 ClawBody 的"耳朵"能力，负责将语音输入转换为文本。作为输入型能力，它与 TTS（嘴巴）形成对称，使 AI 能够"听到"用户的声音。

### 1.2 设计隐喻

| 身体部位 | 能力 | 数据流向 |
|----------|------|----------|
| 嘴巴 | TTS | 文本 → 音频 (输出) |
| 耳朵 | STT | 音频 → 文本 (输入) |

### 1.3 核心需求

| 需求 | 优先级 | 说明 |
|------|--------|------|
| 流式转录 | P0 | 实时语音识别，低延迟 |
| 批量转录 | P1 | 完整音频文件转录 |
| 多提供商 | P0 | Qwen3-ASR 为主，支持扩展 |
| 多语言 | P1 | 中文、英文、日文等 |
| VAD | P2 | 语音活动检测，自动分段 |

## 2. 架构设计

### 2.1 系统架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        OpenClaw Brain                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP / SSE
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      ClawBody Gateway                            │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    STT Capability                           │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │ │
│  │  │ Qwen3-ASR    │  │   Whisper    │  │    Azure     │     │ │
│  │  │  Provider    │  │   Provider   │  │   Provider   │     │ │
│  │  └──────┬───────┘  └──────────────┘  └──────────────┘     │ │
│  └─────────┼──────────────────────────────────────────────────┘ │
│            │ HTTP                                                │
│            ▼                                                     │
│  ┌──────────────────┐                                           │
│  │  Qwen3-ASR       │  Python Service (GPU)                     │
│  │  Service         │  - Streaming transcription                │
│  │  :8766           │  - Session management                     │
│  └──────────────────┘                                           │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 数据流

#### 流式转录

```
┌────────┐    Audio Chunks     ┌─────────┐    HTTP/WS     ┌──────────┐
│ Client │ ─────────────────► │ Gateway │ ─────────────► │ Qwen3-ASR│
│        │                     │         │                │ Service  │
│        │ ◄───────────────── │         │ ◄───────────── │          │
└────────┘   Text Segments     └─────────┘   Transcripts  └──────────┘
```

#### 批量转录

```
┌────────┐    Complete Audio   ┌─────────┐      POST      ┌──────────┐
│ Client │ ─────────────────► │ Gateway │ ─────────────► │ Qwen3-ASR│
│        │                     │         │                │ Service  │
│        │ ◄───────────────── │         │ ◄───────────── │          │
└────────┘    Full Transcript  └─────────┘    Result      └──────────┘
```

## 3. 接口定义

### 3.1 STT 提供商接口 (TypeScript)

```typescript
// capabilities/stt/src/providers/interface.ts

/**
 * 支持的语言
 */
export type SupportedLanguage =
  | 'auto'      // 自动检测
  | 'zh'        // 中文
  | 'en'        // 英文
  | 'ja'        // 日文
  | 'ko'        // 韩文
  | 'yue'       // 粤语
  | 'wuu';      // 吴语

/**
 * 音频格式
 */
export interface AudioFormat {
  sampleRate: number;      // 采样率 (16000, 24000, 48000)
  channels: number;        // 声道数 (1 = mono, 2 = stereo)
  encoding: 'pcm_s16le' | 'pcm_f32le' | 'wav' | 'mp3' | 'opus';
}

/**
 * 转录选项
 */
export interface TranscriptionOptions {
  language?: SupportedLanguage;
  format?: AudioFormat;
  enableTimestamps?: boolean;    // 是否返回时间戳
  enablePunctuation?: boolean;   // 是否添加标点
  hotwords?: string[];           // 热词列表，提高识别准确率
}

/**
 * 转录片段
 */
export interface TranscriptSegment {
  text: string;
  startTime?: number;    // 开始时间 (秒)
  endTime?: number;      // 结束时间 (秒)
  confidence?: number;   // 置信度 (0-1)
  isFinal: boolean;      // 是否为最终结果
}

/**
 * 批量转录结果
 */
export interface TranscriptionResult {
  text: string;                      // 完整文本
  segments: TranscriptSegment[];     // 分段结果
  language: string;                  // 检测到的语言
  duration: number;                  // 音频时长 (秒)
}

/**
 * 流式会话状态
 */
export interface StreamingSession {
  sessionId: string;
  state: 'idle' | 'listening' | 'processing' | 'closed';
  createdAt: Date;
  lastActivityAt: Date;
}

/**
 * STT 提供商接口
 */
export interface ISTTProvider {
  /** 提供商 ID */
  readonly id: string;

  /** 提供商名称 */
  readonly name: string;

  /** 支持的语言列表 */
  readonly supportedLanguages: SupportedLanguage[];

  /** 检查是否可用 */
  isAvailable(): Promise<boolean>;

  /** 批量转录 */
  transcribe(
    audio: Buffer,
    options?: TranscriptionOptions
  ): Promise<TranscriptionResult>;

  /** 创建流式会话 */
  createStreamingSession(
    options?: TranscriptionOptions
  ): Promise<StreamingSession>;

  /** 发送音频块到流式会话 */
  sendAudioChunk(
    sessionId: string,
    chunk: Buffer
  ): Promise<TranscriptSegment | null>;

  /** 结束流式会话 */
  endStreamingSession(
    sessionId: string
  ): Promise<TranscriptionResult>;

  /** 取消流式会话 */
  cancelStreamingSession(sessionId: string): Promise<void>;

  /** 流式转录 (AsyncIterable 接口) */
  transcribeStream(
    audioStream: AsyncIterable<Buffer>,
    options?: TranscriptionOptions
  ): AsyncIterable<TranscriptSegment>;
}
```

### 3.2 STT 能力类

```typescript
// capabilities/stt/src/capability.ts

export interface STTConfig {
  defaultProvider: string;
  providers: Record<string, ProviderConfig>;
  streaming: StreamingConfig;
}

export interface StreamingConfig {
  chunkDurationMs: number;
  sessionTimeoutSec: number;
  silenceTimeoutSec: number;
  maxConcurrentSessions: number;
}

/**
 * STT 能力 - 支持多提供商的语音识别
 */
export class STTCapability implements ICapability<STTConfig> {
  readonly meta: CapabilityMeta = {
    id: 'stt',
    name: 'Speech-to-Text',
    version: '1.0.0',
    type: 'input',  // 输入型能力
    description: '语音识别能力，支持流式和批量转录',
  };
}
```

### 3.3 操作定义

| 操作 | 类型 | 说明 |
|------|------|------|
| `transcribe` | 同步 | 批量转录完整音频 |
| `startSession` | 同步 | 创建流式转录会话 |
| `sendChunk` | 同步 | 发送音频块到会话 |
| `endSession` | 同步 | 结束会话，获取最终结果 |
| `cancelSession` | 同步 | 取消会话 |
| `transcribeStream` | 流式 | 流式转录 (AsyncIterable) |
| `listLanguages` | 同步 | 列出支持的语言 |

## 4. API 端点设计

### 4.1 批量转录

```
POST /api/stt/transcribe
Content-Type: multipart/form-data

Request:
  - audio: File (音频文件)
  - language?: string (语言代码)
  - provider?: string (提供商)
  - enableTimestamps?: boolean

Response:
{
  "text": "识别出的完整文本",
  "segments": [
    {
      "text": "识别出的",
      "startTime": 0.0,
      "endTime": 0.5,
      "confidence": 0.95,
      "isFinal": true
    }
  ],
  "language": "zh",
  "duration": 5.2
}
```

### 4.2 创建流式会话

```
POST /api/stt/sessions
Content-Type: application/json

Request:
{
  "language": "auto",
  "provider": "qwen"
}

Response:
{
  "sessionId": "sess_abc123",
  "state": "idle",
  "wsUrl": "ws://localhost:4000/api/stt/sessions/sess_abc123/stream"
}
```

### 4.3 WebSocket 流式转录

```
WS /api/stt/sessions/:sessionId/stream

Client → Server (Binary):
  Raw PCM audio chunks (16-bit, 16kHz, mono)

Client → Server (JSON):
  { "type": "end" }      // 结束会话
  { "type": "cancel" }   // 取消会话

Server → Client (JSON):
  {
    "type": "transcript",
    "data": {
      "text": "部分结果",
      "isFinal": false,
      "confidence": 0.85
    }
  }

  {
    "type": "final",
    "data": {
      "text": "完整结果",
      "segments": [...],
      "duration": 10.5
    }
  }
```

### 4.4 简化接口

```
POST /api/listen
Content-Type: multipart/form-data

Request:
  - audio: File

Response:
{
  "ok": true,
  "text": "用户说的话",
  "language": "zh",
  "confidence": 0.95
}
```

## 5. 流式协议设计

### 5.1 会话状态机

```
                    ┌─────────────────────────────────────┐
                    │                                     │
                    ▼                                     │
┌──────┐  create  ┌──────┐  audio   ┌───────────┐       │
│ None │ ───────► │ Idle │ ───────► │ Listening │ ──────┘
└──────┘          └──────┘          └─────┬─────┘   (more audio)
                                          │
                                          │ end
                                          ▼
                                    ┌───────────┐  result  ┌────────┐
                                    │Processing │ ───────► │ Closed │
                                    └───────────┘          └────────┘
```

### 5.2 音频格式要求

| 参数 | 推荐值 | 支持范围 |
|------|--------|----------|
| 采样率 | 16000 Hz | 8000-48000 Hz |
| 位深 | 16-bit | 16-bit, 32-bit float |
| 声道 | Mono | Mono, Stereo (自动转换) |
| 编码 | PCM | PCM, WAV, MP3, Opus |

## 6. 提供商实现

### 6.1 Qwen3-ASR Provider (主要)

基于用户提供的 Qwen3-ASR streaming demo：

```python
# 核心流式 API
asr = Qwen3ASRModel.LLM(
    model="Qwen/Qwen3-ASR-1.7B",
    gpu_memory_utilization=0.8,
    max_new_tokens=32,
)

state = asr.init_streaming_state(
    unfixed_chunk_num=2,
    unfixed_token_num=5,
    chunk_size_sec=2.0,
)

# 流式处理
asr.streaming_transcribe(audio_chunk, state)
asr.finish_streaming_transcribe(state)
```

### 6.2 提供商对比

| 提供商 | 类型 | 延迟 | 准确率 | 成本 | 离线 |
|--------|------|------|--------|------|------|
| Qwen3-ASR | 本地 GPU | 低 | 高 | 免费 | ✓ |
| Whisper | 本地 | 中 | 高 | 免费 | ✓ |
| Azure | 云端 | 中 | 高 | 付费 | ✗ |

## 7. Python 服务设计

### 7.1 目录结构

```
services/qwen3-stt/
├── pyproject.toml
├── src/
│   └── qwen3_stt/
│       ├── __init__.py
│       ├── main.py          # FastAPI 入口
│       ├── config.py        # 配置管理
│       ├── model.py         # 模型加载和推理
│       ├── session.py       # 会话管理
│       └── audio.py         # 音频处理工具
├── tests/
│   ├── test_model.py
│   └── test_api.py
└── start.sh
```

### 7.2 API 端点

```python
@app.get("/health")
async def health(): ...

@app.post("/transcribe")
async def transcribe(audio: UploadFile, language: str = "auto"): ...

@app.post("/sessions")
async def create_session(language: str = "auto"): ...

@app.websocket("/sessions/{session_id}/stream")
async def stream_session(websocket: WebSocket, session_id: str): ...
```

## 8. 配置 Schema

```yaml
# config/default.yaml

capabilities:
  stt:
    enabled: true
    defaultProvider: "qwen"

    streaming:
      chunkDurationMs: 100
      sessionTimeoutSec: 30
      silenceTimeoutSec: 5
      maxConcurrentSessions: 10

    providers:
      qwen:
        type: "qwen"
        baseUrl: "http://localhost:8766"
        timeout: 30000
```

## 9. 错误处理

| 错误码 | 名称 | 说明 |
|--------|------|------|
| `STT_PROVIDER_UNAVAILABLE` | 提供商不可用 | 服务未启动或网络问题 |
| `STT_SESSION_NOT_FOUND` | 会话不存在 | 会话 ID 无效或已过期 |
| `STT_SESSION_TIMEOUT` | 会话超时 | 超过最大会话时长 |
| `STT_INVALID_AUDIO` | 音频格式错误 | 不支持的格式或损坏 |
| `STT_TRANSCRIPTION_FAILED` | 转录失败 | 模型推理错误 |

## 10. 测试策略

### 10.1 测试覆盖率目标

| 模块 | 目标覆盖率 |
|------|------------|
| Provider 接口 | 90% |
| Capability 类 | 85% |
| API 端点 | 80% |
| Python 服务 | 80% |

### 10.2 测试类型

- 单元测试：接口、工具函数
- 集成测试：API 端点、WebSocket
- E2E 测试：完整转录流程

## 11. 实现阶段

### Phase 1: 基础架构 (Week 1)

- [ ] 创建 capabilities/stt 包结构
- [ ] 定义 ISTTProvider 接口
- [ ] 实现 STTCapability 骨架
- [ ] 编写单元测试

### Phase 2: Python 服务 (Week 2)

- [ ] 创建 services/qwen3-stt 服务
- [ ] 集成 Qwen3-ASR 模型
- [ ] 实现批量转录 API
- [ ] 实现流式转录 API
- [ ] 编写 Python 测试

### Phase 3: Gateway 集成 (Week 3)

- [ ] 实现 QwenSTTProvider
- [ ] 注册 STT 能力到 Gateway
- [ ] 添加 HTTP/WebSocket 路由
- [ ] 集成测试

### Phase 4: 优化与文档 (Week 4)

- [ ] 性能优化
- [ ] 错误处理完善
- [ ] API 文档
- [ ] 使用示例
