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

    if check_port 8766 "STT"; then
        return 0
    fi

    if check_port 8767 "VAD"; then
        return 0
    fi

    if check_port 8768 "SV"; then
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
        if check_port 8766 "STT"; then
            still_running=1
        fi
        if check_port 8767 "VAD"; then
            still_running=1
        fi
        if check_port 8768 "SV"; then
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
    for port in 4000 50051 8765 8766 8767 8768; do
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

    # 创建 tmux session (detached)
    tmux new-session -d -s "$SESSION_NAME" -x 200 -y 50

    # 水平分割 (左右)
    tmux split-window -h -t "$SESSION_NAME"

    # 保存左右 pane ID
    LEFT_PANE=$(tmux list-panes -t "$SESSION_NAME" -F "#{pane_id}" | head -1)
    RIGHT_PANE=$(tmux list-panes -t "$SESSION_NAME" -F "#{pane_id}" | tail -1)

    # 左边垂直分割两次 (3个pane)
    tmux split-window -v -t "$LEFT_PANE"
    tmux split-window -v -t "$LEFT_PANE"

    # 右边垂直分割两次 (3个pane)
    tmux split-window -v -t "$RIGHT_PANE"
    tmux split-window -v -t "$RIGHT_PANE"

    # pane 布局 (使用 session:window.pane 格式):
    # 1.1: 左上 (Gateway)
    # 1.2: 左中 (Live2D)
    # 1.3: 左下 (SV)
    # 1.4: 右上 (STT)
    # 1.5: 右中 (TTS)
    # 1.6: 右下 (VAD)

    sleep 0.3

    # 发送命令到各个 pane
    tmux send-keys -t "$SESSION_NAME:1.1" "cd '$PROJECT_ROOT' && pnpm --filter @clawbody/gateway dev" C-m
    tmux send-keys -t "$SESSION_NAME:1.2" "cd '$PROJECT_ROOT' && pnpm --filter @clawbody/desktop start" C-m
    tmux send-keys -t "$SESSION_NAME:1.3" "cd '$PROJECT_ROOT/services/wespeaker-sv' && ./start.sh" C-m
    tmux send-keys -t "$SESSION_NAME:1.4" "cd '$PROJECT_ROOT/services/qwen3-stt' && ./start.sh" C-m
    tmux send-keys -t "$SESSION_NAME:1.5" "cd '$PROJECT_ROOT/services/qwen3-tts' && ./start.sh" C-m
    tmux send-keys -t "$SESSION_NAME:1.6" "cd '$PROJECT_ROOT/services/silero-vad' && ./start.sh" C-m

    success "服务已在后台启动"
    echo ""
    echo -e "${GREEN}┌─────────────────────────────────────────────────────────────┐${NC}"
    echo -e "${GREEN}│${NC}  ClawBody 服务已启动                                        ${GREEN}│${NC}"
    echo -e "${GREEN}├─────────────────────────────────────────────────────────────┤${NC}"
    echo -e "${GREEN}│${NC}  Gateway:  http://localhost:4000                            ${GREEN}│${NC}"
    echo -e "${GREEN}│${NC}  TTS:      http://localhost:8765                            ${GREEN}│${NC}"
    echo -e "${GREEN}│${NC}  STT:      http://localhost:8766                            ${GREEN}│${NC}"
    echo -e "${GREEN}│${NC}  VAD:      http://localhost:8767                            ${GREEN}│${NC}"
    echo -e "${GREEN}│${NC}  SV:       http://localhost:8768                            ${GREEN}│${NC}"
    echo -e "${GREEN}│${NC}  gRPC:     localhost:50051                                  ${GREEN}│${NC}"
    echo -e "${GREEN}├─────────────────────────────────────────────────────────────┤${NC}"
    echo -e "${GREEN}│${NC}  查看日志: ${YELLOW}tmux attach -t $SESSION_NAME${NC}                        ${GREEN}│${NC}"
    echo -e "${GREEN}│${NC}  关闭服务: ${YELLOW}$0 --stop${NC}                              ${GREEN}│${NC}"
    echo -e "${GREEN}│${NC}  等待就绪: ${YELLOW}$0 --wait${NC}                              ${GREEN}│${NC}"
    echo -e "${GREEN}└─────────────────────────────────────────────────────────────┘${NC}"
    echo ""
    info "TTS/STT/SV 服务需要约 30-60 秒加载模型"
    info "运行 '$0 --wait' 等待所有服务就绪"
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
    echo "  --check         运行诊断检查"
    echo "  --wait          等待所有服务就绪"
    echo "  --attach, -a    附加到 tmux session"
    echo "  --help, -h      显示帮助"
    echo ""
    echo "示例:"
    echo "  $0              启动服务"
    echo "  $0 --stop       停止服务"
    echo "  $0 --restart    重启服务"
    echo "  $0 --restart -f 强制重启"
    echo "  $0 --check      检查服务健康状态"
    echo "  $0 --wait       等待服务就绪"
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

    if check_port 8766 "STT"; then
        success "STT (8766): 运行中"
    else
        warn "STT (8766): 未运行"
    fi

    if check_port 8767 "VAD"; then
        success "VAD (8767): 运行中"
    else
        warn "VAD (8767): 未运行"
    fi

    if check_port 8768 "SV"; then
        success "SV (8768): 运行中"
    else
        warn "SV (8768): 未运行"
    fi
}

# 运行诊断检查
run_diagnostics() {
    echo ""
    echo -e "${BLUE}ClawBody 服务诊断${NC}"
    echo "═══════════════════════════════════════════════════════════"
    echo ""

    # 检查 Gateway 是否运行
    if ! check_port 4000 "Gateway"; then
        error "Gateway 未运行，请先启动服务: $0 --start"
        exit 1
    fi

    info "正在检测各服务状态..."
    echo ""

    # 调用 diagnostics API
    local response
    response=$(curl -s --max-time 10 "http://localhost:4000/api/diagnostics" 2>/dev/null)

    if [ -z "$response" ]; then
        error "无法连接到 Gateway"
        exit 1
    fi

    # 解析 JSON 响应 (使用 jq 如果可用，否则用 grep/sed)
    if command -v jq &> /dev/null; then
        local overall=$(echo "$response" | jq -r '.overall')
        local uptime=$(echo "$response" | jq -r '.gateway.uptime')

        echo -e "Gateway: ${GREEN}运行中${NC} (uptime: ${uptime}s)"
        echo ""
        echo "服务状态:"
        echo "─────────────────────────────────────────────────────────"

        # 遍历服务
        for service in tts stt vad speaker-verification vision live2d; do
            local status=$(echo "$response" | jq -r ".services[\"$service\"].status")
            local latency=$(echo "$response" | jq -r ".services[\"$service\"].latency // \"N/A\"")
            local message=$(echo "$response" | jq -r ".services[\"$service\"].message // \"\"")

            case $status in
                "ok")
                    printf "  %-22s ${GREEN}✓ OK${NC} (%sms)\n" "$service" "$latency"
                    ;;
                "error")
                    printf "  %-22s ${RED}✗ ERROR${NC}: %s\n" "$service" "$message"
                    ;;
                "not_registered")
                    printf "  %-22s ${YELLOW}○ 未注册${NC}\n" "$service"
                    ;;
                *)
                    printf "  %-22s ${YELLOW}? %s${NC}\n" "$service" "$status"
                    ;;
            esac
        done

        echo ""
        echo "OpenClaw 集成:"
        echo "─────────────────────────────────────────────────────────"
        local oc_status=$(echo "$response" | jq -r '.openclaw.status')
        local oc_message=$(echo "$response" | jq -r '.openclaw.message // ""')

        case $oc_status in
            "ok")
                printf "  %-22s ${GREEN}✓ 已连接${NC}: %s\n" "OpenClaw" "$oc_message"
                ;;
            "error")
                printf "  %-22s ${RED}✗ 连接失败${NC}: %s\n" "OpenClaw" "$oc_message"
                ;;
            "not_configured")
                printf "  %-22s ${YELLOW}○ 未配置${NC}\n" "OpenClaw"
                ;;
            *)
                printf "  %-22s ${YELLOW}? %s${NC}\n" "OpenClaw" "$oc_status"
                ;;
        esac

        echo ""
        echo "═══════════════════════════════════════════════════════════"

        case $overall in
            "ok")
                echo -e "整体状态: ${GREEN}✓ 正常${NC}"
                ;;
            "degraded")
                echo -e "整体状态: ${YELLOW}⚠ 部分服务异常${NC}"
                ;;
            "critical")
                echo -e "整体状态: ${RED}✗ 严重故障${NC}"
                ;;
        esac
    else
        # 没有 jq，直接输出原始 JSON
        warn "未安装 jq，显示原始诊断数据:"
        echo "$response" | python3 -m json.tool 2>/dev/null || echo "$response"
    fi

    echo ""
}

# 等待所有服务就绪
wait_for_ready() {
    local timeout=${1:-120}  # 默认 120 秒超时
    local interval=3
    local elapsed=0

    echo ""
    echo -e "${BLUE}等待服务就绪...${NC}"
    echo "═══════════════════════════════════════════════════════════"
    echo ""

    # 先等待 Gateway 启动
    echo -n "Gateway: "
    while ! check_port 4000 "Gateway" 2>/dev/null; do
        if [ $elapsed -ge $timeout ]; then
            echo -e "${RED}超时${NC}"
            error "Gateway 启动超时"
            return 1
        fi
        echo -n "."
        sleep 1
        elapsed=$((elapsed + 1))
    done
    echo -e " ${GREEN}✓${NC}"

    # 等待各服务就绪
    local services=("tts" "stt" "vad" "speaker-verification")
    local service_names=("TTS" "STT" "VAD" "SV")
    local all_ready=0

    while [ $all_ready -eq 0 ] && [ $elapsed -lt $timeout ]; do
        all_ready=1

        # 调用 diagnostics API
        local response
        response=$(curl -s --max-time 5 "http://localhost:4000/api/diagnostics" 2>/dev/null)

        if [ -z "$response" ]; then
            sleep $interval
            elapsed=$((elapsed + interval))
            continue
        fi

        # 检查各服务状态
        if command -v jq &> /dev/null; then
            for i in "${!services[@]}"; do
                local service="${services[$i]}"
                local name="${service_names[$i]}"
                local status=$(echo "$response" | jq -r ".services[\"$service\"].status" 2>/dev/null)

                case $status in
                    "ok")
                        printf "  %-20s ${GREEN}✓ 就绪${NC}\n" "$name"
                        ;;
                    "error")
                        local msg=$(echo "$response" | jq -r ".services[\"$service\"].message" 2>/dev/null)
                        printf "  %-20s ${YELLOW}⏳ 加载中${NC} (%s)\n" "$name" "$msg"
                        all_ready=0
                        ;;
                    *)
                        printf "  %-20s ${YELLOW}⏳ 等待中${NC}\n" "$name"
                        all_ready=0
                        ;;
                esac
            done

            if [ $all_ready -eq 0 ]; then
                echo ""
                echo -e "  ${YELLOW}等待中... (${elapsed}s/${timeout}s)${NC}"
                echo ""
                sleep $interval
                elapsed=$((elapsed + interval))
            fi
        else
            # 没有 jq，简单等待
            echo "  (安装 jq 以查看详细进度)"
            sleep $interval
            elapsed=$((elapsed + interval))

            # 简单检查：所有端口都在监听
            if check_port 8765 "TTS" 2>/dev/null && \
               check_port 8766 "STT" 2>/dev/null && \
               check_port 8767 "VAD" 2>/dev/null && \
               check_port 8768 "SV" 2>/dev/null; then
                all_ready=1
            fi
        fi
    done

    echo ""
    echo "═══════════════════════════════════════════════════════════"

    if [ $all_ready -eq 1 ]; then
        echo -e "${GREEN}✓ 所有服务已就绪！${NC}"
        echo ""

        # 发送桌面通知 (如果可用)
        if command -v notify-send &> /dev/null; then
            notify-send "ClawBody" "所有服务已就绪" --icon=dialog-information 2>/dev/null || true
        fi

        return 0
    else
        echo -e "${RED}✗ 部分服务未能在 ${timeout}s 内就绪${NC}"
        echo ""
        echo "运行 '$0 --check' 查看详细诊断信息"
        return 1
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
            --check)
                action="check"
                shift
                ;;
            --wait)
                action="wait"
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
        check)
            run_diagnostics
            ;;
        wait)
            wait_for_ready
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
