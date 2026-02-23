# Speaker Verification (SV) 设计文档

## 1. 概述

Speaker Verification 模块负责验证说话人身份，确保只有注册用户的语音才会被 STT 转录。

### 1.1 设计目标

- 使用 WeSpeaker 进行声纹提取和验证
- 推荐模型：`voxblink2_samresnet100_ft` (SimAMResNet100, VoxBlink2 + VoxCeleb2 finetune)
- 支持按模型名配置加载
- 低延迟验证 (<100ms)
- 与 VAD → STT 链路无缝集成

### 1.2 模块位置

```
clawbody/
├── services/
│   └── wespeaker-sv/              # Python SV 服务 (新增)
│       ├── src/
│       │   └── sv_service/
│       │       ├── __init__.py
│       │       ├── server.py      # FastAPI 服务
│       │       ├── verifier.py    # 声纹验证器
│       │       └── storage.py     # 声纹存储
│       ├── pyproject.toml
│       └── start.sh
│
├── capabilities/
│   └── speaker-verification/      # TypeScript SV 能力 (新增)
│       └── src/
│           ├── capability.ts
│           ├── providers/
│           │   ├── interface.ts
│           │   └── wespeaker.ts
│           └── index.ts
```

## 2. 接口设计

### 2.1 ISpeakerVerificationProvider 接口

```typescript
export interface Speaker {
  id: string;
  name: string;
  enrolledAt: Date;
  embeddingCount: number;
}

export interface VerificationResult {
  verified: boolean;
  speakerId: string | null;
  speakerName: string | null;
  confidence: number;
  threshold: number;
}

export interface EnrollmentResult {
  success: boolean;
  speakerId: string;
  speakerName: string;
  embeddingCount: number;
  message?: string;
}

export interface SVConfig {
  model: string;
  threshold: number;
  device: string;
  applyVAD: boolean;
}

export interface ISpeakerVerificationProvider {
  readonly id: string;
  readonly name: string;
  isAvailable(): Promise<boolean>;
  enroll(speakerId: string, speakerName: string, audio: Buffer): Promise<EnrollmentResult>;
  verify(audio: Buffer): Promise<VerificationResult>;
  listSpeakers(): Promise<Speaker[]>;
  deleteSpeaker(speakerId: string): Promise<boolean>;
  getConfig(): Promise<SVConfig>;
  updateConfig(config: Partial<SVConfig>): Promise<void>;
}
```

### 2.2 Python 服务 API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/enroll` | POST | 注册说话人声纹 |
| `/verify` | POST | 验证说话人 |
| `/speakers` | GET | 列出所有说话人 |
| `/speakers/{id}` | DELETE | 删除说话人 |
| `/config` | GET/POST | 获取/更新配置 |

## 3. 数据流

### 3.1 VAD → SV → STT 集成流程

```
┌─────────────┐     音频流      ┌─────────────┐
│  Microphone │ ──────────────► │     VAD     │
└─────────────┘                 └──────┬──────┘
                                       │ speech_end
                                       ▼
                               ┌───────────────┐
                               │      SV       │
                               │    verify()   │
                               └───────┬───────┘
                                       │
                        ┌──────────────┴──────────────┐
                        ▼                             ▼
                   verified=true               verified=false
                        │                             │
                        ▼                             ▼
               ┌───────────────┐              ┌───────────────┐
               │  STT 转录     │              │   丢弃音频    │
               └───────────────┘              └───────────────┘
```

## 4. 声纹存储

```json
{
  "speakers": {
    "user_001": {
      "name": "张三",
      "enrolled_at": "2025-01-15T10:30:00Z",
      "embeddings": [[0.123, -0.456, ...]],
      "mean_embedding": [0.124, -0.457, ...]
    }
  }
}
```

## 5. 配置项

```yaml
capabilities:
  speaker-verification:
    enabled: true
    providers:
      wespeaker:
        type: "wespeaker"
        baseUrl: "http://localhost:8768"
    verification:
      model: "voxblink2_samresnet100_ft"
      threshold: 0.6
      device: "cuda"
      applyVAD: true
    storage:
      path: "./data/speakers.json"
    integration:
      enabled: true
      rejectUnknown: true
```

## 6. 模型选型

| 模型 | 维度 | 特点 | 推荐场景 |
|------|------|------|----------|
| `voxblink2_samresnet100_ft` | 512 | 多语言最佳 | **推荐** |
| `voxblink2_samresnet34_ft` | 256 | 轻量版 | 资源受限 |
| `campplus` | 512 | 中文优化 | 纯中文 |

## 7. 端口分配

| 服务 | 端口 |
|------|------|
| Gateway | 4000 |
| TTS | 8765 |
| STT | 8766 |
| VAD | 8767 |
| **SV** | **8768** |
