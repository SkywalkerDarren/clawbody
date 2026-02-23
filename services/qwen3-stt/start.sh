#!/bin/bash
# Qwen3-STT 服务启动脚本

set -e

cd "$(dirname "$0")"

# 检查 uv 是否安装
if ! command -v uv &> /dev/null; then
    echo "Error: uv is not installed. Install it with: curl -LsSf https://astral.sh/uv/install.sh | sh"
    exit 1
fi

# 设置环境变量
export QWEN_ASR_MODEL="${QWEN_ASR_MODEL:-Qwen/Qwen3-ASR-1.7B}"
export GPU_MEMORY_UTILIZATION="${GPU_MEMORY_UTILIZATION:-0.8}"
export MAX_NEW_TOKENS="${MAX_NEW_TOKENS:-32}"
export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-8766}"
export SESSION_TIMEOUT_SEC="${SESSION_TIMEOUT_SEC:-30}"
export MAX_CONCURRENT_SESSIONS="${MAX_CONCURRENT_SESSIONS:-10}"

echo "Starting Qwen3-STT service..."
echo "  Model: $QWEN_ASR_MODEL"
echo "  GPU Memory: $GPU_MEMORY_UTILIZATION"
echo "  Listen: $HOST:$PORT"

# 启动服务
uv run python -m qwen3_stt.server
