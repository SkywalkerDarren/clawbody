import type {
  ICapability,
  CapabilityMeta,
  CapabilityStatus,
  CapabilityHealth,
  OperationDescriptor,
  ExecutionContext,
  EventHandler,
  Unsubscribe,
} from '@clawbody/core';
import { logger } from '@clawbody/core';
import type {
  ISTTProvider,
  TranscriptionOptions,
  TranscriptionResult,
  TranscriptSegment,
  StreamingSession,
  SupportedLanguage,
} from './providers/interface.js';

export interface STTConfig {
  defaultProvider: string;
  providers: Record<string, ProviderConfig>;
  streaming?: StreamingConfig;
}

export interface ProviderConfig {
  type: string;
  [key: string]: unknown;
}

export interface StreamingConfig {
  chunkDurationMs?: number;
  sessionTimeoutSec?: number;
  silenceTimeoutSec?: number;
  maxConcurrentSessions?: number;
}

// === Input/Output Types ===

export interface TranscribeInput {
  audio: string; // base64 encoded
  language?: SupportedLanguage;
  provider?: string;
  enableTimestamps?: boolean;
}

export interface TranscribeOutput {
  text: string;
  segments: TranscriptSegment[];
  language: string;
  duration: number;
}

export interface StartSessionInput {
  language?: SupportedLanguage;
  provider?: string;
}

export interface StartSessionOutput {
  sessionId: string;
  state: string;
}

export interface SendChunkInput {
  sessionId: string;
  audio: string; // base64 encoded chunk
}

export interface SendChunkOutput {
  text: string | null;
  isFinal: boolean;
  confidence?: number;
}

export interface EndSessionInput {
  sessionId: string;
}

export interface ListLanguagesInput {
  provider?: string;
}

/**
 * STT 能力 - 支持多提供商的语音识别
 */
export class STTCapability implements ICapability<STTConfig> {
  readonly meta: CapabilityMeta = {
    id: 'stt',
    name: 'Speech-to-Text',
    version: '1.0.0',
    type: 'input',
    description: '语音识别能力，支持流式和批量转录',
  };

  private _status: CapabilityStatus = 'initializing';
  private providers = new Map<string, ISTTProvider>();
  private defaultProvider = 'qwen';
  private providerFactories: Map<string, (config: ProviderConfig) => ISTTProvider>;
  private eventHandlers = new Set<EventHandler>();
  private activeSessions = new Map<string, { provider: ISTTProvider; session: StreamingSession }>();
  private streamingConfig: StreamingConfig = {
    chunkDurationMs: 100,
    sessionTimeoutSec: 30,
    silenceTimeoutSec: 5,
    maxConcurrentSessions: 10,
  };

  constructor(factories: Map<string, (config: ProviderConfig) => ISTTProvider>) {
    this.providerFactories = factories;
  }

  get status(): CapabilityStatus {
    return this._status;
  }

  async initialize(config: STTConfig): Promise<void> {
    this.defaultProvider = config.defaultProvider;

    if (config.streaming) {
      this.streamingConfig = { ...this.streamingConfig, ...config.streaming };
    }

    for (const [name, providerConfig] of Object.entries(config.providers)) {
      const factory = this.providerFactories.get(providerConfig.type);
      if (!factory) {
        logger.warn('stt', `Unknown provider type: ${providerConfig.type}`);
        continue;
      }

      try {
        const provider = factory(providerConfig);
        this.providers.set(name, provider);

        const available = await provider.isAvailable();
        if (available) {
          logger.info('stt', `Provider registered and ready: ${provider.name}`, { id: name });
        } else {
          logger.warn('stt', `Provider registered but not yet available: ${provider.name}`, { id: name });
        }
      } catch (err) {
        logger.error('stt', `Failed to create provider: ${name}`, err);
      }
    }

    this._status = this.providers.size > 0 ? 'ready' : 'unavailable';

    if (this._status === 'ready') {
      logger.info('stt', `STT capability ready with ${this.providers.size} provider(s)`);
    } else {
      logger.warn('stt', 'No STT providers available');
    }
  }

  async healthCheck(): Promise<CapabilityHealth> {
    const availableProviders: string[] = [];

    for (const [id, provider] of this.providers) {
      try {
        if (await provider.isAvailable()) {
          availableProviders.push(id);
        }
      } catch {
        // Provider check failed
      }
    }

    const status: CapabilityStatus = availableProviders.length > 0 ? 'ready' : 'unavailable';

    return {
      status,
      message: `${availableProviders.length} provider(s) available`,
      lastCheck: new Date(),
      details: {
        providers: availableProviders.join(', '),
        default: this.defaultProvider,
        activeSessions: this.activeSessions.size,
      },
    };
  }

  getOperations(): OperationDescriptor[] {
    return [
      {
        name: 'transcribe',
        description: '批量转录完整音频',
        inputSchema: {
          type: 'object',
          properties: {
            audio: { type: 'string', description: 'Base64 编码的音频数据' },
            language: { type: 'string', description: '语言代码 (auto, zh, en, ja, ko)' },
            provider: { type: 'string', description: 'STT 提供商' },
            enableTimestamps: { type: 'boolean', description: '是否返回时间戳' },
          },
          required: ['audio'],
        },
        outputSchema: {
          type: 'object',
          properties: {
            text: { type: 'string', description: '识别出的文本' },
            segments: { type: 'array', description: '分段结果' },
            language: { type: 'string', description: '检测到的语言' },
            duration: { type: 'number', description: '音频时长(秒)' },
          },
        },
        streaming: false,
      },
      {
        name: 'startSession',
        description: '创建流式转录会话',
        inputSchema: {
          type: 'object',
          properties: {
            language: { type: 'string', description: '语言代码' },
            provider: { type: 'string', description: 'STT 提供商' },
          },
        },
        outputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string' },
            state: { type: 'string' },
          },
        },
        streaming: false,
      },
      {
        name: 'sendChunk',
        description: '发送音频块到流式会话',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: '会话 ID' },
            audio: { type: 'string', description: 'Base64 编码的音频块' },
          },
          required: ['sessionId', 'audio'],
        },
        outputSchema: {
          type: 'object',
          properties: {
            text: { type: 'string', description: '部分识别结果' },
            isFinal: { type: 'boolean' },
            confidence: { type: 'number' },
          },
        },
        streaming: false,
      },
      {
        name: 'endSession',
        description: '结束流式会话，获取最终结果',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: '会话 ID' },
          },
          required: ['sessionId'],
        },
        outputSchema: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            segments: { type: 'array' },
            language: { type: 'string' },
            duration: { type: 'number' },
          },
        },
        streaming: false,
      },
      {
        name: 'cancelSession',
        description: '取消流式会话',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: '会话 ID' },
          },
          required: ['sessionId'],
        },
        outputSchema: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
          },
        },
        streaming: false,
      },
      {
        name: 'listLanguages',
        description: '列出支持的语言',
        inputSchema: {
          type: 'object',
          properties: {
            provider: { type: 'string', description: 'STT 提供商' },
          },
        },
        outputSchema: {
          type: 'array',
          items: { type: 'string' },
        },
        streaming: false,
      },
    ];
  }

  async execute<TInput, TOutput>(
    operation: string,
    input: TInput,
    _context?: ExecutionContext
  ): Promise<TOutput> {
    switch (operation) {
      case 'transcribe':
        return this.transcribe(input as TranscribeInput) as Promise<TOutput>;
      case 'startSession':
        return this.startSession(input as StartSessionInput) as Promise<TOutput>;
      case 'sendChunk':
        return this.sendChunk(input as SendChunkInput) as Promise<TOutput>;
      case 'endSession':
        return this.endSession(input as EndSessionInput) as Promise<TOutput>;
      case 'cancelSession':
        return this.cancelSession(input as EndSessionInput) as Promise<TOutput>;
      case 'listLanguages':
        return this.listLanguages(input as ListLanguagesInput) as Promise<TOutput>;
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  }

  async *executeStream<TInput>(
    operation: string,
    input: TInput,
    _context?: ExecutionContext
  ): AsyncIterable<Buffer> {
    switch (operation) {
      case 'transcribeStream':
        yield* this.transcribeStream(input as TranscribeInput);
        break;
      default:
        throw new Error(`Unknown streaming operation: ${operation}`);
    }
  }

  /**
   * 订阅转录事件 (输入型能力特有)
   */
  subscribe(handler: EventHandler): Unsubscribe {
    this.eventHandlers.add(handler);
    return () => {
      this.eventHandlers.delete(handler);
    };
  }

  async shutdown(): Promise<void> {
    // Cancel all active sessions
    for (const [sessionId, { provider }] of this.activeSessions) {
      try {
        await provider.cancelStreamingSession(sessionId);
      } catch {
        // Ignore errors during shutdown
      }
    }
    this.activeSessions.clear();
    this.providers.clear();
    this.eventHandlers.clear();
    this._status = 'unavailable';
  }

  // === Private methods ===

  private getProvider(providerId?: string): ISTTProvider {
    const id = providerId ?? this.defaultProvider;
    const provider = this.providers.get(id);

    if (!provider) {
      const firstProvider = this.providers.values().next().value;
      if (firstProvider) {
        logger.warn('stt', `Provider ${id} not found, using fallback`);
        return firstProvider;
      }
      throw new Error(`No STT provider available`);
    }

    return provider;
  }

  private emitEvent(eventType: string, data: unknown): void {
    const event = {
      capabilityId: this.meta.id,
      eventType,
      data,
      timestamp: new Date(),
    };
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (err) {
        logger.error('stt', 'Event handler error', err);
      }
    }
  }

  private async transcribe(input: TranscribeInput): Promise<TranscribeOutput> {
    const provider = this.getProvider(input.provider);
    const audioBuffer = Buffer.from(input.audio, 'base64');

    const result = await provider.transcribe(audioBuffer, {
      language: input.language,
      enableTimestamps: input.enableTimestamps,
    });

    this.emitEvent('transcription', {
      text: result.text,
      language: result.language,
      duration: result.duration,
    });

    return {
      text: result.text,
      segments: result.segments,
      language: result.language,
      duration: result.duration,
    };
  }

  private async startSession(input: StartSessionInput): Promise<StartSessionOutput> {
    if (this.activeSessions.size >= (this.streamingConfig.maxConcurrentSessions ?? 10)) {
      throw new Error('Maximum concurrent sessions reached');
    }

    const provider = this.getProvider(input.provider);
    const session = await provider.createStreamingSession({
      language: input.language,
    });

    this.activeSessions.set(session.sessionId, { provider, session });

    this.emitEvent('sessionStarted', {
      sessionId: session.sessionId,
      state: session.state,
    });

    return {
      sessionId: session.sessionId,
      state: session.state,
    };
  }

  private async sendChunk(input: SendChunkInput): Promise<SendChunkOutput> {
    const sessionData = this.activeSessions.get(input.sessionId);
    if (!sessionData) {
      throw new Error(`Session not found: ${input.sessionId}`);
    }

    const { provider } = sessionData;
    const audioBuffer = Buffer.from(input.audio, 'base64');

    const segment = await provider.sendAudioChunk(input.sessionId, audioBuffer);

    if (segment) {
      this.emitEvent('partialTranscript', {
        sessionId: input.sessionId,
        text: segment.text,
        isFinal: segment.isFinal,
        confidence: segment.confidence,
      });

      return {
        text: segment.text,
        isFinal: segment.isFinal,
        confidence: segment.confidence,
      };
    }

    return {
      text: null,
      isFinal: false,
    };
  }

  private async endSession(input: EndSessionInput): Promise<TranscribeOutput> {
    const sessionData = this.activeSessions.get(input.sessionId);
    if (!sessionData) {
      throw new Error(`Session not found: ${input.sessionId}`);
    }

    const { provider } = sessionData;
    const result = await provider.endStreamingSession(input.sessionId);

    this.activeSessions.delete(input.sessionId);

    this.emitEvent('sessionEnded', {
      sessionId: input.sessionId,
      text: result.text,
      duration: result.duration,
    });

    return {
      text: result.text,
      segments: result.segments,
      language: result.language,
      duration: result.duration,
    };
  }

  private async cancelSession(input: EndSessionInput): Promise<{ success: boolean }> {
    const sessionData = this.activeSessions.get(input.sessionId);
    if (!sessionData) {
      throw new Error(`Session not found: ${input.sessionId}`);
    }

    const { provider } = sessionData;
    await provider.cancelStreamingSession(input.sessionId);

    this.activeSessions.delete(input.sessionId);

    this.emitEvent('sessionCancelled', {
      sessionId: input.sessionId,
    });

    return { success: true };
  }

  private async listLanguages(input: ListLanguagesInput): Promise<SupportedLanguage[]> {
    if (input.provider) {
      const provider = this.getProvider(input.provider);
      return provider.supportedLanguages;
    }

    // Return union of all provider languages
    const allLanguages = new Set<SupportedLanguage>();
    for (const provider of this.providers.values()) {
      for (const lang of provider.supportedLanguages) {
        allLanguages.add(lang);
      }
    }
    return Array.from(allLanguages);
  }

  private async *transcribeStream(input: TranscribeInput): AsyncIterable<Buffer> {
    const provider = this.getProvider(input.provider);
    const audioBuffer = Buffer.from(input.audio, 'base64');

    // Create a simple async iterable from the buffer
    async function* audioChunks(): AsyncIterable<Buffer> {
      const chunkSize = 3200; // 100ms @ 16kHz, 16-bit
      for (let i = 0; i < audioBuffer.length; i += chunkSize) {
        yield audioBuffer.subarray(i, i + chunkSize);
      }
    }

    for await (const segment of provider.transcribeStream(audioChunks(), {
      language: input.language,
    })) {
      this.emitEvent('streamingTranscript', segment);
      yield Buffer.from(JSON.stringify(segment));
    }
  }
}
