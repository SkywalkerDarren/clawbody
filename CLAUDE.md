# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

ClawBody 是 OpenClaw AI 系统的"身体"组件，为远程 AI 大脑提供物理交互能力：
- Live2D 桌面伴侣（眼神/表情）
- TTS 语音合成（嘴巴）- 支持多提供商
- STT 语音识别（耳朵）- 支持流式转录
- Vision 屏幕截图（眼睛）
- Executor 脚本执行（手）- 计划中

Brain-Body 通过 gRPC 通信（神经系统），支持 mDNS 自动发现。

## 架构

```
┌─────────┐    gRPC     ┌─────────────────────────────────┐
│  Brain  │ ──────────► │           Gateway               │
│ (远程)  │             │  ┌─────┐ ┌─────┐ ┌─────┐ ┌────┐│
└─────────┘             │  │Live2D│ │ TTS │ │ STT │ │Vis ││
                        │  └─────┘ └─────┘ └─────┘ └────┘│
                        │         Capabilities            │
                        └───────────────┬─────────────────┘
                                        │ WS/SSE
                                        ▼
                        ┌─────────────────────────────────┐
                        │     Desktop (Electron)          │
                        │     PIXI.js + Live2D            │
                        └─────────────────────────────────┘
```

- **Gateway**: 唯一入口，提供 gRPC (外部) + HTTP/WS/SSE (前端)
- **Capabilities**: 纯能力实现，通过事件系统与 Gateway 通信
- **Desktop**: Electron 桌面小部件，连接 Gateway 显示 Live2D

## 开发理念：文档即产品

**核心原则**: 先写文档 → 再写测试 → 最后开发 → 架构师 Review

## 开发流程（必须遵守）

### Phase 1: 文档先行

任何新功能或重构，必须先完成文档：

```
1. 架构师 (architect agent) 分析需求，编写设计文档
2. 文档落实到 docs/ 目录
3. 文档 Review 通过后才能进入下一阶段
```

### Phase 2: TDD 测试先行

根据文档编写测试用例：

```bash
# 1. 先写测试 (RED)
pnpm --filter @clawbody/<package> test  # 测试应该失败

# 2. 实现代码 (GREEN)
# 编写最小实现使测试通过

# 3. 重构 (REFACTOR)
# 优化代码，保持测试通过

# 4. 验证覆盖率 (80%+)
pnpm --filter @clawbody/<package> test:coverage
```

### Phase 3: 架构师 Review

开发完成且测试通过后：

```
1. 架构师 (architect agent) Review 代码
2. 验证代码逻辑/框架是否与文档匹配
3. 不匹配则修正代码或更新文档
4. Review 通过后才能合并
```

## Agent 协作模式

### 可用 Agent

| Agent | 职责 | 使用场景 |
|-------|------|----------|
| architect | 系统设计、架构决策 | 新功能设计、重构规划、代码 Review |
| planner | 实现计划、任务拆分 | 复杂功能的步骤规划 |
| tdd-guide | TDD 流程指导 | 编写测试、验证覆盖率 |
| code-reviewer | 代码审查 | 代码质量、安全检查 |
| build-error-resolver | 构建错误修复 | 编译失败、类型错误 |
| security-reviewer | 安全审计 | 敏感操作、API 端点 |

### 复杂任务的团队协作

对于重构或大功能更新，使用并行 Agent 分工：

```
┌─────────────────────────────────────────────────────┐
│                    复杂任务流程                      │
├─────────────────────────────────────────────────────┤
│  1. architect: 设计架构，输出文档                    │
│  2. planner: 拆分任务，分配职责                      │
│  3. 并行执行:                                       │
│     ├─ tdd-guide: 编写测试                          │
│     ├─ 开发者: 实现代码                             │
│     └─ security-reviewer: 安全检查                  │
│  4. code-reviewer: 代码审查                         │
│  5. architect: 最终 Review，验证文档匹配             │
└─────────────────────────────────────────────────────┘
```

### MCP 和 Skill 使用

- 善用 Figma MCP 进行 UI 设计到代码的转换
- 善用 Notion MCP 管理任务和文档
- 善用 Playwright MCP 进行 E2E 测试
- 使用 context7 MCP 查询最新库文档

## 常用命令

### Node.js (TypeScript)

```bash
# 安装依赖
pnpm install

# 构建
pnpm build                              # 构建所有包
pnpm --filter @clawbody/core build      # 构建单个包

# 测试
pnpm test                               # 运行所有测试
pnpm --filter @clawbody/core test       # 运行单个包测试
pnpm test:coverage                      # 生成覆盖率报告

# 代码质量
pnpm lint                               # ESLint 检查
pnpm typecheck                          # TypeScript 类型检查
pnpm format                             # Prettier 格式化

# 开发模式
pnpm --filter @clawbody/gateway dev     # 启动 Gateway (gRPC:50051, HTTP:4000)
pnpm --filter @clawbody/desktop start   # 启动桌面小部件

# Protobuf
pnpm proto:gen                          # 生成 protobuf 代码
```

### Python (TTS/STT 服务)

```bash
# TTS 服务
cd services/qwen3-tts
uv sync                                 # 安装依赖
./start.sh                              # 启动 TTS 服务 (端口 8765)

# STT 服务
cd services/qwen3-stt
uv sync                                 # 安装依赖
./start.sh                              # 启动 STT 服务 (端口 8766)

# 代码质量（必须通过）
ruff check .                            # Lint 检查
ruff format .                           # 格式化
pyright                                 # 类型检查

# 测试
pytest                                  # 运行测试
pytest --cov=. --cov-report=term        # 覆盖率报告

# STT 流式测试
uv run --with httpx --with sounddevice --with websockets --with numpy \
  python scripts/test_stt_stream.py
```

## 代码质量工具（必须使用）

### TypeScript

| 工具 | 用途 | 命令 |
|------|------|------|
| ESLint | 静态分析 | `pnpm lint` |
| TypeScript | 类型检查 | `pnpm typecheck` |
| Prettier | 格式化 | `pnpm format` |

### Python

| 工具 | 用途 | 命令 |
|------|------|------|
| ruff | Lint + 格式化 | `ruff check .` / `ruff format .` |
| pyright | 类型检查 | `pyright` |
| pytest | 测试 | `pytest` |

## 架构要点

### 能力插件接口

所有能力模块实现 `ICapability` 接口：

```typescript
interface ICapability<TConfig> {
  readonly meta: CapabilityMeta;
  readonly status: CapabilityStatus;
  initialize(config: TConfig): Promise<void>;
  healthCheck(): Promise<CapabilityHealth>;
  getOperations(): OperationDescriptor[];
  execute<TInput, TOutput>(operation: string, input: TInput): Promise<TOutput>;
  subscribe?(handler: EventHandler): Unsubscribe;  // 事件订阅
  shutdown(): Promise<void>;
}
```

### TTS 提供商接口

```typescript
interface ITTSProvider {
  readonly id: string;
  readonly name: string;
  isAvailable(): Promise<boolean>;
  listVoices(): Promise<Voice[]>;
  synthesize(options: SynthesisOptions): Promise<SynthesisResult>;
}
```

### STT 提供商接口

```typescript
interface ISTTProvider {
  readonly id: string;
  readonly name: string;
  readonly supportedLanguages: SupportedLanguage[];
  isAvailable(): Promise<boolean>;
  transcribe(audio: Buffer, options?: TranscriptionOptions): Promise<TranscriptionResult>;
  createStreamingSession(options?: StreamingSessionOptions): Promise<StreamingSession>;
  sendAudioChunk(sessionId: string, chunk: Buffer): Promise<TranscriptSegment | null>;
  endStreamingSession(sessionId: string): Promise<TranscriptionResult>;
}
```

### gRPC 服务

```protobuf
service NervousSystem {
  rpc Connect(stream BrainMessage) returns (stream BodyMessage);  // 双向流
  rpc Execute(ExecuteRequest) returns (ExecuteResponse);          // 单次调用
  rpc ExecuteStream(ExecuteRequest) returns (stream ExecuteChunk); // 流式输出
  rpc GetCapabilities(GetCapabilitiesRequest) returns (GetCapabilitiesResponse);
  rpc HealthCheck(HealthCheckRequest) returns (HealthCheckResponse);
}
```

## 目录结构

```
clawbody/
├── packages/
│   ├── core/           # 核心库：能力接口、注册表、状态管理、日志
│   ├── gateway/        # 网关：gRPC + HTTP/WS/SSE 服务端、路由、mDNS
│   │   └── public/     # Live2D 前端资源 (PIXI.js, 模型)
│   └── proto-gen/      # 生成的 protobuf 代码
├── capabilities/
│   ├── live2d/         # Live2D 能力 (表情、动作、显示)
│   ├── tts/            # TTS 能力 (Edge, Qwen 提供商)
│   ├── stt/            # STT 能力 (流式语音识别)
│   └── vision/         # Vision 能力 (屏幕截图)
├── services/
│   ├── qwen3-tts/      # Qwen TTS Python 服务
│   └── qwen3-stt/      # Qwen STT Python 服务 (流式)
├── plugins/
│   └── openclaw-presence/  # OpenClaw Presence 插件 (TTS 输出 + STT 输入)
├── scripts/
│   └── test_stt_stream.py  # STT 流式测试脚本
├── apps/
│   └── desktop/        # Electron 桌面小部件
├── proto/              # Protocol Buffers 定义
├── config/             # 配置文件 (YAML)
└── docs/               # 文档
```

## 文档索引

- `docs/ARCHITECTURE.md` - 架构设计
- `docs/PROTOCOL.md` - gRPC 通信协议
- `docs/API.md` - API 参考
- `docs/DEVELOPMENT.md` - 开发指南
- `docs/DEPLOYMENT.md` - 部署指南
- `docs/MIGRATION.md` - 迁移计划
- `docs/ROADMAP.md` - 产品路线图
