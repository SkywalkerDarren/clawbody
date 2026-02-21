# 迁移计划

从现有代码迁移到新架构的详细步骤。

## 迁移路线图

```
Phase 1: 基础设施 ──▶ Phase 2: TTS 抽象 ──▶ Phase 3: Gateway ──▶ Phase 4: 能力迁移 ──▶ Phase 5: 新能力
   (1-2 周)              (1 周)               (1-2 周)             (2 周)              (持续)
```

---

## Phase 1: 基础设施

### 目标

- 建立 monorepo 结构
- 定义 protobuf 协议
- 实现 `@clawbody/core` 包

### 步骤

#### 1.1 初始化 Monorepo

```bash
# 初始化 pnpm workspace
pnpm init

# 创建 workspace 配置
cat > pnpm-workspace.yaml << 'EOF'
packages:
  - 'packages/*'
  - 'capabilities/*'
  - 'tools/*'
EOF

# 安装 Turborepo
pnpm add -Dw turbo typescript @types/node

# 创建 turbo.json
cat > turbo.json << 'EOF'
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["build"]
    },
    "lint": {}
  }
}
EOF
```

#### 1.2 创建目录结构

```bash
mkdir -p packages/{core,gateway,proto-gen}/src
mkdir -p capabilities/{live2d,tts,vision}/src
mkdir -p proto
mkdir -p config

# 保留旧代码作为参考
mv live2d-desktop capabilities/live2d/legacy
mv qwen-tts-service services/qwen-tts
```

#### 1.3 定义 Protobuf 协议

创建 `proto/nervous.proto`:

```protobuf
syntax = "proto3";

package clawbody.nervous;

service NervousSystem {
  rpc Connect(stream BrainMessage) returns (stream BodyMessage);
  rpc Execute(ExecuteRequest) returns (ExecuteResponse);
  rpc ExecuteStream(ExecuteRequest) returns (stream ExecuteChunk);
  rpc GetCapabilities(GetCapabilitiesRequest) returns (GetCapabilitiesResponse);
  rpc HealthCheck(HealthCheckRequest) returns (HealthCheckResponse);
}

// ... 完整定义见 PROTOCOL.md
```

#### 1.4 实现 @clawbody/core

核心接口定义:

```typescript
// packages/core/src/capability/interface.ts
export interface ICapability<TConfig = unknown> {
  readonly meta: CapabilityMeta;
  readonly status: CapabilityStatus;
  initialize(config: TConfig): Promise<void>;
  healthCheck(): Promise<CapabilityHealth>;
  getOperations(): OperationDescriptor[];
  execute<TInput, TOutput>(operation: string, input: TInput): Promise<TOutput>;
  shutdown(): Promise<void>;
}
```

### 验收标准

- [ ] Monorepo 结构建立完成
- [ ] `pnpm build` 可以成功构建所有包
- [ ] Protobuf 代码生成正常
- [ ] `@clawbody/core` 包可以被其他包引用

---

## Phase 2: TTS 抽象

### 目标

- 实现 `ITTSProvider` 接口
- 迁移 Qwen TTS 到新接口
- 添加 Edge-TTS 作为备选

### 步骤

#### 2.1 定义提供商接口

```typescript
// capabilities/tts/src/providers/interface.ts
export interface ITTSProvider {
  readonly id: string;
  readonly name: string;
  isAvailable(): Promise<boolean>;
  listVoices(): Promise<Voice[]>;
  synthesize(options: SynthesisOptions): Promise<SynthesisResult>;
  synthesizeStream?(options: SynthesisOptions): AsyncIterable<Buffer>;
}
```

#### 2.2 迁移 Qwen TTS

从 `legacy/src/capabilities/tts.ts` 提取逻辑:

```typescript
// capabilities/tts/src/providers/qwen.ts
export class QwenTTSProvider implements ITTSProvider {
  readonly id = 'qwen';
  readonly name = 'Qwen3-TTS';

  constructor(private config: QwenConfig) {}

  async synthesize(options: SynthesisOptions): Promise<SynthesisResult> {
    // 从旧代码迁移
  }
}
```

#### 2.3 添加 Edge-TTS

```typescript
// capabilities/tts/src/providers/edge.ts
export class EdgeTTSProvider implements ITTSProvider {
  readonly id = 'edge';
  readonly name = 'Microsoft Edge TTS';

  async synthesize(options: SynthesisOptions): Promise<SynthesisResult> {
    // 调用 edge-tts CLI
  }
}
```

#### 2.4 实现提供商管理器

```typescript
// capabilities/tts/src/provider-manager.ts
export class TTSProviderManager {
  private providers = new Map<string, ITTSProvider>();

  register(provider: ITTSProvider): void { ... }
  get(id: string): ITTSProvider | undefined { ... }
  getDefault(): ITTSProvider { ... }
  async getAvailable(): Promise<ITTSProvider[]> { ... }
}
```

### 验收标准

- [ ] Qwen TTS 通过新接口正常工作
- [ ] Edge-TTS 可以作为备选使用
- [ ] 提供商可以通过配置切换
- [ ] 旧 API 保持兼容

---

## Phase 3: Gateway 实现

### 目标

- 实现 gRPC 服务端
- 实现能力注册表
- 添加 mDNS 服务发现
- HTTP 兼容层

### 步骤

#### 3.1 实现 gRPC 服务端

```typescript
// packages/gateway/src/server.ts
export class GatewayServer {
  private server: grpc.Server;
  private registry: CapabilityRegistry;

  async start(port: number): Promise<void> { ... }
  async stop(): Promise<void> { ... }
}
```

#### 3.2 实现能力注册表

```typescript
// packages/core/src/capability/registry.ts
export class CapabilityRegistry {
  register(capability: ICapability): void { ... }
  get(id: string): ICapability | undefined { ... }
  async initializeAll(configs: Record<string, unknown>): Promise<void> { ... }
}
```

#### 3.3 添加 mDNS 服务发现

```typescript
// packages/gateway/src/discovery.ts
export class ServiceDiscovery {
  publish(): void { ... }
  unpublish(): void { ... }
}
```

#### 3.4 HTTP 兼容层

保持与旧 API 的兼容:

| 旧 API | 新实现 |
|--------|--------|
| `POST /api/speak` | 转发到 TTS 能力 |
| `POST /api/expression` | 转发到 Live2D 能力 |
| `GET /api/screen` | 转发到 Vision 能力 |

### 验收标准

- [ ] gRPC 服务可以正常启动
- [ ] 能力可以通过 gRPC 调用
- [ ] mDNS 服务发现正常工作
- [ ] 旧 HTTP API 保持兼容

---

## Phase 4: 能力迁移

### 目标

- 迁移 Live2D 能力
- 迁移 Vision 能力
- 迁移 TTS 能力
- 验证所有能力正常工作

### 步骤

#### 4.1 迁移 Live2D 能力

从 `capabilities/live2d/legacy` 迁移:

```
legacy/
├── src/capabilities/live2d.ts  →  src/capability.ts
├── electron/                   →  src/electron/
└── public/                     →  src/renderer/
```

#### 4.2 迁移 Vision 能力

```
legacy/src/capabilities/vision.ts  →  capabilities/vision/src/capability.ts
```

#### 4.3 集成测试

```bash
# 启动所有服务
pnpm dev

# 测试 TTS
grpcurl -plaintext -d '{"capability_id":"tts","operation":"speak","input":"..."}' \
  localhost:50051 clawbody.nervous.NervousSystem/Execute

# 测试 Live2D
grpcurl -plaintext -d '{"capability_id":"live2d","operation":"expression","input":"..."}' \
  localhost:50051 clawbody.nervous.NervousSystem/Execute

# 测试 Vision
grpcurl -plaintext -d '{"capability_id":"vision","operation":"capture","input":"{}"}' \
  localhost:50051 clawbody.nervous.NervousSystem/Execute
```

### 验收标准

- [ ] Live2D 表情和动作正常
- [ ] TTS 语音合成正常
- [ ] Vision 截图正常
- [ ] 所有能力通过 gRPC 可调用
- [ ] HTTP 兼容 API 正常

---

## Phase 5: 新能力开发

### 5.1 Microphone 能力 (耳朵)

```typescript
// capabilities/microphone/src/capability.ts
export class MicrophoneCapability implements ICapability {
  readonly meta = {
    id: 'microphone',
    name: 'Microphone Input',
    type: 'input',
  };

  // 操作
  // - startListening: 开始录音
  // - stopListening: 停止录音
  // - getAudioLevel: 获取音量级别
}
```

### 5.2 Executor 能力 (手)

```typescript
// capabilities/executor/src/capability.ts
export class ExecutorCapability implements ICapability {
  readonly meta = {
    id: 'executor',
    name: 'Script Executor',
    type: 'action',
  };

  // 操作
  // - execute: 执行脚本
  // - listTools: 列出可用工具
}
```

---

## 回滚计划

如果迁移过程中出现问题，可以回滚到旧版本:

### 保留旧代码

```bash
# 旧代码保存在 legacy 目录
capabilities/live2d/legacy/
```

### 快速回滚

```bash
# 停止新服务
pnpm stop

# 启动旧服务
cd capabilities/live2d/legacy
./start.sh
```

### 数据兼容

- 配置文件格式保持兼容
- API 响应格式保持兼容
- 无需数据迁移

---

## 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| gRPC 学习曲线 | 中 | 保留 HTTP 兼容层 |
| Protobuf 版本兼容 | 低 | 使用 proto3，向后兼容 |
| 性能回归 | 中 | 基准测试，性能监控 |
| 功能遗漏 | 中 | 完整的集成测试 |

---

## 时间线

| 阶段 | 预计时间 | 依赖 |
|------|----------|------|
| Phase 1 | 1-2 周 | 无 |
| Phase 2 | 1 周 | Phase 1 |
| Phase 3 | 1-2 周 | Phase 1 |
| Phase 4 | 2 周 | Phase 2, 3 |
| Phase 5 | 持续 | Phase 4 |

总计: 约 5-7 周完成核心迁移
