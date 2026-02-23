# ClawBody

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-%3E%3D9-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![gRPC](https://img.shields.io/badge/gRPC-Protocol-244c5a?logo=grpc&logoColor=white)](https://grpc.io/)

[OpenClaw AI](https://github.com/openclaw) 的"身体"组件 - 为远程 AI 大脑提供物理交互能力。

[English](./README.md) | [中文](./README.zh.md)

## 概述

ClawBody 赋予 AI 物理存在感。AI 大脑在远程运行，而 ClawBody 在本地机器上提供感知和输出能力。

| 身体部位 | 能力模块 | 功能 |
|----------|----------|------|
| 眼神/表情 | Live2D | 桌面伴侣，表情和动作 |
| 嘴巴 | TTS | 语音合成（多提供商） |
| 眼睛 | Vision | 屏幕截图 |
| 耳朵 | Microphone | 语音输入（计划中） |
| 手 | Executor | 脚本执行（计划中） |
| 神经系统 | Gateway | Brain-Body gRPC 通信 |

## 架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        OpenClaw Brain                           │
│                      (远程设备 / 云端)                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ gRPC (神经系统)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      ClawBody Gateway                           │
│                  (能力注册 + 路由 + 状态管理)                     │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │  Live2D  │  │   TTS    │  │  Vision  │  │   Mic    │  ...   │
│  │  (表情)  │  │  (嘴巴)  │  │  (眼睛)  │  │  (耳朵)  │        │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │
│       │              │              │              │            │
│       ▼              ▼              ▼              ▼            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │ Electron │  │Qwen/Edge │  │ 屏幕截图 │  │ 音频输入 │        │
│  │ + PIXI   │  │   TTS    │  │          │  │          │        │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │
└─────────────────────────────────────────────────────────────────┘
```

## 特性

- **Live2D 桌面伴侣** - 基于 PIXI.js 的动画角色，支持表情和动作
- **多提供商 TTS** - 支持 Qwen3-TTS（本地 GPU）、Edge-TTS（云端）等
- **屏幕截图** - Vision 能力让 AI 能够"看到"屏幕
- **gRPC 通信** - Brain 和 Body 之间的低延迟双向流通信
- **mDNS 发现** - 局域网内自动服务发现
- **插件架构** - 可扩展的能力系统，标准化接口
- **HTTP 兼容** - REST API 和 SSE 支持浏览器集成

## 快速开始

### 环境要求

- Node.js >= 20
- pnpm >= 9
- Python >= 3.12（用于 Qwen TTS）

### 安装

```bash
# 克隆仓库
git clone https://github.com/openclaw/clawbody.git
cd clawbody

# 安装依赖
pnpm install

# 生成 protobuf 代码
pnpm proto:gen

# 构建所有包
pnpm build
```

### 运行

```bash
# 终端 1: 启动 Gateway (gRPC:50051, HTTP:4000)
pnpm --filter @clawbody/gateway dev

# 终端 2: 启动桌面小部件 (Live2D)
pnpm --filter @clawbody/desktop start

# 终端 3 (可选): 启动 Qwen TTS 服务
cd services/qwen-tts
uv sync
./start.sh
```

## 开发

### 常用命令

| 命令 | 说明 |
|------|------|
| `pnpm install` | 安装所有依赖 |
| `pnpm build` | 构建所有包 |
| `pnpm dev` | 启动开发模式 |
| `pnpm test` | 运行所有测试 |
| `pnpm test:coverage` | 运行测试并生成覆盖率报告 |
| `pnpm lint` | ESLint 检查 |
| `pnpm typecheck` | TypeScript 类型检查 |
| `pnpm format` | 使用 Prettier 格式化代码 |
| `pnpm proto:gen` | 生成 protobuf 代码 |

### 单包命令

```bash
# 构建指定包
pnpm --filter @clawbody/core build

# 运行指定包的测试
pnpm --filter @clawbody/gateway test

# 以开发模式启动指定服务
pnpm --filter @clawbody/desktop start
```

## 项目结构

```
clawbody/
├── packages/
│   ├── core/           # 核心库：接口、注册表、状态管理、日志
│   ├── gateway/        # 网关：gRPC + HTTP/WS/SSE 服务端、路由、mDNS
│   └── proto-gen/      # 生成的 protobuf 代码
├── capabilities/
│   ├── live2d/         # Live2D 能力（表情、动作）
│   ├── tts/            # TTS 能力（多提供商）
│   └── vision/         # Vision 能力（屏幕截图）
├── apps/
│   └── desktop/        # Electron 桌面小部件
├── services/
│   └── qwen-tts/       # Qwen TTS Python 服务
├── proto/              # Protocol Buffers 定义
├── config/             # 配置文件 (YAML)
└── docs/               # 文档
```

## TTS 提供商

| 提供商 | 类型 | 特点 |
|--------|------|------|
| Qwen3-TTS | 本地 GPU | 高质量中文，需要 GPU |
| Edge-TTS | 云端（免费） | 微软语音，无需 GPU |
| Coqui TTS | 本地开源 | 多语言，可离线 |
| OpenAI TTS | 云端（付费） | 高质量，需要 API Key |

## 文档

- [架构设计](docs/ARCHITECTURE.md) - 系统设计和组件
- [通信协议](docs/PROTOCOL.md) - gRPC 通信协议
- [API 参考](docs/API.md) - API 文档
- [开发指南](docs/DEVELOPMENT.md) - 开发环境设置和工作流
- [部署指南](docs/DEPLOYMENT.md) - 部署说明
- [路线图](docs/ROADMAP.md) - 产品路线图

## 贡献

1. 阅读 [开发指南](docs/DEVELOPMENT.md)
2. 提交 Issue 讨论新功能
3. 提交带有测试的 PR

## 许可证

MIT
