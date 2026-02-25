// clawbody plugin
// 把 AI 回复转发给 ClawBody /api/speak/stream

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

// --- Core bridge (same pattern as voice-call plugin) ---
let coreDepsPromise = null;

function resolveOpenClawRoot() {
  if (process.env.OPENCLAW_ROOT?.trim()) return process.env.OPENCLAW_ROOT.trim();
  const candidates = [process.argv[1] ? path.dirname(process.argv[1]) : null, process.cwd()].filter(Boolean);
  for (const start of candidates) {
    let dir = start;
    while (true) {
      const pkgPath = path.join(dir, 'package.json');
      try {
        if (fs.existsSync(pkgPath)) {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
          if (pkg.name === 'openclaw') return dir;
        }
      } catch {}
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  throw new Error('Unable to resolve OpenClaw root. Set OPENCLAW_ROOT.');
}

async function loadCoreDeps() {
  if (coreDepsPromise) return coreDepsPromise;
  coreDepsPromise = (async () => {
    const distPath = path.join(resolveOpenClawRoot(), 'dist', 'extensionAPI.js');
    if (!fs.existsSync(distPath)) throw new Error(`Missing extensionAPI.js at ${distPath}`);
    return await import(pathToFileURL(distPath).href);
  })();
  return coreDepsPromise;
}

// --- Channel plugin definition ---
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
    listAccountIds: (cfg) => Object.keys(cfg.channels?.clawbody?.accounts ?? {}),
    resolveAccount: (cfg, accountId) =>
      cfg.channels?.clawbody?.accounts?.[accountId ?? 'default'] ?? { accountId },
  },
  outbound: {
    deliveryMode: 'direct',
    resolveTarget: ({ cfg, accountId }) => {
      const accounts = cfg?.channels?.clawbody?.accounts ?? {};
      const id = accountId ?? 'default';
      const account = accounts[id] ?? accounts['default'];
      if (!account?.url) return { ok: false, error: 'ClawBody URL not configured' };
      return { ok: true, to: id };
    },
    sendText: async ({ text, account }) => speakText(account, text),
  },
};

async function speakText(account, text) {
  const baseUrl = account?.url;
  if (!baseUrl) {
    console.error('[clawbody] missing url');
    return { ok: false, error: 'ClawBody URL not configured.' };
  }
  const headers = { 'Content-Type': 'application/json' };
  if (account?.apiKey) headers['X-Api-Key'] = account.apiKey;

  try {
    const res = await fetch(`${baseUrl}/api/speak/stream`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ text, emotion: account?.emotion ?? 'neutral' }),
    });
    if (!res.ok) {
      console.error(`[clawbody] speak/stream failed: ${res.status}`);
      return { ok: false, error: `HTTP ${res.status}` };
    }
    // Drain response
    const reader = res.body.getReader();
    while (!(await reader.read()).done) {}
    return { ok: true };
  } catch (err) {
    console.error('[clawbody] speak/stream error:', err.message);
    return { ok: false, error: err.message };
  }
}

// --- Plugin entry ---
export default function (api) {
  api.registerChannel({ plugin });

  api.registerHttpRoute({
    path: '/plugins/clawbody/inbound',
    handler: async (req, res) => {
      try {
        const body = await readJsonBody(req);
        const text = body?.text?.trim();
        if (!text) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'text required' }));
          return;
        }

        const cfg = api.config;
        const accounts = cfg?.channels?.clawbody?.accounts ?? {};
        const accountId = body?.accountId ?? 'default';
        const account = accounts[accountId] ?? accounts['default'];
        const sessionKey = body?.sessionKey
          ?? cfg?.channels?.clawbody?.defaultSessionKey
          ?? 'clawbody:voice';

        // Load core agent deps (same as voice-call plugin)
        let deps;
        try {
          deps = await loadCoreDeps();
        } catch (err) {
          console.error('[clawbody] core deps load failed:', err.message);
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'core deps unavailable' }));
          return;
        }

        // Respond immediately, process async
        res.writeHead(202, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));

        // Run embedded agent (same pattern as voice-call)
        const agentId = 'main';
        const storePath = deps.resolveStorePath(cfg.session?.store, { agentId });
        const agentDir = deps.resolveAgentDir(cfg, agentId);
        const workspaceDir = deps.resolveAgentWorkspaceDir(cfg, agentId);
        await deps.ensureAgentWorkspace({ dir: workspaceDir });

        const sessionStore = deps.loadSessionStore(storePath);
        let sessionEntry = sessionStore[sessionKey];
        if (!sessionEntry) {
          sessionEntry = { sessionId: crypto.randomUUID(), updatedAt: Date.now() };
          sessionStore[sessionKey] = sessionEntry;
          await deps.saveSessionStore(storePath, sessionStore);
        }

        const sessionId = sessionEntry.sessionId;
        const sessionFile = deps.resolveSessionFilePath(sessionId, sessionEntry, { agentId });

        const modelRef = cfg?.channels?.clawbody?.model
          ?? `${deps.DEFAULT_PROVIDER}/${deps.DEFAULT_MODEL}`;
        const slashIdx = modelRef.indexOf('/');
        const provider = slashIdx === -1 ? deps.DEFAULT_PROVIDER : modelRef.slice(0, slashIdx);
        const model = slashIdx === -1 ? modelRef : modelRef.slice(slashIdx + 1);
        const thinkLevel = deps.resolveThinkingDefault({ cfg, provider, model });
        const timeoutMs = deps.resolveAgentTimeoutMs({ cfg });

        const voicePrompt = `[Voice] ${text}\n\n[System: Reply in short spoken sentences, max 2 sentences, no markdown or special symbols.]`;

        try {
          const result = await deps.runEmbeddedPiAgent({
            sessionId,
            sessionKey,
            messageProvider: 'clawbody',
            sessionFile,
            workspaceDir,
            config: cfg,
            prompt: voicePrompt,
            provider,
            model,
            thinkLevel,
            verboseLevel: 'off',
            timeoutMs,
            runId: `clawbody:${Date.now()}`,
            lane: 'clawbody',
            agentDir,
          });

          const texts = (result.payloads ?? [])
            .filter(p => p.text && !p.isError)
            .map(p => p.text?.trim())
            .filter(Boolean);
          const replyText = texts.join(' ');

          if (replyText) {
            await speakText(account, replyText);
          }
        } catch (err) {
          console.error('[clawbody] agent run failed:', err.message);
        }

      } catch (err) {
        console.error('[clawbody] inbound handler error:', err.message);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: err.message }));
        }
      }
    },
  });
}

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(data)); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}
