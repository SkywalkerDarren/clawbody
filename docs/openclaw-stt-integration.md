# ClawBody ↔ OpenClaw STT 集成指南

## 目标

当 ClawBody 的 STT 能力完成语音识别后，自动将转录文本推送给 OpenClaw，触发 AI 回复，回复再通过 ClawBody TTS 说出来。

## 架构

```
麦克风 → STT Service (port 8766)
  → STTCapability.emitEvent('sessionEnded', { text })
  → HttpServer.handleCapabilityEvent()
  → POST http://localhost:18789/hooks/agent   ← 新增
  → OpenClaw 处理，回复通过 Telegram + ClawBody TTS 输出
```

## OpenClaw 侧（已配置完毕）

Webhook 已启用：
- URL: `http://localhost:18789/hooks/agent`
- Token: `OGQVdyOEOI1mlSRhua1ZLLFdPy86RvXh`
- `allowRequestSessionKey: true`（支持固定 session）

## ClawBody 侧需要修改的文件

### 1. `config/default.yaml` — 新增 OpenClaw 配置块

在文件末尾添加：

```yaml
# ============ OpenClaw 集成 ============
openclaw:
  # OpenClaw Gateway webhook 地址（Pi 上运行）
  webhookUrl: "http://192.168.1.4:18789"   # 改成 Pi 的实际 IP
  webhookToken: "OGQVdyOEOI1mlSRhua1ZLLFdPy86RvXh"
  # 固定 session key，让语音输入有持续上下文
  sessionKey: "voice:darren"
  # 回复投递渠道
  deliverChannel: "telegram"
```

### 2. `packages/gateway/src/main.ts` — 扩展 `BodyConfig` 类型

在 `BodyConfig` interface 中添加：

```typescript
openclaw?: {
  webhookUrl: string;
  webhookToken: string;
  sessionKey?: string;
  deliverChannel?: string;
};
```

### 3. `packages/gateway/src/http-server.ts` — 核心改动

#### 3a. 新增 `forwardSTTToOpenClaw` 方法

在 `HttpServer` 类中添加：

```typescript
private async forwardSTTToOpenClaw(text: string): Promise<void> {
  const oc = this.config.openclaw;  // 需要把 config 传进来，见 3b
  if (!oc?.webhookUrl || !text.trim()) return;

  try {
    const body: Record<string, unknown> = {
      message: text,
      deliver: true,
      channel: oc.deliverChannel ?? 'telegram',
    };
    if (oc.sessionKey) body.sessionKey = oc.sessionKey;

    const res = await fetch(`${oc.webhookUrl}/hooks/agent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${oc.webhookToken}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      logger.error(MOD, `forward STT to OpenClaw failed: ${res.status}`);
    } else {
      logger.info(MOD, `STT forwarded to OpenClaw: "${text.slice(0, 50)}..."`);
    }
  } catch (err) {
    logger.error(MOD, 'forward STT to OpenClaw error', err);
  }
}
```

#### 3b. `HttpServer` 构造函数需要接收完整 config

检查 `HttpServer` 构造函数是否已经接收 `BodyConfig`。如果只接收了部分配置（如 `http` 字段），需要改为接收完整 `BodyConfig` 或单独传入 `openclaw` 配置。

#### 3c. 修改 `handleCapabilityEvent` — 转发 STT 事件

在现有的 `handleCapabilityEvent` 方法中，在广播 WebSocket 之前添加 STT 转发逻辑：

```typescript
private handleCapabilityEvent(event: CapabilityEvent): void {
  // 新增：STT 最终结果转发给 OpenClaw
  if (event.capabilityId === 'stt') {
    if (event.eventType === 'sessionEnded' && (event.data as { text?: string })?.text) {
      const text = (event.data as { text: string }).text;
      this.forwardSTTToOpenClaw(text).catch(() => {});
    }
    // 可选：也转发 is_final 的 partialTranscript（更低延迟，但可能重复）
    // if (event.eventType === 'partialTranscript') {
    //   const d = event.data as { text?: string; isFinal?: boolean };
    //   if (d.isFinal && d.text) this.forwardSTTToOpenClaw(d.text).catch(() => {});
    // }
  }

  // 原有逻辑保持不变
  if (event.eventType === 'command') {
    const data = event.data as { type: string; data: unknown };
    this.broadcastWS({ type: data.type, data: data.data });
    this.broadcastSSE(data.data, data.type);
  } else {
    this.broadcastWS({
      type: 'event',
      capabilityId: event.capabilityId,
      eventType: event.eventType,
      data: event.data,
    });
  }
}
```

### 4. STT 能力需要启用（`config/default.yaml`）

确保 STT 能力已启用：

```yaml
capabilities:
  stt:
    enabled: true
    providers:
      qwen:
        type: "qwen"
        baseUrl: "http://localhost:8766"
```

## 触发方式

STT 转发在 `sessionEnded` 事件触发，即调用 `endSession` 操作后。

触发流程（通过 ClawBody HTTP API）：
1. `POST /api/stt/session` — 创建会话
2. `POST /api/stt/chunk` — 发送音频块（循环）
3. `POST /api/stt/end` — 结束会话 → 触发 `sessionEnded` → 自动转发给 OpenClaw

或者通过 WebSocket 直连 STT Service（见 `scripts/test_stt_stream.py`），结束后调用 ClawBody 的 `endSession`。

## 验证

重启 ClawBody 后，手动触发一次 STT 会话并结束，检查：
1. ClawBody 日志出现 `STT forwarded to OpenClaw: "..."`
2. OpenClaw 收到消息并回复
3. 回复通过 Telegram 发出，同时 ClawBody TTS 说出来
