# ClawBody 下一步计划

## 已完成 ✅

### 1. 主动开关 ✅
- [x] Gateway 提供 API 开关控制 VAD → SV → STT → OpenClaw 链路
- [x] WebSocket 广播状态变化
- [x] test_vad_pipeline.py 自动启用/禁用

### 2. 启动自检流程 ✅
- [x] `/api/diagnostics` 端点
- [x] 检测所有服务状态 (TTS, STT, VAD, SV, Vision, Live2D)
- [x] CLI 命令：`./scripts/start.sh --check`

### 3. 启动反馈优化 ✅
- [x] `./scripts/start.sh --wait` 等待所有服务就绪
- [x] 桌面通知 (notify-send)

### 4. React Dashboard ✅
- [x] React + TypeScript + Tailwind + shadcn/ui
- [x] 模块化架构 (IModule 接口，对标后端 ICapability)
- [x] 访问地址: http://localhost:4000/dashboard/

已实现模块:
- [x] Pipeline 控制 - 启用/禁用语音链路
- [x] 服务状态 - 实时监控各服务健康
- [x] 说话人管理 - 列表/注册/删除 (含录音 UI)
- [x] TTS 测试 - 文本合成播放
- [x] STT 测试 - 录音转录
- [x] Live2D 控制 - 表情/动作触发
- [x] Vision 测试 - 屏幕截图预览
- [x] OpenClaw 状态 - 连接状态显示
- [x] 快捷操作 - 重置 VAD、导出诊断等
- [x] VAD 配置 - 阈值、时长参数调整
- [x] SV 配置 - 验证阈值、VAD 预处理开关
- [x] 实时事件 - SSE 事件日志

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

---

Updated: 2025-02-24
