# ClawBody 故障排查指南

## 快速诊断

```bash
# 检查所有服务状态
./scripts/start.sh --check

# 查看详细日志
./scripts/start.sh --attach
```

## 常见问题

### 服务启动问题

#### Gateway 无法启动 (端口 4000)

**症状**: `Error: listen EADDRINUSE: address already in use :::4000`

**解决**:
```bash
# 查找占用端口的进程
lsof -i :4000

# 强制关闭
./scripts/start.sh --stop
# 或
kill -9 $(lsof -t -i :4000)
```

#### Python 服务启动失败

**症状**: TTS/STT/VAD/SV 服务无法启动

**检查**:
```bash
# 确认 Python 环境
python3 --version  # 需要 >= 3.12

# 确认 uv 已安装
uv --version

# 重新安装依赖
cd services/qwen3-tts && uv sync
cd services/qwen3-stt && uv sync
cd services/silero-vad && uv sync
cd services/wespeaker-sv && uv sync
```

#### GPU 内存不足

**症状**: CUDA out of memory

**解决**:
1. 减少 GPU 内存占用:
```bash
# 编辑 services/qwen3-tts/start.sh
export GPU_MEMORY_UTILIZATION=0.2  # 降低占用

# 编辑 services/qwen3-stt/start.sh
export GPU_MEMORY_UTILIZATION=0.2
```

2. 或者只启动部分服务

### 语音链路问题

#### VAD 不检测语音

**症状**: 说话时没有 speech_start 事件

**检查**:
1. 麦克风是否正常工作
2. VAD 阈值是否过高

**解决**:
```bash
# 降低 VAD 阈值
curl -X POST http://localhost:4000/api/vad/config \
  -H "Content-Type: application/json" \
  -d '{"threshold": 0.3}'
```

或在 Dashboard 的「VAD 配置」中调整。

#### SV 验证总是失败

**症状**: 所有语音都被拒绝

**检查**:
1. 是否已注册说话人
2. 验证阈值是否过高

**解决**:
```bash
# 查看已注册说话人
curl http://localhost:4000/api/sv/speakers

# 降低验证阈值
curl -X POST http://localhost:4000/api/sv/config \
  -H "Content-Type: application/json" \
  -d '{"threshold": 0.5}'
```

#### STT 转录为空

**症状**: 语音识别返回空结果

**检查**:
1. STT 服务是否就绪
2. 音频时长是否太短

```bash
# 检查 STT 服务
curl http://localhost:8766/health
```

### Dashboard 问题

#### Dashboard 无法访问

**症状**: http://localhost:4000/dashboard/ 返回 404

**解决**:
```bash
# 重新构建 Dashboard
cd apps/dashboard
pnpm build
```

#### SSE 连接断开

**症状**: Dashboard 显示 "Disconnected"

**检查**:
1. Gateway 是否运行
2. 浏览器控制台是否有错误

**解决**: 刷新页面或重启 Gateway

### 模型加载问题

#### 模型下载失败

**症状**: 首次启动时模型下载超时

**解决**:
1. 检查网络连接
2. 手动下载模型到缓存目录:
   - TTS: `~/.cache/modelscope/`
   - STT: `~/.cache/huggingface/`
   - SV: `~/.cache/wespeaker/`

#### 模型加载慢

**症状**: 服务启动后长时间不可用

**说明**: 首次加载需要 30-60 秒，这是正常的。

**监控**:
```bash
./scripts/start.sh --wait
```

### OpenClaw 集成问题

#### STT 结果未转发

**症状**: 语音识别成功但 OpenClaw 没收到

**检查**:
1. config/local.yaml 中 openclaw.webhookUrl 是否正确
2. OpenClaw 服务是否运行

```yaml
# config/local.yaml
openclaw:
  webhookUrl: "http://localhost:18789"
  sessionKey: "voice:default"
```

#### OpenClaw 连接失败

**症状**: Dashboard 显示 OpenClaw 连接失败

**检查**:
```bash
# 测试 OpenClaw 连接
curl http://localhost:18789/health
```

## 日志位置

| 服务 | 日志查看方式 |
|------|-------------|
| Gateway | `./scripts/start.sh --attach` (左上 pane) |
| TTS | `./scripts/start.sh --attach` (右中 pane) |
| STT | `./scripts/start.sh --attach` (右上 pane) |
| VAD | `./scripts/start.sh --attach` (右下 pane) |
| SV | `./scripts/start.sh --attach` (左下 pane) |

tmux 快捷键:
- `Ctrl+B` 然后方向键: 切换 pane
- `Ctrl+B` 然后 `[`: 进入滚动模式
- `q`: 退出滚动模式

## 重置服务

```bash
# 优雅重启
./scripts/start.sh --restart

# 强制重启 (如果优雅重启失败)
./scripts/start.sh --restart --force

# 完全停止
./scripts/start.sh --stop
```

## 获取帮助

1. 导出诊断报告:
   - Dashboard → 快捷操作 → 导出诊断
   - 或 `curl http://localhost:4000/api/diagnostics > diagnostics.json`

2. 提交 Issue 时请附上:
   - 诊断报告
   - 相关服务日志
   - 复现步骤
