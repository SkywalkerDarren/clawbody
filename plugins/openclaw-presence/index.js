// presence-channel plugin
// 把 AI 回复转发给 ClawBody /api/speak/stream

const plugin = {
  id: 'presence',
  meta: {
    id: 'presence',
    label: 'Presence (ClawBody)',
    selectionLabel: 'Presence Channel',
    docsPath: '/channels/presence',
    blurb: 'Forwards AI replies to ClawBody for Live2D + TTS output.',
    aliases: ['clawbody', 'body'],
  },
  capabilities: { chatTypes: ['direct'] },
  config: {
    listAccountIds: (cfg) => {
      const accounts = cfg.channels?.presence?.accounts ?? {};
      return Object.keys(accounts);
    },
    resolveAccount: (cfg, accountId) =>
      cfg.channels?.presence?.accounts?.[accountId ?? 'default'] ?? { accountId },
  },
  outbound: {
    deliveryMode: 'direct',
    sendText: async ({ text, account }) => {
      const baseUrl = account?.url;
      if (!baseUrl) {
        console.error('[presence] missing required config: channels.presence.accounts.<id>.url');
        return { ok: false, error: 'ClawBody URL not configured. Set channels.presence.accounts.<id>.url in your OpenClaw config.' };
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
          console.error(`[presence] speak/stream failed: ${res.status}`);
          return { ok: false, error: `HTTP ${res.status}` };
        }

        // 消费 SSE 流（等待完成）
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          // 可以在这里处理 audio_chunk 事件，目前只等待完成
        }

        return { ok: true };
      } catch (err) {
        console.error('[presence] speak/stream error:', err.message);
        return { ok: false, error: err.message };
      }
    },
  },
};

export default function (api) {
  api.registerChannel({ plugin });
}
