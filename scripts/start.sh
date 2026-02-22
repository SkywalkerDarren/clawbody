#!/bin/bash
# ClawBody 一键启动脚本
# 使用 tmux 管理所有服务

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SESSION_NAME="clawbody"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

info() { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }

# 检查依赖
check_deps() {
    if ! command -v tmux &> /dev/null; then
        error "tmux is not installed. Install it with: sudo pacman -S tmux"
        exit 1
    fi
    if ! command -v pnpm &> /dev/null; then
        error "pnpm is not installed."
        exit 1
    fi
    if ! command -v uv &> /dev/null; then
        error "uv is not installed. Install it with: curl -LsSf https://astral.sh/uv/install.sh | sh"
        exit 1
    fi
}

# 检查端口是否被占用
check_port() {
    local port=$1
    local name=$2
    if lsof -i :$port &> /dev/null; then
        return 0  # 端口被占用
    fi
    return 1  # 端口空闲
}

# 检查服务是否运行 (返回 0 表示有服务在运行)
check_services() {
    if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
        return 0
    fi

    if check_port 4000 "Gateway HTTP"; then
        return 0
    fi

    if check_port 50051 "Gateway gRPC"; then
        return 0
    fi

    if check_port 8765 "TTS"; then
        return 0
    fi

    return 1  # 没有服务在运行
}

# 优雅关闭服务
graceful_shutdown() {
    info "正在关闭服务..."

    # 先尝试关闭 tmux session
    if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
        info "关闭 tmux session: $SESSION_NAME"
        tmux kill-session -t "$SESSION_NAME" 2>/dev/null || true
        sleep 1
    fi

    # 检查端口是否还被占用
    local timeout=10
    local elapsed=0

    while [ $elapsed -lt $timeout ]; do
        local still_running=0

        if check_port 4000 "Gateway HTTP"; then
            still_running=1
        fi
        if check_port 50051 "Gateway gRPC"; then
            still_running=1
        fi
        if check_port 8765 "TTS"; then
            still_running=1
        fi

        if [ $still_running -eq 0 ]; then
            success "所有服务已关闭"
            return 0
        fi

        sleep 1
        elapsed=$((elapsed + 1))
        info "等待服务关闭... ($elapsed/$timeout)"
    done

    return 1
}

# 强制关闭
force_shutdown() {
    warn "强制关闭服务..."

    # Kill tmux session
    tmux kill-session -t "$SESSION_NAME" 2>/dev/null || true

    # Kill processes on ports
    for port in 4000 50051 8765; do
        local pid=$(lsof -t -i :$port 2>/dev/null)
        if [ -n "$pid" ]; then
            warn "强制终止端口 $port 上的进程 (PID: $pid)"
            kill -9 $pid 2>/dev/null || true
        fi
    done

    sleep 1
    success "强制关闭完成"
}

# 启动服务
start_services() {
    info "启动 ClawBody 服务..."

    cd "$PROJECT_ROOT"

    # 创建 tmux session (detached) 并直接启动 Gateway
    tmux new-session -d -s "$SESSION_NAME" -x 200 -y 50 \
        "cd '$PROJECT_ROOT' && pnpm --filter @clawbody/gateway dev; read"

    # 分割窗口: 左右分割，右边启动 Debug
    tmux split-window -h -t "$SESSION_NAME" \
        "cd '$PROJECT_ROOT' && echo '=== Debug Pane ===' && echo 'Ready for debugging commands' && bash"

    # 左边上下分割，下面启动 TTS
    tmux split-window -v -t "$SESSION_NAME:0.0" \
        "cd '$PROJECT_ROOT/services/qwen3-tts' && ./start.sh; read"

    # 右边上下分割，下面显示 Live2D 信息
    tmux split-window -v -t "$SESSION_NAME:0.2" \
        "cd '$PROJECT_ROOT' && echo '=== Live2D Pane ===' && echo 'Live2D runs in browser at http://localhost:4000' && bash"

    # 布局:
    # 0: 左上 (Gateway)
    # 1: 左下 (TTS)
    # 2: 右上 (Debug)
    # 3: 右下 (Live2D)

    success "服务已在后台启动"
    echo ""
    echo -e "${GREEN}┌─────────────────────────────────────────────────────────────┐${NC}"
    echo -e "${GREEN}│${NC}  ClawBody 服务已启动                                        ${GREEN}│${NC}"
    echo -e "${GREEN}├─────────────────────────────────────────────────────────────┤${NC}"
    echo -e "${GREEN}│${NC}  Gateway:  http://localhost:4000                            ${GREEN}│${NC}"
    echo -e "${GREEN}│${NC}  TTS:      http://localhost:8765                            ${GREEN}│${NC}"
    echo -e "${GREEN}│${NC}  gRPC:     localhost:50051                                  ${GREEN}│${NC}"
    echo -e "${GREEN}├─────────────────────────────────────────────────────────────┤${NC}"
    echo -e "${GREEN}│${NC}  查看日志: ${YELLOW}tmux attach -t $SESSION_NAME${NC}                        ${GREEN}│${NC}"
    echo -e "${GREEN}│${NC}  关闭服务: ${YELLOW}$0 --stop${NC}                              ${GREEN}│${NC}"
    echo -e "${GREEN}└─────────────────────────────────────────────────────────────┘${NC}"
    echo ""
    info "TTS 服务需要约 30-60 秒加载模型，请稍候..."
}

# 显示帮助
show_help() {
    echo "ClawBody 启动脚本"
    echo ""
    echo "用法: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  --start, -s     启动服务 (默认)"
    echo "  --stop          停止服务"
    echo "  --restart       重启服务"
    echo "  --force, -f     强制重启 (与 --restart 一起使用)"
    echo "  --status        查看服务状态"
    echo "  --attach, -a    附加到 tmux session"
    echo "  --help, -h      显示帮助"
    echo ""
    echo "示例:"
    echo "  $0              启动服务"
    echo "  $0 --stop       停止服务"
    echo "  $0 --restart    重启服务"
    echo "  $0 --restart -f 强制重启"
    echo "  $0 --attach     查看日志"
}

# 显示状态
show_status() {
    echo "ClawBody 服务状态"
    echo "─────────────────────────────"

    if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
        success "tmux session: 运行中"
    else
        warn "tmux session: 未运行"
    fi

    if check_port 4000 "Gateway HTTP"; then
        success "Gateway HTTP (4000): 运行中"
    else
        warn "Gateway HTTP (4000): 未运行"
    fi

    if check_port 50051 "Gateway gRPC"; then
        success "Gateway gRPC (50051): 运行中"
    else
        warn "Gateway gRPC (50051): 未运行"
    fi

    if check_port 8765 "TTS"; then
        success "TTS (8765): 运行中"
    else
        warn "TTS (8765): 未运行"
    fi
}

# 主逻辑
main() {
    local action="start"
    local force=0

    while [[ $# -gt 0 ]]; do
        case $1 in
            --start|-s)
                action="start"
                shift
                ;;
            --stop)
                action="stop"
                shift
                ;;
            --restart)
                action="restart"
                shift
                ;;
            --force|-f)
                force=1
                shift
                ;;
            --status)
                action="status"
                shift
                ;;
            --attach|-a)
                action="attach"
                shift
                ;;
            --help|-h)
                show_help
                exit 0
                ;;
            *)
                error "未知选项: $1"
                show_help
                exit 1
                ;;
        esac
    done

    check_deps

    case $action in
        start)
            if check_services; then
                warn "检测到服务已在运行"
                echo ""
                echo "选项:"
                echo "  1. 使用 --restart 重启服务"
                echo "  2. 使用 --stop 停止服务"
                echo "  3. 使用 --attach 查看日志"
                exit 1
            fi
            start_services
            ;;
        stop)
            if ! check_services; then
                info "服务未运行"
                exit 0
            fi
            if ! graceful_shutdown; then
                error "无法优雅关闭服务，请使用 --restart --force 强制重启"
                exit 1
            fi
            ;;
        restart)
            if check_services; then
                if [ $force -eq 1 ]; then
                    force_shutdown
                else
                    if ! graceful_shutdown; then
                        error "无法优雅关闭服务"
                        echo ""
                        echo "使用 --force 强制重启:"
                        echo "  $0 --restart --force"
                        exit 1
                    fi
                fi
            fi
            start_services
            ;;
        status)
            show_status
            ;;
        attach)
            if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
                exec tmux attach -t "$SESSION_NAME"
            else
                error "tmux session '$SESSION_NAME' 不存在"
                exit 1
            fi
            ;;
    esac
}

main "$@"
