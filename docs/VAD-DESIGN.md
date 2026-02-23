# VAD (Voice Activity Detection) 设计文档

## 1. 概述

VAD 模块负责检测音频流中的语音活动，当检测到说话时触发 STT 转录。

### 1.1 设计目标

- 支持多种 VAD 后端（Silero VAD 优先，预留 Pyannote 接口）
- 低延迟检测（<100ms）
- 与 STT 无缝集成
- 支持连续监听模式

### 1.2 模块位置

```
clawbody/
├── services/
│   └── silero-vad/          # Python VAD 服务 (新增)
│       ├── src/
│       │   └── silero_vad/
│       │       ├── server.py
│       │       └── detector.py
│       ├── pyproject.toml
│       └── start.sh
│
├── capabilities/
│   └── vad/                  # TypeScript VAD 能力 (新增)
│       └── src/
│           ├── capability.ts
│           ├── providers/
│           │   ├── interface.ts
│           │   └── silero.ts
│           └── index.ts
```

**决策理由**:
- VAD 核心检测逻辑放在 `services/silero-vad/`（Python，因为 Silero 是 PyTorch 模型）
- VAD 能力接口放在 `capabilities/vad/`（TypeScript，与其他能力一致）
- 这与 STT 的架构模式完全一致

## 2. 接口设计

### 2.1 IVADProvider 接口

```typescript
/**
 * VAD 检测结果
 */
export interface VADSegment {
  start: number;        // 开始时间 (秒)
  end: number;          // 结束时间 (秒)
  confidence: number;   // 置信度 (0-1)
  isSpeech: boolean;    // 是否为语音
}

/**
 * VAD 事件类型
 */
export type VADEventType =
  | 'speech_start'      // 开始说话
  | 'speech_end'        // 停止说话
  | 'speech_segment';   // 语音片段

/**
 * VAD 事件
 */
export interface VADEvent {
  type: VADEventType;
  timestamp: number;
  segment?: VADSegment;
  audioBuffer?: Buffer;  // speech_end 时包含完整音频
}

/**
 * VAD 配置
 */
export interface VADConfig {
  threshold?: number;           // 语音检测阈值 (0-1, 默认 0.5)
  minSpeechDurationMs?: number; // 最小语音时长 (默认 250ms)
  minSilenceDurationMs?: number;// 最小静音时长，用于判断说话结束 (默认 500ms)
  speechPadMs?: number;         // 语音前后填充 (默认 300ms)
  sampleRate?: number;          // 采样率 (默认 16000)
}

/**
 * VAD 提供商接口
 */
export interface IVADProvider {
  readonly id: string;
  readonly name: string;

  /** 检查是否可用 */
  isAvailable(): Promise<boolean>;

  /** 处理音频块，返回 VAD 事件 */
  processChunk(audio: Buffer): Promise<VADEvent | null>;

  /** 重置状态 */
  reset(): Promise<void>;

  /** 获取当前配置 */
  getConfig(): VADConfig;

  /** 更新配置 */
  updateConfig(config: Partial<VADConfig>): Promise<void>;
}
```

### 2.2 Python 服务 API

```yaml
# HTTP API

GET /health
  Response: { status: "ready" | "unavailable", model: string }

POST /process
  Request: { audio: string (base64 PCM), reset?: boolean }
  Response: {
    is_speech: boolean,
    confidence: number,
    event?: "speech_start" | "speech_end" | null,
    audio_buffer?: string  # speech_end 时返回完整语音
  }

POST /config
  Request: { threshold?: number, min_speech_ms?: number, ... }
  Response: { success: boolean }

POST /reset
  Response: { success: boolean }
```

## 3. 数据流

### 3.1 VAD → STT 集成流程

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
                    │                  │                  │
                    │                  │                  ▼
                    │                  │         ┌───────────────┐
                    │                  │         │  STT 转录     │
                    │                  │         │  (完整音频)   │
                    │                  │         └───────┬───────┘
                    │                  │                 │
                    ▼                  ▼                 ▼
            ┌─────────────────────────────────────────────────┐
            │              Event Bus (Gateway)                 │
            │  - vad:speech_start                              │
            │  - vad:speech_segment                            │
            │  - stt:transcription (最终文本)                  │
            └─────────────────────────────────────────────────┘
```

### 3.2 时序图

```
Microphone      VAD Service      VAD Capability      STT Capability
    │               │                  │                   │
    │──audio chunk──►                  │                   │
    │               │◄──processChunk───│                   │
    │               │                  │                   │
    │               │──speech_start────►                   │
    │               │                  │──emit event───────►
    │               │                  │                   │
    │──audio chunk──►                  │                   │
    │               │◄──processChunk───│                   │
    │               │                  │ (缓存音频)        │
    │               │                  │                   │
    │──silence──────►                  │                   │
    │               │◄──processChunk───│                   │
    │               │                  │                   │
    │               │──speech_end──────►                   │
    │               │  (含完整音频)    │                   │
    │               │                  │──transcribe───────►
    │               │                  │                   │
    │               │                  │◄──result──────────│
    │               │                  │                   │
```

## 4. 配置项设计

### 4.1 YAML 配置

```yaml
# config/default.yaml
capabilities:
  vad:
    enabled: true
    defaultProvider: "silero"
    providers:
      silero:
        type: "silero"
        baseUrl: "http://localhost:8767"
        timeout: 5000
    detection:
      threshold: 0.5              # 语音检测阈值
      minSpeechDurationMs: 250    # 最小语音时长
      minSilenceDurationMs: 500   # 静音多久判定说话结束
      speechPadMs: 300            # 语音前后填充
    integration:
      autoTriggerSTT: true        # 检测到语音自动触发 STT
      sttProvider: "qwen"         # 使用的 STT 提供商
```

### 4.2 环境变量

```bash
# services/silero-vad/start.sh
HOST=0.0.0.0
PORT=8767
VAD_THRESHOLD=0.5
MIN_SPEECH_MS=250
MIN_SILENCE_MS=500
```

## 5. 实现计划

### Phase 1: Python VAD 服务

1. 创建 `services/silero-vad/` 目录结构
2. 实现 Silero VAD 检测器
3. 实现 FastAPI 服务
4. 编写测试

### Phase 2: TypeScript VAD 能力

1. 创建 `capabilities/vad/` 目录结构
2. 实现 `IVADProvider` 接口
3. 实现 `SileroVADProvider`
4. 实现 `VADCapability`
5. 编写测试

### Phase 3: VAD-STT 集成

1. 在 VAD Capability 中集成 STT 调用
2. 实现事件发布
3. 端到端测试

## 6. 技术选型

### 6.1 Silero VAD

**优点**:
- 轻量级 (~1MB 模型)
- 低延迟 (<10ms per chunk)
- 高准确率
- 支持 CPU 运行
- MIT 许可证

**缺点**:
- 仅支持语音检测，不支持说话人分离

### 6.2 Pyannote (预留)

**优点**:
- 支持说话人分离
- 更精确的边界检测

**缺点**:
- 模型较大
- 需要 GPU 获得最佳性能
- 商业使用需要许可证

### 6.3 决策

当前实现 Silero VAD，预留 Pyannote 接口供未来扩展。

## 7. 依赖

### Python (services/silero-vad)

```toml
[project]
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn>=0.34.0",
    "torch>=2.0.0",
    "torchaudio>=2.0.0",
    "numpy>=2.0.0",
]
```

### TypeScript (capabilities/vad)

```json
{
  "dependencies": {
    "@clawbody/core": "workspace:*"
  }
}
```

## 8. 测试策略

### 8.1 单元测试

- VAD 检测器阈值测试
- 状态机转换测试
- 配置更新测试

### 8.2 集成测试

- VAD 服务 API 测试
- VAD → STT 链路测试

### 8.3 E2E 测试

- 麦克风输入 → VAD → STT → 文本输出

## 9. 未来扩展

1. **Pyannote 提供商**: 支持说话人分离
2. **WebRTC VAD**: 更轻量的备选方案
3. **唤醒词检测**: 集成 Porcupine 等唤醒词引擎
4. **噪声抑制**: 集成 RNNoise 等降噪模块
