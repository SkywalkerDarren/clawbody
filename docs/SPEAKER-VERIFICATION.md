# Speaker Verification (SV) 使用指南

ClawBody 的说话人验证功能，确保只有注册用户的语音才会被处理。

## 概述

Speaker Verification 基于 WeSpeaker ONNX 模型，通过声纹特征识别说话人身份。

工作流程：
```
麦克风 → VAD (检测语音) → SV (验证身份) → STT (转录) → OpenClaw
```

只有通过 SV 验证的语音才会继续处理，陌生人的语音会被丢弃。

## 快速开始

### 1. 启动服务

```bash
./scripts/start.sh
./scripts/start.sh --wait  # 等待所有服务就绪
```

### 2. 注册声纹

**方式一：命令行脚本**

```bash
uv run --with sounddevice --with numpy --with httpx python scripts/enroll_speaker.py
```

按提示输入说话人 ID 和名称，然后录制 3-5 秒语音。

**方式二：Web Dashboard**

1. 打开 http://localhost:4000/dashboard/
2. 找到「说话人管理」卡片
3. 点击「注册」按钮
4. 输入 ID 和名称
5. 点击「开始录音」，说话 3-5 秒
6. 录音自动停止并上传

### 3. 测试验证

```bash
uv run --with sounddevice --with numpy --with httpx python scripts/test_vad_pipeline.py
```

说话时会显示验证结果：
- ✅ 验证通过 → 继续 STT 转录
- ❌ 验证失败 → 丢弃音频

## API 参考

### 注册说话人

```bash
POST /api/sv/enroll
Content-Type: application/json

{
  "speaker_id": "user001",
  "speaker_name": "张三",
  "audio": "<base64 PCM 16-bit 16kHz>"
}
```

响应：
```json
{
  "success": true,
  "speaker_id": "user001",
  "speaker_name": "张三",
  "embedding_count": 1
}
```

### 验证说话人

```bash
POST /api/sv/verify
Content-Type: application/json

{
  "audio": "<base64 PCM 16-bit 16kHz>"
}
```

响应：
```json
{
  "verified": true,
  "speaker_id": "user001",
  "speaker_name": "张三",
  "confidence": 0.85,
  "threshold": 0.6
}
```

### 列出说话人

```bash
GET /api/sv/speakers
```

响应：
```json
[
  {
    "id": "user001",
    "name": "张三",
    "embedding_count": 1
  }
]
```

### 删除说话人

```bash
DELETE /api/sv/speakers/{speaker_id}
```

### 获取/更新配置

```bash
GET /api/sv/config
POST /api/sv/config

{
  "threshold": 0.6,
  "applyVAD": true
}
```

## 配置参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| threshold | 0.6 | 验证阈值 (0-1)，越高越严格 |
| applyVAD | true | 是否对输入音频应用 VAD 预处理 |

### 阈值调优建议

- **0.5-0.6**: 宽松，适合嘈杂环境或声音变化大的场景
- **0.6-0.7**: 推荐，平衡安全性和可用性
- **0.7-0.8**: 严格，适合安全要求高的场景

## 音频格式要求

- 采样率: 16000 Hz
- 位深: 16-bit (signed int)
- 声道: 单声道 (mono)
- 格式: PCM (无头)
- 建议时长: 3-5 秒

## 数据存储

声纹数据存储在 `services/wespeaker-sv/data/speakers.json`。

该文件包含敏感的声纹特征，已添加到 `.gitignore`。

## 故障排查

### 验证总是失败

1. 检查录音质量，避免背景噪音
2. 降低阈值 (threshold)
3. 重新注册声纹，确保录音清晰

### 误识别陌生人

1. 提高阈值 (threshold)
2. 注册更多声纹样本

### 服务不可用

```bash
# 检查服务状态
./scripts/start.sh --check

# 查看日志
./scripts/start.sh --attach
```

## 技术细节

- 模型: WeSpeaker voxblink2_samresnet100_ft (ONNX)
- 推理: ONNX Runtime (CPU/CUDA)
- 相似度: 余弦相似度
- VAD: Silero VAD (可选预处理)
