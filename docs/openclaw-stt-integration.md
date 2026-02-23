# ClawBody ↔ OpenClaw STT 集成指南

## 目标

当 ClawBody 的 STT 能力完成语音识别后，自动将转录文本推送给 OpenClaw，触发 AI 回复，回复再通过 ClawBody TTS 说出来。

## 架构

```
麦克风 → STT Service (port 8766)
  → STTCapability.emitEvent('sessionEnded', { text })
  → HttpServer.handleCapabilityEvent()
  → POST http://openclaw:18789/plugins/clawbody/inbound
  → OpenClaw 处理，回复通过 ClawBody TTS 输出
```

## OpenClaw 侧

ClawBody 插件已配置：
- Inbound URL: `/plugins/clawbody/inbound`
- 无需认证 token
- 支持 sessionKey 指定会话上下文

## ClawBody 侧配置

### `config/local.yaml` — OpenClaw 配置块

```yaml
# ============ OpenClaw 集成 ============
openclaw:
  webhookUrl: "http://<openclaw-host>:18789"   # OpenClaw Gateway 地址
  sessionKey: "voice:default"                   # 固定 session，保持上下文
```

### 类型定义

`packages/gateway/src/main.ts`:

```typescript
openclaw?: {
  webhookUrl: string;
  sessionKey?: string;
};
```

`packages/gateway/src/http-server.ts`:

```typescript
export interface OpenClawConfig {
  webhookUrl: string;
  sessionKey?: string;
}
```

### STT 转发逻辑

`HttpServer.forwardSTTToOpenClaw`:

```typescript
private async forwardSTTToOpenClaw(text: string): Promise<void> {
  const oc = this.openclawConfig;
  if (!oc?.webhookUrl || !text.trim()) return;

  try {
    const body: Record<string, unknown> = { text };
    if (oc.sessionKey) body['sessionKey'] = oc.sessionKey;

    const res = await fetch(`${oc.webhookUrl}/plugins/clawbody/inbound`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

## 触发方式

STT 转发在 `sessionEnded` 事件触发，即调用 `endSession` 操作后。

触发流程（通过 ClawBody HTTP API）：
1. `POST /api/stt/sessions` — 创建会话
2. `POST /api/stt/sessions/:id/chunks` — 发送音频块（循环）
3. `POST /api/stt/sessions/:id/end` — 结束会话 → 触发 `sessionEnded` → 自动转发给 OpenClaw

## 验证

重启 ClawBody 后，手动触发一次 STT 会话并结束，检查：
1. ClawBody 日志出现 `STT forwarded to OpenClaw: "..."`
2. OpenClaw 收到消息并回复
3. 回复通过 ClawBody TTS 说出来
