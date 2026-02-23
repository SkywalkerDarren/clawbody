// clawbody plugin
// 把 AI 回复转发给 ClawBody /api/speak/stream

const plugin = {
  id: 'clawbody',
  meta: {
    id: 'clawbody',
    label: 'ClawBody',
    selectionLabel: 'ClawBody (Live2D + TTS)',
    docsPath: '/channels/clawbody',
    blurb: 'Forwards AI replies to ClawBody for Live2D + TTS output.',
    aliases: ['body', 'presence'],
  },
  capabilities: { chatTypes: ['direct'] },
  config: {
    listAccountIds: (cfg) => {
      const accounts = cfg.channels?.clawbody?.accounts ?? {};
      return Object.keys(accounts);
    },
    resolveAccount: (cfg, accountId) =>
      cfg.channels?.clawbody?.accounts?.[accountId ?? 'default'] ?? { accountId },
  },
  outbound: {
    deliveryMode: 'direct',
    sendText: async ({ text, account }) => {
      const baseUrl = account?.url;
      if (!baseUrl) {
        console.error('[clawbody] missing required config: channels.clawbody.accounts.<id>.url');
        return { ok: false, error: 'ClawBody URL not configured. Set channels.clawbody.accounts.<id>.url in your OpenClaw config.' };
      }
      const apiKey = account?.apiKey;
      const emotion = account?.emotion ?? 'neutral';

      try {
        const headers = { 'Content-Type': 'application/json' };
        if (apiKey) headers['X-Api-Key'] = apiKey;

        const res = await fetch(`${baseUrl}/api/speak/stream`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ text, emotion }),
        });

        if (!res.ok) {
          console.error(`[clawbody] speak/stream failed: ${res.status}`);
          return { ok: false, error: `HTTP ${res.status}` };
        }

        // 消费 SSE 流（等待完成）
        const reader = res.body.getReader();
        while (true) {
          const { done } = await reader.read();
          if (done) break;
        }

        return { ok: true };
      } catch (err) {
        console.error('[clawbody] speak/stream error:', err.message);
        return { ok: false, error: err.message };
      }
    },
  },
};


async function speakToClawBody(config, text) {
  const account = config?.channels?.clawbody?.accounts?.default;
  const baseUrl = account?.url;
  if (!baseUrl) return;

  const apiKey = account?.apiKey;
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['X-Api-Key'] = apiKey;

    const res = await fetch(`${baseUrl}/api/speak/stream`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ text, emotion: 'neutral' }),
    });

    if (!res.ok) {
      console.error(`[clawbody-mirror] speak/stream failed: ${res.status}`);
      return;
    }

    const reader = res.body.getReader();
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }
  } catch (err) {
    console.error('[clawbody-mirror] error:', err.message);
  }
}

export default function (api) {
  api.registerChannel({ plugin });

  // Mirror outbound Telegram messages to ClawBody for TTS
  api.registerHook(
    ['message:sent'],
    async (event) => {
      if (event.context?.channelId !== 'telegram') return;
      if (!event.context?.success) return;
      const content = event.context?.content;
      if (!content?.trim()) return;
      await speakToClawBody(api.config, content);
    },
    { name: 'clawbody-mirror', description: 'Mirror Telegram replies to ClawBody TTS' }
  );
}
