# ClawBody

OpenClaw AI 系统的"身体"组件 - 为 AI 大脑提供物理交互能力。

## 概述

ClawBody 是一个模块化的能力系统，让运行在远程设备上的 AI 大脑（OpenClaw Brain）能够：

- 通过 Live2D 角色展示表情和动作
- 通过 TTS 进行语音输出
- 通过截图获取视觉信息
- (计划中) 通过麦克风接收语音输入
- (计划中) 执行脚本和使用工具

## 快速开始

### 环境要求

- Node.js >= 20
- pnpm >= 9
- Python >= 3.12 (TTS 服务)
- CUDA (可选，用于 Qwen TTS)

### 安装

```bash
# 克隆仓库
git clone https://github.com/your-org/clawbody.git
cd clawbody

# 安装依赖
pnpm install

# 构建所有包
pnpm build
```

### 配置

```bash
# 复制配置模板
cp config/default.yaml config/local.yaml

# 编辑配置
vim config/local.yaml

# 设置环境变量
export API_KEY="your-api-key"
```

### 启动服务

```bash
# 启动 TTS 服务 (需要 GPU)
cd services/qwen-tts
./start.sh

# 启动 Gateway
pnpm --filter @clawbody/gateway start

# 启动 Live2D 桌面应用
pnpm --filter @clawbody/live2d start
```

## 项目结构

```
clawbody/
├── packages/           # 核心包
│   ├── core/           # 核心库
│   ├── gateway/        # 网关服务
│   └── proto-gen/      # Protobuf 生成代码
├── capabilities/       # 能力插件
│   ├── live2d/         # Live2D 桌面伴侣
│   ├── tts/            # 语音合成
│   └── vision/         # 视觉/截图
├── services/           # 外部服务
│   └── qwen-tts/       # Qwen TTS 服务
├── config/             # 配置文件
└── docs/               # 文档
```

## 能力模块

| 模块 | 状态 | 说明 |
|------|------|------|
| Live2D | ✅ 可用 | 桌面伴侣，表情和动作 |
| TTS | ✅ 可用 | 语音合成，支持多提供商 |
| Vision | ✅ 可用 | 屏幕截图 |
| Microphone | 🚧 计划中 | 语音输入 |
| Executor | 🚧 计划中 | 脚本执行 |

## 通信协议

ClawBody 使用 gRPC 作为主要通信协议，支持：

- 双向流实时通信
- 流式音频输出
- 自动服务发现 (mDNS)

详见 [通信协议文档](./PROTOCOL.md)

## TTS 提供商

支持多种 TTS 提供商，可根据需求切换：

| 提供商 | 需要 GPU | 需要网络 | 质量 |
|--------|----------|----------|------|
| Qwen3-TTS | ✓ | ✗ | 高 |
| Edge-TTS | ✗ | ✓ | 中 |
| Coqui TTS | ✗ | ✗ | 中 |
| OpenAI TTS | ✗ | ✓ | 高 |

## 开发

### 运行测试

```bash
pnpm test
```

### 代码检查

```bash
pnpm lint
```

### 构建

```bash
pnpm build
```

## 文档

- [架构设计](./ARCHITECTURE.md)
- [API 参考](./API.md)
- [通信协议](./PROTOCOL.md)
- [部署指南](./DEPLOYMENT.md)
- [开发指南](./DEVELOPMENT.md)

## 许可证

MIT
