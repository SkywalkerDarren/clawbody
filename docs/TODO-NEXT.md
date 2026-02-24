# ClawBody 下一步计划

## 已完成 ✅

### 1. 主动开关 ✅
- [x] Gateway 提供 API 开关控制 VAD → SV → STT → OpenClaw 链路
  - `GET /api/pipeline` - 获取状态
  - `POST /api/pipeline/enable` - 启用
  - `POST /api/pipeline/disable` - 禁用
- [x] WebSocket 广播状态变化
- [x] test_vad_pipeline.py 自动启用/禁用

### 2. 启动自检流程 ✅
- [x] `/api/diagnostics` 端点
- [x] 检测所有服务状态 (TTS, STT, VAD, SV, Vision, Live2D)
- [x] 检测 OpenClaw 连接状态
- [x] CLI 命令：`./scripts/start.sh --check`

### 3. 启动反馈优化 ✅
- [x] `./scripts/start.sh --wait` 等待所有服务就绪
- [x] 实时显示各服务加载进度 (需要 jq)
- [x] 桌面通知 (notify-send)
- [x] 120s 超时

### 4. Gateway Web 控制监控面板 ✅
- [x] http://localhost:4000/dashboard.html
- [x] Pipeline 开关控制
- [x] 服务状态监控
- [x] 说话人管理 (列表/删除)
- [x] TTS 测试
- [x] 实时事件日志 (SSE)
- [x] 导出诊断报告

### 5. 文档更新 ✅
- [x] README.md 重写

---

## 待完成 📋

### Desktop 集成
- [ ] Desktop 托盘图标显示 Pipeline 状态
- [ ] Desktop UI 开关控制
- [ ] 托盘菜单快捷操作

### 文档补充
- [ ] docs/SPEAKER-VERIFICATION.md - SV 使用指南
- [ ] docs/TROUBLESHOOTING.md - 故障排查
- [ ] 更新 docs/API.md - 添加新 API

### 性能优化
- [ ] 测量 SV 增加的延迟
- [ ] 考虑 SV 异步验证

### 其他
- [ ] 多说话人识别 (识别是哪个用户)
- [ ] 声纹注册 Web UI

---

Updated: 2026-02-24
