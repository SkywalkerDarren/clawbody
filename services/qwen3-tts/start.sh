#!/bin/bash
# Qwen3-TTS 服务启动脚本

set -e

cd "$(dirname "$0")"

# 检查 uv 是否安装
if ! command -v uv &> /dev/null; then
    echo "Error: uv is not installed. Install it with: curl -LsSf https://astral.sh/uv/install.sh | sh"
    exit 1
fi

# 设置环境变量
export QWEN_TTS_MODEL="${QWEN_TTS_MODEL:-Qwen/Qwen3-TTS-12Hz-1.7B-Base}"
export QWEN_TTS_DEVICE="${QWEN_TTS_DEVICE:-cuda:0}"
export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-8765}"

# 离线模式 - 跳过每次启动时的配置文件检查
export HF_HUB_OFFLINE="${HF_HUB_OFFLINE:-1}"
export MODELSCOPE_OFFLINE="${MODELSCOPE_OFFLINE:-1}"

echo "Starting Qwen3-TTS service..."
echo "  Model: $QWEN_TTS_MODEL"
echo "  Device: $QWEN_TTS_DEVICE"
echo "  Listen: $HOST:$PORT"

# 启动服务
uv run python -m qwen3_tts.server
