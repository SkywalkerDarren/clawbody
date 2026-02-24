# ClawBody 下一步计划

## 1. 主动开关

当前问题：只能通过 `test_vad_pipeline.py` 脚本启动完整流程

需求：
- Gateway 提供 API 开关控制 VAD → SV → STT → OpenClaw 链路
- Desktop 桌面端提供 UI 开关
- 支持热切换，无需重启服务

## 2. 启动自检流程

当前问题：服务启动后不知道哪一步出了问题

需求：
- 提供 `/api/diagnostics` 端点，检测所有服务状态
- 检测项：
  - Gateway 自身状态
  - TTS 服务连接 (8765)
  - STT 服务连接 + 模型加载状态 (8766)
  - VAD 服务连接 + 模型加载状态 (8767)
  - SV 服务连接 + 模型加载状态 (8768)
  - OpenClaw 连接状态
- 返回详细的诊断报告，指出哪一步有问题
- 提供 CLI 命令：`./scripts/start.sh --check`

## 3. 启动反馈优化

当前问题："等待 30-60 秒" 提示不够，用户不知道何时真正就绪

需求：
- 服务启动后主动轮询各服务状态
- 实时显示各服务加载进度
- 所有服务就绪后发出通知（声音/桌面通知）
- 考虑：
  - 终端彩色进度条
  - Desktop 托盘图标状态变化
  - 系统通知

## 4. Gateway Web 控制监控面板

当前问题：没有可视化的监控和控制界面

需求：
- Web UI 面板 (http://localhost:4000/dashboard)
- 功能：
  - 服务状态监控（各能力的健康状态）
  - 实时日志查看
  - VAD/SV/STT 链路开关
  - SV 说话人管理（注册/删除/测试）
  - TTS 测试（输入文本播放）
  - 配置查看/修改
  - 性能指标（延迟、吞吐量）
- 技术选型：
  - 前端：React + Tailwind (或纯 HTML + Alpine.js 轻量方案)
  - 后端：复用现有 Gateway HTTP API
  - 实时更新：WebSocket/SSE

## 5. 文档清理和重写

当前问题：文档分散、过时、不完整

需求：
- 清理过时文档
- 重写核心文档：
  - README.md - 项目概述、快速开始
  - docs/ARCHITECTURE.md - 系统架构
  - docs/API.md - API 参考
  - docs/DEPLOYMENT.md - 部署指南
- 新增文档：
  - docs/SPEAKER-VERIFICATION.md - SV 使用指南
  - docs/TROUBLESHOOTING.md - 故障排查
- 统一文档风格和格式

---

## 优先级建议

1. **P0 - 启动自检** - 解决"不知道哪里出问题"的痛点
2. **P0 - 主动开关** - 让完整链路可用
3. **P1 - 启动反馈** - 改善用户体验
4. **P1 - Web 面板** - 可视化监控
5. **P2 - 文档重写** - 长期维护

---

Created: 2026-02-24
