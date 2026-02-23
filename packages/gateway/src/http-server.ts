import express, { Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import type { CapabilityRegistry, CapabilityEvent } from '@clawbody/core';
import { logger } from '@clawbody/core';

const MOD = 'http-server';

export interface HttpServerConfig {
  port: number;
  host?: string;
  apiKey?: string;
  staticDir?: string;
}

export interface PersonaConfig {
  name: string;
  voice: {
    provider: string;
    id: string;
    language: string;
  };
  model: {
    path: string;
    scale?: number;
    position?: string;
  };
  expressions: Record<string, string>;
  motions: Record<string, string>;
}

export interface OpenClawConfig {
  webhookUrl: string;
  sessionKey?: string;
}

/**
 * HTTP/WebSocket/SSE 服务器 - 为前端提供通信接口
 */
export class HttpServer {
  private app: express.Application;
  private httpServer: ReturnType<typeof createServer>;
  private wss: WebSocketServer;
  private wsClients = new Set<WebSocket>();
  private sseClients = new Set<Response>();
  private registry: CapabilityRegistry;
  private config: HttpServerConfig;
  private persona?: PersonaConfig;
  private openclawConfig?: OpenClawConfig;
  private startTime = Date.now();
  private unsubscribes: Array<() => void> = [];

  constructor(registry: CapabilityRegistry, config: HttpServerConfig, persona?: PersonaConfig, openclaw?: OpenClawConfig) {
    this.registry = registry;
    this.config = config;
    this.persona = persona;
    this.openclawConfig = openclaw;

    this.app = express();
    this.httpServer = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.httpServer });

    this.setupMiddleware();
    this.setupWebSocket();
    this.setupRoutes();
    this.subscribeToCapabilities();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());

    // 请求/响应日志中间件
    this.app.use('/api', (req: Request, res: Response, next: NextFunction) => {
      const startTime = Date.now();
      const { method, path } = req;

      // 记录请求 (排除大型 audio 数据)
      const logBody = { ...req.body };
      if (logBody.audio && typeof logBody.audio === 'string' && logBody.audio.length > 100) {
        logBody.audio = `[base64 ${logBody.audio.length} chars]`;
      }
      logger.debug(MOD, `→ ${method} ${path}`, Object.keys(logBody).length > 0 ? logBody : undefined);

      // 拦截响应
      const originalJson = res.json.bind(res);
      res.json = (body: unknown) => {
        const duration = Date.now() - startTime;
        const logRes = { ...body as Record<string, unknown> };

        // 排除大型数据
        if (logRes['audio'] && typeof logRes['audio'] === 'string' && (logRes['audio'] as string).length > 100) {
          logRes['audio'] = `[base64 ${(logRes['audio'] as string).length} chars]`;
        }
        if (logRes['segments'] && Array.isArray(logRes['segments'])) {
          logRes['segments'] = `[${(logRes['segments'] as unknown[]).length} segments]`;
        }

        logger.debug(MOD, `← ${method} ${path} ${res.statusCode} (${duration}ms)`, logRes);
        return originalJson(body);
      };

      next();
    });

    // 静态文件服务
    const staticDir = this.config.staticDir ?? path.join(__dirname, '..', 'public');
    this.app.use(express.static(staticDir));

    // API key 认证
    if (this.config.apiKey) {
      this.app.use('/api', (req: Request, res: Response, next: NextFunction) => {
        const publicPaths = ['/health', '/events', '/model-ready', '/ack'];
        if (publicPaths.some((p) => req.path === p || req.path.startsWith(p))) {
          return next();
        }

        const key = req.headers['x-api-key'];
        if (!key || key !== this.config.apiKey) {
          res.status(401).json({ error: 'Unauthorized' });
          return;
        }
        next();
      });
    }
  }

  private setupWebSocket(): void {
    this.wss.on('connection', (ws, req) => {
      this.wsClients.add(ws);
      logger.info(MOD, `WS client connected (${this.wsClients.size} total)`, {
        ip: req.socket.remoteAddress,
      });

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString()) as { type?: string; [k: string]: unknown };
          logger.debug(MOD, 'WS message received', msg);
        } catch {
          logger.warn(MOD, 'WS invalid JSON');
        }
      });

      ws.on('close', () => {
        this.wsClients.delete(ws);
        logger.info(MOD, `WS client disconnected (${this.wsClients.size} remaining)`);
      });

      ws.on('error', (err) => logger.error(MOD, 'WS error', err));
    });
  }

  private setupRoutes(): void {
    const send = (res: Response, status: number, body: object): void => {
      res.status(status).json(body);
    };

    // GET /api/health
    this.app.get('/api/health', (_req: Request, res: Response) => {
      send(res, 200, {
        ok: true,
        uptime: Math.floor((Date.now() - this.startTime) / 1000),
        wsClients: this.wsClients.size,
        sseClients: this.sseClients.size,
      });
    });

    // GET /api/persona (获取角色配置)
    this.app.get('/api/persona', (_req: Request, res: Response) => {
      if (this.persona) {
        send(res, 200, { persona: this.persona });
      } else {
        send(res, 404, { error: 'No persona configured' });
      }
    });

    // GET /api/capabilities
    this.app.get('/api/capabilities', (_req: Request, res: Response) => {
      const capabilities = this.registry.getAllMeta();
      send(res, 200, { capabilities });
    });

    // POST /api/speak - 简化的说话接口，Brain 只需传文本
    this.app.post('/api/speak', async (req: Request, res: Response) => {
      const { text, emotion } = req.body as { text: string; emotion?: string };
      const timings: Record<string, number> = {};
      const startTime = Date.now();

      if (!text) {
        send(res, 400, { error: 'text is required' });
        return;
      }

      const live2d = this.registry.get('live2d');
      const tts = this.registry.get('tts');

      try {
        // 1. 设置表情 (根据 emotion 或使用默认)
        if (live2d && this.persona) {
          const exprStart = Date.now();
          const exprName = emotion
            ? this.persona.expressions[emotion] ?? this.persona.expressions['default']
            : this.persona.expressions['default'];
          if (exprName) {
            await live2d.execute('expression', { name: exprName });
          }
          timings['expression_ms'] = Date.now() - exprStart;

          // 2. 触发说话动作 (如果配置了的话)
          const motionStart = Date.now();
          const motionGroup = this.persona.motions['speaking'];
          if (motionGroup) {
            await live2d.execute('motion', { group: motionGroup, index: 0 });
          }
          timings['motion_ms'] = Date.now() - motionStart;
        }

        // 3. 合成语音并播放
        let audioResult: { audio?: Buffer; duration?: number } | null = null;
        if (tts && this.persona) {
          const ttsStart = Date.now();
          const voiceConfig = this.persona.voice;
          audioResult = (await tts.execute('synthesize', {
            text,
            voice: voiceConfig.id,
            provider: voiceConfig.provider,
          })) as { audio?: Buffer; duration?: number };
          timings['tts_ms'] = Date.now() - ttsStart;

          // 4. 发送音频到前端播放
          if (audioResult?.audio) {
            const broadcastStart = Date.now();
            const audioBase64 = audioResult.audio.toString('base64');
            this.broadcastWS({ type: 'audio', data: { audio: audioBase64, format: 'wav' } });
            this.broadcastSSE({ audio: audioBase64, format: 'wav' }, 'audio');
            timings['broadcast_ms'] = Date.now() - broadcastStart;
            timings['audio_size_kb'] = Math.round(audioResult.audio.length / 1024);
          }
        }

        timings['total_ms'] = Date.now() - startTime;
        logger.info(MOD, 'speak timings', timings);

        send(res, 200, {
          ok: true,
          text,
          emotion: emotion ?? 'default',
          audio: audioResult ? { duration: audioResult.duration } : null,
          timings,
        });
      } catch (err) {
        logger.error(MOD, 'speak failed', err);
        send(res, 500, { error: 'Speak failed' });
      }
    });

    // POST /api/speak/stream - 流式说话接口
    this.app.post('/api/speak/stream', async (req: Request, res: Response) => {
      const { text, emotion } = req.body as { text: string; emotion?: string };

      if (!text) {
        send(res, 400, { error: 'text is required' });
        return;
      }

      const live2d = this.registry.get('live2d');
      const tts = this.registry.get('tts');

      if (!tts || !('executeStream' in tts)) {
        send(res, 503, { error: 'Streaming TTS not available' });
        return;
      }

      // Set SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      try {
        // 1. 设置表情
        if (live2d && this.persona) {
          const exprName = emotion
            ? this.persona.expressions[emotion] ?? this.persona.expressions['default']
            : this.persona.expressions['default'];
          if (exprName) {
            await live2d.execute('expression', { name: exprName });
          }
        }

        // 2. 流式合成语音
        const voiceConfig = this.persona?.voice;
        const streamCapability = tts as { executeStream: (op: string, input: unknown) => AsyncIterable<Buffer> };

        let chunkCount = 0;
        const startTime = Date.now();

        for await (const chunk of streamCapability.executeStream('synthesizeStream', {
          text,
          voice: voiceConfig?.id ?? '1',
          provider: voiceConfig?.provider ?? 'qwen',
        })) {
          chunkCount++;

          // Send chunk to SSE response
          const chunkB64 = chunk.toString('base64');
          const eventData = { audio: chunkB64, chunk: chunkCount };

          if (chunkCount === 1) {
            const firstChunkMs = Date.now() - startTime;
            logger.info(MOD, `First chunk latency: ${firstChunkMs}ms`);
            Object.assign(eventData, { first_chunk_ms: firstChunkMs });
          }

          res.write(`data: ${JSON.stringify(eventData)}\n\n`);

          // Also broadcast to WS and SSE clients
          this.broadcastWS({ type: 'audio_chunk', data: eventData });
          this.broadcastSSE(eventData, 'audio_chunk');
        }

        // Send done event
        const totalMs = Date.now() - startTime;
        const doneData = { done: true, chunks: chunkCount, total_ms: totalMs };
        res.write(`data: ${JSON.stringify(doneData)}\n\n`);
        this.broadcastSSE(doneData, 'audio_chunk');
        logger.info(MOD, `Streaming complete: ${chunkCount} chunks in ${totalMs}ms`);

        res.end();
      } catch (err) {
        logger.error(MOD, 'speak/stream failed', err);
        res.write(`data: ${JSON.stringify({ error: 'Stream failed' })}\n\n`);
        res.end();
      }
    });

    // POST /api/emote - 设置表情
    this.app.post('/api/emote', async (req: Request, res: Response) => {
      const { emotion } = req.body as { emotion: string };

      if (!emotion) {
        send(res, 400, { error: 'emotion is required' });
        return;
      }

      const live2d = this.registry.get('live2d');
      if (!live2d) {
        send(res, 503, { error: 'Live2D not available' });
        return;
      }

      try {
        const exprName = this.persona?.expressions[emotion] ?? emotion;
        await live2d.execute('expression', { name: exprName });
        send(res, 200, { ok: true, emotion, expression: exprName });
      } catch (err) {
        logger.error(MOD, 'emote failed', err);
        send(res, 500, { error: 'Emote failed' });
      }
    });

    // POST /api/action - 触发动作
    this.app.post('/api/action', async (req: Request, res: Response) => {
      const { action } = req.body as { action: string };

      if (!action) {
        send(res, 400, { error: 'action is required' });
        return;
      }

      const live2d = this.registry.get('live2d');
      if (!live2d) {
        send(res, 503, { error: 'Live2D not available' });
        return;
      }

      try {
        const motionGroup = this.persona?.motions[action] ?? action;
        await live2d.execute('motion', { group: motionGroup, index: 0 });
        send(res, 200, { ok: true, action, motion: motionGroup });
      } catch (err) {
        logger.error(MOD, 'action failed', err);
        send(res, 500, { error: 'Action failed' });
      }
    });

    // GET /api/model-info (Live2D 模型信息)
    this.app.get('/api/model-info', (_req: Request, res: Response) => {
      const live2d = this.registry.get('live2d');
      if (live2d && 'isModelLoaded' in live2d && 'getModelInfo' in live2d) {
        const cap = live2d as { isModelLoaded: () => boolean; getModelInfo: () => { expressions: string[]; motions: Record<string, number> } };
        const info = cap.getModelInfo();
        send(res, 200, {
          loaded: cap.isModelLoaded(),
          ...info,
        });
      } else {
        send(res, 404, { error: 'Live2D capability not available' });
      }
    });

    // POST /api/model-ready (Live2D 前端回调)
    this.app.post('/api/model-ready', (req: Request, res: Response) => {
      const { loaded, expressions, motions } = req.body as {
        loaded?: boolean;
        expressions?: string[];
        motions?: Record<string, number>;
      };
      logger.info(MOD, 'model-ready', { loaded });

      // 找到 live2d 能力并更新状态
      const live2d = this.registry.get('live2d');
      if (live2d && 'setModelLoaded' in live2d) {
        const cap = live2d as { setModelLoaded: (loaded: boolean, info?: { expressions: string[]; motions: Record<string, number> }) => void };
        if (expressions && motions) {
          cap.setModelLoaded(true, { expressions, motions });
        } else {
          cap.setModelLoaded(loaded ?? false);
        }
      }

      this.broadcastWS({ type: 'model-ready', loaded });
      send(res, 200, { ok: true });
    });

    // POST /api/ack
    this.app.post('/api/ack', (req: Request, res: Response) => {
      const { type, success, error } = req.body as {
        type?: string;
        success?: boolean;
        error?: string;
      };
      logger.debug(MOD, 'ack', { type, success, error });
      send(res, 200, { ok: true });
    });

    // GET /api/screen (Vision 截图)
    this.app.get('/api/screen', async (req: Request, res: Response) => {
      const vision = this.registry.get('vision');
      if (!vision) {
        send(res, 503, { error: 'Vision capability not available' });
        return;
      }

      try {
        const activeWindow = req.query['activeWindow'] === 'true';
        const result = await vision.execute('screenshot', { activeWindow });
        send(res, 200, result as object);
      } catch (err) {
        logger.error(MOD, 'screenshot failed', err);
        send(res, 500, { error: 'Screenshot failed' });
      }
    });

    // GET /api/desktop (桌面和窗口信息)
    this.app.get('/api/desktop', async (_req: Request, res: Response) => {
      const vision = this.registry.get('vision');
      if (!vision) {
        send(res, 503, { error: 'Vision capability not available' });
        return;
      }

      try {
        const result = await vision.execute('getDesktopInfo', {});
        send(res, 200, result as object);
      } catch (err) {
        logger.error(MOD, 'getDesktopInfo failed', err);
        send(res, 500, { error: 'Get desktop info failed' });
      }
    });

    // === STT (Speech-to-Text) 路由 ===

    // POST /api/listen - 简化的语音识别接口
    this.app.post('/api/listen', async (req: Request, res: Response) => {
      const { audio, language } = req.body as { audio: string; language?: string };

      if (!audio) {
        send(res, 400, { error: 'audio is required (base64 encoded)' });
        return;
      }

      const stt = this.registry.get('stt');
      if (!stt) {
        send(res, 503, { error: 'STT capability not available' });
        return;
      }

      try {
        const result = (await stt.execute('transcribe', {
          audio,
          language: language ?? 'auto',
        })) as { text: string; language: string; duration: number };

        send(res, 200, {
          ok: true,
          text: result.text,
          language: result.language,
          duration: result.duration,
        });
      } catch (err) {
        logger.error(MOD, 'listen failed', err);
        send(res, 500, { error: 'Transcription failed' });
      }
    });

    // POST /api/stt/transcribe - 完整转录接口
    this.app.post('/api/stt/transcribe', async (req: Request, res: Response) => {
      const { audio, language, provider, enableTimestamps } = req.body as {
        audio: string;
        language?: string;
        provider?: string;
        enableTimestamps?: boolean;
      };

      if (!audio) {
        send(res, 400, { error: 'audio is required' });
        return;
      }

      const stt = this.registry.get('stt');
      if (!stt) {
        send(res, 503, { error: 'STT capability not available' });
        return;
      }

      try {
        const result = await stt.execute('transcribe', {
          audio,
          language,
          provider,
          enableTimestamps,
        });
        send(res, 200, result as object);
      } catch (err) {
        logger.error(MOD, 'stt/transcribe failed', err);
        send(res, 500, { error: 'Transcription failed' });
      }
    });

    // POST /api/stt/sessions - 创建流式会话
    this.app.post('/api/stt/sessions', async (req: Request, res: Response) => {
      const { language, provider } = req.body as { language?: string; provider?: string };

      const stt = this.registry.get('stt');
      if (!stt) {
        send(res, 503, { error: 'STT capability not available' });
        return;
      }

      try {
        const result = (await stt.execute('startSession', { language, provider })) as {
          sessionId: string;
          state: string;
        };
        send(res, 200, {
          sessionId: result.sessionId,
          state: result.state,
          wsUrl: `/api/stt/sessions/${result.sessionId}/stream`,
        });
      } catch (err) {
        logger.error(MOD, 'stt/sessions create failed', err);
        send(res, 500, { error: 'Failed to create session' });
      }
    });

    // POST /api/stt/sessions/:sessionId/chunks - 发送音频块
    this.app.post('/api/stt/sessions/:sessionId/chunks', async (req: Request, res: Response) => {
      const { sessionId } = req.params;
      const { audio } = req.body as { audio: string };

      if (!audio) {
        send(res, 400, { error: 'audio is required' });
        return;
      }

      const stt = this.registry.get('stt');
      if (!stt) {
        send(res, 503, { error: 'STT capability not available' });
        return;
      }

      try {
        const result = await stt.execute('sendChunk', { sessionId, audio });
        send(res, 200, result as object);
      } catch (err) {
        logger.error(MOD, 'stt/sessions/chunks failed', err);
        send(res, 500, { error: 'Failed to process chunk' });
      }
    });

    // POST /api/stt/sessions/:sessionId/end - 结束会话
    this.app.post('/api/stt/sessions/:sessionId/end', async (req: Request, res: Response) => {
      const { sessionId } = req.params;

      const stt = this.registry.get('stt');
      if (!stt) {
        send(res, 503, { error: 'STT capability not available' });
        return;
      }

      try {
        const result = await stt.execute('endSession', { sessionId });
        send(res, 200, result as object);
      } catch (err) {
        logger.error(MOD, 'stt/sessions/end failed', err);
        send(res, 500, { error: 'Failed to end session' });
      }
    });

    // DELETE /api/stt/sessions/:sessionId - 取消会话
    this.app.delete('/api/stt/sessions/:sessionId', async (req: Request, res: Response) => {
      const { sessionId } = req.params;

      const stt = this.registry.get('stt');
      if (!stt) {
        send(res, 503, { error: 'STT capability not available' });
        return;
      }

      try {
        await stt.execute('cancelSession', { sessionId });
        send(res, 200, { ok: true, sessionId });
      } catch (err) {
        logger.error(MOD, 'stt/sessions cancel failed', err);
        send(res, 500, { error: 'Failed to cancel session' });
      }
    });

    // GET /api/stt/languages - 列出支持的语言
    this.app.get('/api/stt/languages', async (req: Request, res: Response) => {
      const { provider } = req.query as { provider?: string };

      const stt = this.registry.get('stt');
      if (!stt) {
        send(res, 503, { error: 'STT capability not available' });
        return;
      }

      try {
        const languages = await stt.execute('listLanguages', { provider });
        send(res, 200, { languages });
      } catch (err) {
        logger.error(MOD, 'stt/languages failed', err);
        send(res, 500, { error: 'Failed to list languages' });
      }
    });

    // === VAD (Voice Activity Detection) 路由 ===

    // POST /api/vad/process - 处理音频块
    this.app.post('/api/vad/process', async (req: Request, res: Response) => {
      const { audio, provider } = req.body as { audio: string; provider?: string };

      if (!audio) {
        send(res, 400, { error: 'audio is required (base64 encoded PCM)' });
        return;
      }

      const vad = this.registry.get('vad');
      if (!vad) {
        send(res, 503, { error: 'VAD capability not available' });
        return;
      }

      try {
        const result = await vad.execute('processChunk', { audio, provider });
        send(res, 200, result as object);
      } catch (err) {
        logger.error(MOD, 'vad/process failed', err);
        send(res, 500, { error: 'VAD processing failed' });
      }
    });

    // POST /api/vad/reset - 重置 VAD 状态
    this.app.post('/api/vad/reset', async (req: Request, res: Response) => {
      const { provider } = req.body as { provider?: string };

      const vad = this.registry.get('vad');
      if (!vad) {
        send(res, 503, { error: 'VAD capability not available' });
        return;
      }

      try {
        const result = await vad.execute('reset', { provider });
        send(res, 200, result as object);
      } catch (err) {
        logger.error(MOD, 'vad/reset failed', err);
        send(res, 500, { error: 'VAD reset failed' });
      }
    });

    // GET /api/vad/config - 获取 VAD 配置
    this.app.get('/api/vad/config', async (req: Request, res: Response) => {
      const { provider } = req.query as { provider?: string };

      const vad = this.registry.get('vad');
      if (!vad) {
        send(res, 503, { error: 'VAD capability not available' });
        return;
      }

      try {
        const config = await vad.execute('getConfig', { provider });
        send(res, 200, config as object);
      } catch (err) {
        logger.error(MOD, 'vad/config get failed', err);
        send(res, 500, { error: 'Failed to get VAD config' });
      }
    });

    // POST /api/vad/config - 更新 VAD 配置
    this.app.post('/api/vad/config', async (req: Request, res: Response) => {
      const { provider, threshold, minSpeechDurationMs, minSilenceDurationMs, speechPadMs } =
        req.body as {
          provider?: string;
          threshold?: number;
          minSpeechDurationMs?: number;
          minSilenceDurationMs?: number;
          speechPadMs?: number;
        };

      const vad = this.registry.get('vad');
      if (!vad) {
        send(res, 503, { error: 'VAD capability not available' });
        return;
      }

      try {
        const result = await vad.execute('updateConfig', {
          provider,
          threshold,
          minSpeechDurationMs,
          minSilenceDurationMs,
          speechPadMs,
        });
        send(res, 200, result as object);
      } catch (err) {
        logger.error(MOD, 'vad/config update failed', err);
        send(res, 500, { error: 'Failed to update VAD config' });
      }
    });

    // === Speaker Verification (SV) 路由 ===

    // POST /api/sv/enroll - 注册说话人
    this.app.post('/api/sv/enroll', async (req: Request, res: Response) => {
      const { speakerId, speakerName, audio, provider } = req.body as {
        speakerId: string;
        speakerName: string;
        audio: string;
        provider?: string;
      };

      if (!speakerId || !speakerName || !audio) {
        send(res, 400, { error: 'speakerId, speakerName, and audio are required' });
        return;
      }

      const sv = this.registry.get('speaker-verification');
      if (!sv) {
        send(res, 503, { error: 'Speaker Verification capability not available' });
        return;
      }

      try {
        const result = await sv.execute('enroll', { speakerId, speakerName, audio, provider });
        send(res, 200, result as object);
      } catch (err) {
        logger.error(MOD, 'sv/enroll failed', err);
        send(res, 500, { error: 'Enrollment failed' });
      }
    });

    // POST /api/sv/verify - 验证说话人
    this.app.post('/api/sv/verify', async (req: Request, res: Response) => {
      const { audio, provider } = req.body as { audio: string; provider?: string };

      if (!audio) {
        send(res, 400, { error: 'audio is required (base64 encoded PCM)' });
        return;
      }

      const sv = this.registry.get('speaker-verification');
      if (!sv) {
        send(res, 503, { error: 'Speaker Verification capability not available' });
        return;
      }

      try {
        const result = await sv.execute('verify', { audio, provider });
        send(res, 200, result as object);
      } catch (err) {
        logger.error(MOD, 'sv/verify failed', err);
        send(res, 500, { error: 'Verification failed' });
      }
    });

    // GET /api/sv/speakers - 列出所有说话人
    this.app.get('/api/sv/speakers', async (req: Request, res: Response) => {
      const { provider } = req.query as { provider?: string };

      const sv = this.registry.get('speaker-verification');
      if (!sv) {
        send(res, 503, { error: 'Speaker Verification capability not available' });
        return;
      }

      try {
        const result = await sv.execute('listSpeakers', { provider });
        send(res, 200, result as object);
      } catch (err) {
        logger.error(MOD, 'sv/speakers list failed', err);
        send(res, 500, { error: 'Failed to list speakers' });
      }
    });

    // DELETE /api/sv/speakers/:speakerId - 删除说话人
    this.app.delete('/api/sv/speakers/:speakerId', async (req: Request, res: Response) => {
      const { speakerId } = req.params;
      const { provider } = req.query as { provider?: string };

      const sv = this.registry.get('speaker-verification');
      if (!sv) {
        send(res, 503, { error: 'Speaker Verification capability not available' });
        return;
      }

      try {
        const result = await sv.execute('deleteSpeaker', { speakerId, provider });
        send(res, 200, result as object);
      } catch (err) {
        logger.error(MOD, 'sv/speakers delete failed', err);
        send(res, 500, { error: 'Failed to delete speaker' });
      }
    });

    // GET /api/sv/config - 获取 SV 配置
    this.app.get('/api/sv/config', async (req: Request, res: Response) => {
      const { provider } = req.query as { provider?: string };

      const sv = this.registry.get('speaker-verification');
      if (!sv) {
        send(res, 503, { error: 'Speaker Verification capability not available' });
        return;
      }

      try {
        const config = await sv.execute('getConfig', { provider });
        send(res, 200, config as object);
      } catch (err) {
        logger.error(MOD, 'sv/config get failed', err);
        send(res, 500, { error: 'Failed to get SV config' });
      }
    });

    // POST /api/sv/config - 更新 SV 配置
    this.app.post('/api/sv/config', async (req: Request, res: Response) => {
      const { provider, threshold, applyVAD } = req.body as {
        provider?: string;
        threshold?: number;
        applyVAD?: boolean;
      };

      const sv = this.registry.get('speaker-verification');
      if (!sv) {
        send(res, 503, { error: 'Speaker Verification capability not available' });
        return;
      }

      try {
        const result = await sv.execute('updateConfig', { provider, threshold, applyVAD });
        send(res, 200, result as object);
      } catch (err) {
        logger.error(MOD, 'sv/config update failed', err);
        send(res, 500, { error: 'Failed to update SV config' });
      }
    });

    // GET /api/events (SSE)
    this.app.get('/api/events', (req: Request, res: Response) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      this.sseClients.add(res);
      logger.info(MOD, 'SSE client connected', { total: this.sseClients.size });
      res.write('data: {"type":"hello"}\n\n');

      req.on('close', () => {
        this.sseClients.delete(res);
        logger.info(MOD, 'SSE client disconnected', { total: this.sseClients.size });
      });
    });

    // 404 fallback
    this.app.use((_req: Request, res: Response) => {
      send(res, 404, { error: 'not found' });
    });

    // Error handler
    this.app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
      logger.error(MOD, 'unhandled error', err);
      send(res, 500, { error: 'internal server error' });
    });
  }

  private subscribeToCapabilities(): void {
    // 订阅所有能力的事件
    for (const capability of this.registry.getAll()) {
      if (capability.subscribe) {
        const unsubscribe = capability.subscribe((event: CapabilityEvent) => {
          this.handleCapabilityEvent(event);
        });
        this.unsubscribes.push(unsubscribe);
      }
    }
  }

  private handleCapabilityEvent(event: CapabilityEvent): void {
    // VAD speech_end_with_audio → 自动触发 STT 转录
    if (event.capabilityId === 'vad' && event.eventType === 'speech_end_with_audio') {
      const data = event.data as {
        audioBuffer?: string;
        autoTriggerSTT?: boolean;
      };
      if (data.autoTriggerSTT && data.audioBuffer) {
        this.handleVADSpeechEnd(data.audioBuffer).catch((err) => {
          logger.error(MOD, 'VAD → STT failed', err);
        });
      }
    }

    // STT 最终结果转发给 OpenClaw
    if (event.capabilityId === 'stt') {
      if (event.eventType === 'sessionEnded' && (event.data as { text?: string })?.text) {
        const text = (event.data as { text: string }).text;
        this.forwardSTTToOpenClaw(text).catch(() => {});
      }
    }

    // 将能力事件广播到前端
    if (event.eventType === 'command') {
      // Live2D 命令事件
      const data = event.data as { type: string; data: unknown };
      this.broadcastWS({ type: data.type, data: data.data });
      this.broadcastSSE(data.data, data.type);
    } else {
      // 其他事件
      this.broadcastWS({
        type: 'event',
        capabilityId: event.capabilityId,
        eventType: event.eventType,
        data: event.data,
      });
    }
  }

  private async handleVADSpeechEnd(audioBuffer: string): Promise<void> {
    const stt = this.registry.get('stt');
    if (!stt) {
      logger.warn(MOD, 'VAD speech_end but STT not available');
      return;
    }

    logger.info(MOD, 'VAD → STT: transcribing speech...');
    const startTime = Date.now();

    try {
      const result = (await stt.execute('transcribe', {
        audio: audioBuffer,
        language: 'auto',
      })) as { text: string; language: string; duration: number };

      const elapsed = Date.now() - startTime;
      const text = result.text?.trim();

      if (text) {
        logger.info(MOD, `VAD → STT complete (${elapsed}ms): "${text.slice(0, 50)}..."`);
        // 转发给 OpenClaw
        await this.forwardSTTToOpenClaw(text);
      } else {
        logger.info(MOD, `VAD → STT complete (${elapsed}ms): empty result`);
      }
    } catch (err) {
      logger.error(MOD, 'VAD → STT transcribe failed', err);
    }
  }

  private async forwardSTTToOpenClaw(text: string): Promise<void> {
    const oc = this.openclawConfig;
    if (!oc?.webhookUrl || !text.trim()) return;

    try {
      const body: Record<string, unknown> = {
        text,
      };
      if (oc.sessionKey) body['sessionKey'] = oc.sessionKey;

      const res = await fetch(`${oc.webhookUrl}/plugins/clawbody/inbound`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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

  private broadcastWS(msg: unknown): void {
    const data = JSON.stringify(msg);
    for (const ws of this.wsClients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    }
  }

  private broadcastSSE(data: unknown, event?: string): void {
    const msg = (event ? `event: ${event}\n` : '') + `data: ${JSON.stringify(data)}\n\n`;
    for (const client of this.sseClients) {
      client.write(msg);
    }
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.httpServer.listen(this.config.port, this.config.host ?? '0.0.0.0', () => {
        logger.info(MOD, `HTTP server listening on ${this.config.host ?? '0.0.0.0'}:${this.config.port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    // 取消订阅
    for (const unsubscribe of this.unsubscribes) {
      unsubscribe();
    }
    this.unsubscribes = [];

    // 关闭 WebSocket 连接
    for (const ws of this.wsClients) {
      ws.close();
    }
    this.wsClients.clear();

    // 关闭 SSE 连接
    for (const res of this.sseClients) {
      res.end();
    }
    this.sseClients.clear();

    // 关闭 HTTP 服务器
    return new Promise((resolve) => {
      this.httpServer.close(() => {
        logger.info(MOD, 'HTTP server stopped');
        resolve();
      });
    });
  }

  get wsClientCount(): number {
    return this.wsClients.size;
  }

  get sseClientCount(): number {
    return this.sseClients.size;
  }
}
