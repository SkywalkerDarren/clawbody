# Qwen3-STT Service

基于 Qwen3-ASR 的本地语音识别服务，支持流式转录。

## 特性

- 基于 Qwen3-ASR-1.7B 模型，高质量中英文识别
- 支持流式转录，实时返回识别结果
- WebSocket 接口，低延迟双向通信
- 自动语言检测 (中文、英文、日文、韩文、粤语)
- GPU 加速 (vLLM 后端)

## 环境要求

- Python >= 3.12
- CUDA 兼容 GPU (推荐 8GB+ 显存)
- uv 包管理器

## 安装

```bash
cd services/qwen3-stt
uv sync
```

## 启动

```bash
./start.sh
```

默认端口: 8766

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| HOST | 0.0.0.0 | 监听地址 |
| PORT | 8766 | 监听端口 |
| QWEN_ASR_MODEL | Qwen/Qwen3-ASR-1.7B | 模型路径 |
| GPU_MEMORY_UTILIZATION | 0.3 | GPU 显存占用比例 |
| MAX_NEW_TOKENS | 32 | 最大生成 token 数 |
| MAX_MODEL_LEN | 4096 | 最大序列长度 |
| SESSION_TIMEOUT_SEC | 30 | 会话超时时间 |
| MAX_CONCURRENT_SESSIONS | 1 | 最大并发会话数 |

## API

### HTTP 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/transcribe` | POST | 批量转录完整音频 |
| `/sessions` | POST | 创建流式会话 |
| `/sessions/{id}/chunks` | POST | 发送音频块 (HTTP) |
| `/sessions/{id}/end` | POST | 结束会话 |
| `/sessions/{id}` | DELETE | 取消会话 |
| `/languages` | GET | 列出支持的语言 |

### WebSocket 端点

| 端点 | 说明 |
|------|------|
| `/sessions/{id}/stream` | 流式转录 WebSocket |

### 流式转录流程

```
1. POST /sessions 创建会话，获取 session_id
2. 连接 WebSocket /sessions/{session_id}/stream
3. 发送二进制音频数据 (PCM 16-bit, 16kHz, mono)
4. 接收 JSON 转录结果 {"type": "transcript", "data": {...}}
5. 发送 {"type": "end"} 结束会话
6. 接收最终结果 {"type": "final", "data": {...}}
```

### 音频格式

- 采样率: 16000 Hz
- 位深: 16-bit (signed int)
- 声道: 单声道 (mono)
- 格式: PCM (无头)

## 测试

```bash
# 麦克风流式测试
uv run --with httpx --with sounddevice --with websockets --with numpy \
  python ../../scripts/test_stt_stream.py
```

## 与 Gateway 集成

STT 服务通过 HTTP/WebSocket 与 ClawBody Gateway 通信。Gateway 中的 STT 能力模块会：

1. 调用 `/sessions` 创建会话
2. 通过 WebSocket 转发音频数据
3. 将转录结果通过事件系统广播给订阅者

## 与 OpenClaw 集成

openclaw-presence 插件可以监听 Gateway 的 WebSocket，接收 STT 转录事件，将语音输入转发给 AI 大脑处理。
