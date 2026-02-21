# Qwen3-TTS 本地服务

基于 [Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS) 的本地语音合成服务。

## 依赖

- Python 3.12+
- CUDA GPU (推荐 16GB+ 显存)
- [uv](https://docs.astral.sh/uv/) 包管理器

## 安装

```bash
cd services/qwen3-tts

# 安装依赖
uv sync

# 可选：安装 FlashAttention 2 (减少显存占用)
uv pip install flash-attn --no-build-isolation
```

## 启动

```bash
# 使用默认配置
./start.sh

# 或自定义配置
QWEN_TTS_MODEL=Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice \
QWEN_TTS_DEVICE=cuda:0 \
PORT=8765 \
./start.sh
```

## API

### 健康检查

```bash
curl http://localhost:8765/health
```

### 获取说话人列表

```bash
curl http://localhost:8765/speakers
```

### 语音合成

```bash
curl -X POST http://localhost:8765/synthesize \
  -H "Content-Type: application/json" \
  -d '{
    "text": "你好，我是 Qwen TTS",
    "language": "Chinese",
    "speaker": "Vivian"
  }'
```

### 直接获取 WAV 音频

```bash
curl -X POST http://localhost:8765/synthesize/raw \
  -H "Content-Type: application/json" \
  -d '{
    "text": "你好，我是 Qwen TTS",
    "language": "Chinese",
    "speaker": "Vivian"
  }' \
  --output output.wav
```

## 支持的说话人

| Speaker | 描述 | 原生语言 |
|---------|------|----------|
| Vivian | 明亮、略带锐利的年轻女声 | 中文 |
| Serena | 温暖、柔和的年轻女声 | 中文 |
| Uncle_Fu | 低沉、醇厚的成熟男声 | 中文 |
| Dylan | 清晰、自然的北京男声 | 中文(北京话) |
| Eric | 活泼、略带沙哑的成都男声 | 中文(四川话) |
| Ryan | 动感、节奏感强的男声 | 英文 |
| Aiden | 阳光、中音清晰的美式男声 | 英文 |

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| QWEN_TTS_MODEL | Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice | 模型 ID |
| QWEN_TTS_DEVICE | cuda:0 | 设备 |
| HOST | 0.0.0.0 | 监听地址 |
| PORT | 8765 | 监听端口 |
