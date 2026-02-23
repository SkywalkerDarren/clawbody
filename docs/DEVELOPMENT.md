# 开发指南

## 开发环境设置

### 1. 系统要求

- Node.js >= 20
- pnpm >= 9
- Python >= 3.12
- Git

### 2. 克隆仓库

```bash
git clone https://github.com/your-org/clawbody.git
cd clawbody
```

### 3. 安装依赖

```bash
# 安装 Node.js 依赖
pnpm install

# 安装 Python 依赖 (TTS 服务)
cd services/qwen3-tts
uv sync
cd ../..

# 安装 Python 依赖 (STT 服务)
cd services/qwen3-stt
uv sync
cd ../..

# 安装 Python 依赖 (VAD 服务)
cd services/silero-vad
uv sync
cd ../..
```

### 4. 生成 Protobuf 代码

```bash
pnpm proto:gen
```

### 5. 构建项目

```bash
# 构建所有包
pnpm build

# 构建单个包
pnpm --filter @clawbody/core build
```

---

## 项目结构

```
clawbody/
├── packages/                 # 核心包
│   ├── core/                 # 核心库
│   │   ├── src/
│   │   │   ├── capability/   # 能力接口
│   │   │   ├── nervous/      # 通信客户端
│   │   │   ├── state/        # 状态管理
│   │   │   └── logger/       # 日志
│   │   └── package.json
│   ├── gateway/              # 网关服务
│   └── proto-gen/            # Protobuf 生成代码
│
├── capabilities/             # 能力插件
│   ├── live2d/
│   ├── tts/
│   ├── stt/
│   ├── vad/
│   └── vision/
│
├── services/                 # 外部服务
│   ├── qwen3-tts/            # Qwen TTS Python 服务
│   ├── qwen3-stt/            # Qwen STT Python 服务
│   └── silero-vad/           # Silero VAD Python 服务
│
├── plugins/                  # OpenClaw 插件
│   └── openclaw-presence/    # Presence 通道插件
│
├── scripts/                  # 测试脚本
│   ├── test_stt_stream.py    # STT 流式测试
│   └── ...
│
├── proto/                    # Protobuf 定义
├── config/                   # 配置文件
└── docs/                     # 文档
```

---

## 开发工作流

### 启动开发服务器

```bash
# 终端 1: 启动 TTS 服务
cd services/qwen3-tts
./start.sh

# 终端 2: 启动 STT 服务
cd services/qwen3-stt
./start.sh

# 终端 3: 启动 VAD 服务
cd services/silero-vad
./start.sh

# 终端 4: 启动 Gateway (开发模式)
pnpm --filter @clawbody/gateway dev

# 终端 5: 启动 Live2D (开发模式)
pnpm --filter @clawbody/live2d dev
```

### 运行测试

```bash
# 运行所有测试
pnpm test

# 运行单个包的测试
pnpm --filter @clawbody/core test

# 运行测试并生成覆盖率报告
pnpm test:coverage
```

### 代码检查

```bash
# ESLint
pnpm lint

# 类型检查
pnpm typecheck

# 格式化
pnpm format
```

---

## 添加新能力

### 1. 创建能力目录

```bash
mkdir -p capabilities/my-capability/src
cd capabilities/my-capability
```

### 2. 初始化 package.json

```json
{
  "name": "@clawbody/my-capability",
  "version": "1.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "dependencies": {
    "@clawbody/core": "workspace:*"
  }
}
```

### 3. 实现能力接口

```typescript
// src/capability.ts
import {
  ICapability,
  CapabilityMeta,
  CapabilityStatus,
  CapabilityHealth,
  OperationDescriptor,
  ExecutionContext,
} from '@clawbody/core';

export interface MyCapabilityConfig {
  // 配置选项
}

export class MyCapability implements ICapability<MyCapabilityConfig> {
  readonly meta: CapabilityMeta = {
    id: 'my-capability',
    name: 'My Capability',
    version: '1.0.0',
    type: 'output',
    description: '我的自定义能力',
  };

  private _status: CapabilityStatus = 'initializing';

  get status(): CapabilityStatus {
    return this._status;
  }

  async initialize(config: MyCapabilityConfig): Promise<void> {
    // 初始化逻辑
    this._status = 'ready';
  }

  async healthCheck(): Promise<CapabilityHealth> {
    return {
      status: this._status,
      lastCheck: new Date(),
    };
  }

  getOperations(): OperationDescriptor[] {
    return [
      {
        name: 'myOperation',
        description: '执行某个操作',
        inputSchema: {
          type: 'object',
          properties: {
            param1: { type: 'string' },
          },
          required: ['param1'],
        },
        outputSchema: {
          type: 'object',
          properties: {
            result: { type: 'string' },
          },
        },
        streaming: false,
      },
    ];
  }

  async execute<TInput, TOutput>(
    operation: string,
    input: TInput,
    context?: ExecutionContext
  ): Promise<TOutput> {
    switch (operation) {
      case 'myOperation':
        return this.myOperation(input as MyOperationInput) as Promise<TOutput>;
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  }

  private async myOperation(input: MyOperationInput): Promise<MyOperationOutput> {
    // 实现逻辑
    return { result: 'done' };
  }

  async shutdown(): Promise<void> {
    this._status = 'unavailable';
  }
}

interface MyOperationInput {
  param1: string;
}

interface MyOperationOutput {
  result: string;
}
```

### 4. 导出能力

```typescript
// src/index.ts
export { MyCapability, MyCapabilityConfig } from './capability';
```

### 5. 注册能力

在 Gateway 配置中添加：

```yaml
# config/default.yaml
capabilities:
  my-capability:
    enabled: true
    # 其他配置...
```

---

## 添加新 TTS 提供商

### 1. 创建提供商文件

```typescript
// capabilities/tts/src/providers/my-provider.ts
import { ITTSProvider, Voice, SynthesisOptions, SynthesisResult } from './interface';

export interface MyProviderConfig {
  apiKey: string;
  baseUrl?: string;
}

export class MyTTSProvider implements ITTSProvider {
  readonly id = 'my-provider';
  readonly name = 'My TTS Provider';

  private config: MyProviderConfig;

  constructor(config: MyProviderConfig) {
    this.config = config;
  }

  async isAvailable(): Promise<boolean> {
    // 检查服务是否可用
    try {
      const res = await fetch(`${this.config.baseUrl}/health`);
      return res.ok;
    } catch {
      return false;
    }
  }

  async listVoices(): Promise<Voice[]> {
    // 返回可用声音列表
    return [
      { id: 'voice1', name: 'Voice 1', language: 'zh-CN', gender: 'female' },
    ];
  }

  async synthesize(options: SynthesisOptions): Promise<SynthesisResult> {
    // 实现语音合成
    const response = await fetch(`${this.config.baseUrl}/synthesize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        text: options.text,
        voice: options.voice,
      }),
    });

    const data = await response.json();
    return {
      audio: Buffer.from(data.audio, 'base64'),
      format: 'wav',
      sampleRate: 24000,
      duration: data.duration,
    };
  }
}
```

### 2. 注册提供商

```typescript
// capabilities/tts/src/providers/index.ts
export { MyTTSProvider } from './my-provider';
```

### 3. 添加配置

```yaml
# config/default.yaml
capabilities:
  tts:
    providers:
      my-provider:
        type: "my-provider"
        apiKey: "${MY_PROVIDER_API_KEY}"
        baseUrl: "https://api.my-provider.com"
```

---

## 调试

### 日志级别

```bash
# 设置日志级别
export LOG_LEVEL=debug

# 启动服务
pnpm --filter @clawbody/gateway dev
```

### gRPC 调试

使用 grpcurl 测试 gRPC 接口：

```bash
# 安装 grpcurl
go install github.com/fullstorydev/grpcurl/cmd/grpcurl@latest

# 列出服务
grpcurl -plaintext localhost:50051 list

# 调用方法
grpcurl -plaintext -d '{}' localhost:50051 clawbody.nervous.NervousSystem/GetCapabilities
```

### HTTP 调试

```bash
# 健康检查
curl http://localhost:3000/api/health | jq

# 执行操作
curl -X POST http://localhost:3000/api/execute \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: test-key" \
  -d '{
    "capability_id": "tts",
    "operation": "listVoices",
    "input": {}
  }' | jq
```

---

## 代码规范

### TypeScript

- 使用 ESLint + Prettier
- 严格模式 (`strict: true`)
- 显式类型注解

### 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 文件 | kebab-case | `my-capability.ts` |
| 类 | PascalCase | `MyCapability` |
| 接口 | PascalCase + I 前缀 | `ICapability` |
| 函数/方法 | camelCase | `executeOperation` |
| 常量 | UPPER_SNAKE_CASE | `MAX_RETRIES` |

### Git 提交规范

```
<type>: <description>

<optional body>
```

类型:
- `feat`: 新功能
- `fix`: 修复 bug
- `refactor`: 重构
- `docs`: 文档
- `test`: 测试
- `chore`: 构建/工具

---

## 发布流程

### 1. 版本更新

```bash
# 更新版本号
pnpm version patch  # 或 minor / major
```

### 2. 构建

```bash
pnpm build
```

### 3. 测试

```bash
pnpm test
```

### 4. 发布

```bash
pnpm publish --access public
```
