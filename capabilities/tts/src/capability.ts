import type {
  ICapability,
  CapabilityMeta,
  CapabilityStatus,
  CapabilityHealth,
  OperationDescriptor,
  ExecutionContext,
} from '@clawbody/core';
import { logger } from '@clawbody/core';
import type { ITTSProvider, Voice, SynthesisOptions, SynthesisResult } from './providers/interface.js';

export interface TTSConfig {
  defaultProvider: string;
  providers: Record<string, ProviderConfig>;
}

export interface ProviderConfig {
  type: string;
  [key: string]: unknown;
}

export interface SpeakInput {
  text: string;
  voice?: string;
  provider?: string;
  speed?: number;
}

export interface SpeakOutput {
  duration: number;
  provider: string;
}

export interface SynthesizeInput {
  text: string;
  voice?: string;
  provider?: string;
  format?: 'wav' | 'mp3' | 'opus';
}

export interface SynthesizeOutput {
  audio: string; // base64
  format: string;
  sampleRate: number;
  duration: number;
}

export interface ListVoicesInput {
  provider?: string;
}

/**
 * TTS 能力 - 支持多提供商的语音合成
 */
export class TTSCapability implements ICapability<TTSConfig> {
  readonly meta: CapabilityMeta = {
    id: 'tts',
    name: 'Text-to-Speech',
    version: '1.0.0',
    type: 'output',
    description: '语音合成能力，支持多种 TTS 提供商',
  };

  private _status: CapabilityStatus = 'initializing';
  private providers = new Map<string, ITTSProvider>();
  private defaultProvider = 'edge';
  private providerFactories: Map<string, (config: ProviderConfig) => ITTSProvider>;

  constructor(factories: Map<string, (config: ProviderConfig) => ITTSProvider>) {
    this.providerFactories = factories;
  }

  get status(): CapabilityStatus {
    return this._status;
  }

  async initialize(config: TTSConfig): Promise<void> {
    this.defaultProvider = config.defaultProvider;

    for (const [name, providerConfig] of Object.entries(config.providers)) {
      const factory = this.providerFactories.get(providerConfig.type);
      if (!factory) {
        logger.warn('tts', `Unknown provider type: ${providerConfig.type}`);
        continue;
      }

      try {
        const provider = factory(providerConfig);
        const available = await provider.isAvailable();
        if (available) {
          this.providers.set(name, provider);
          logger.info('tts', `Provider registered: ${provider.name}`, { id: name });
        } else {
          logger.warn('tts', `Provider not available: ${provider.name}`, { id: name });
        }
      } catch (err) {
        logger.error('tts', `Failed to create provider: ${name}`, err);
      }
    }

    this._status = this.providers.size > 0 ? 'ready' : 'unavailable';

    if (this._status === 'ready') {
      logger.info('tts', `TTS capability ready with ${this.providers.size} provider(s)`);
    } else {
      logger.warn('tts', 'No TTS providers available');
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
      },
    };
  }

  getOperations(): OperationDescriptor[] {
    return [
      {
        name: 'speak',
        description: '将文本转换为语音并播放',
        inputSchema: {
          type: 'object',
          properties: {
            text: { type: 'string', description: '要合成的文本' },
            voice: { type: 'string', description: '声音名称' },
            provider: { type: 'string', description: 'TTS 提供商' },
            speed: { type: 'number', minimum: 0.5, maximum: 2.0 },
          },
          required: ['text'],
        },
        outputSchema: {
          type: 'object',
          properties: {
            duration: { type: 'number', description: '音频时长(秒)' },
            provider: { type: 'string' },
          },
        },
        streaming: false,
      },
      {
        name: 'synthesize',
        description: '合成语音但不播放，返回音频数据',
        inputSchema: {
          type: 'object',
          properties: {
            text: { type: 'string', description: '要合成的文本' },
            voice: { type: 'string', description: '声音名称' },
            provider: { type: 'string', description: 'TTS 提供商' },
            format: { type: 'string', enum: ['wav', 'mp3', 'opus'] },
          },
          required: ['text'],
        },
        outputSchema: {
          type: 'object',
          properties: {
            audio: { type: 'string', description: 'Base64 编码的音频' },
            format: { type: 'string' },
            sampleRate: { type: 'number' },
            duration: { type: 'number' },
          },
        },
        streaming: false,
      },
      {
        name: 'synthesizeStream',
        description: '流式合成语音，返回 PCM 音频流',
        inputSchema: {
          type: 'object',
          properties: {
            text: { type: 'string', description: '要合成的文本' },
            voice: { type: 'string', description: '声音名称' },
            provider: { type: 'string', description: 'TTS 提供商' },
          },
          required: ['text'],
        },
        outputSchema: {
          type: 'object',
          properties: {
            chunk: { type: 'string', description: 'Base64 编码的 PCM 音频块' },
          },
        },
        streaming: true,
      },
      {
        name: 'listVoices',
        description: '列出可用的声音',
        inputSchema: {
          type: 'object',
          properties: {
            provider: { type: 'string', description: 'TTS 提供商' },
          },
        },
        outputSchema: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              language: { type: 'string' },
              gender: { type: 'string' },
            },
          },
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
      case 'speak':
        return this.speak(input as SpeakInput) as Promise<TOutput>;
      case 'synthesize':
        return this.synthesize(input as SynthesizeInput) as Promise<TOutput>;
      case 'listVoices':
        return this.listVoices(input as ListVoicesInput) as Promise<TOutput>;
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
      case 'synthesizeStream':
        yield* this.synthesizeStream(input as SynthesizeInput);
        break;
      default:
        throw new Error(`Unknown streaming operation: ${operation}`);
    }
  }

  async shutdown(): Promise<void> {
    this.providers.clear();
    this._status = 'unavailable';
  }

  // === Private methods ===

  private getProvider(providerId?: string): ITTSProvider {
    const id = providerId ?? this.defaultProvider;
    const provider = this.providers.get(id);

    if (!provider) {
      // Try fallback to any available provider
      const firstProvider = this.providers.values().next().value;
      if (firstProvider) {
        logger.warn('tts', `Provider ${id} not found, using fallback`);
        return firstProvider;
      }
      throw new Error(`No TTS provider available`);
    }

    return provider;
  }

  private async speak(input: SpeakInput): Promise<SpeakOutput> {
    const provider = this.getProvider(input.provider);
    const result = await provider.synthesize({
      text: input.text,
      voice: input.voice,
      speed: input.speed,
    });

    // Note: Actual audio playback would be handled by the system
    // This just returns the synthesis result

    return {
      duration: result.duration,
      provider: provider.id,
    };
  }

  private async synthesize(input: SynthesizeInput): Promise<SynthesizeOutput> {
    const provider = this.getProvider(input.provider);
    const result = await provider.synthesize({
      text: input.text,
      voice: input.voice,
      format: input.format,
    });

    return {
      audio: result.audio.toString('base64'),
      format: result.format,
      sampleRate: result.sampleRate,
      duration: result.duration,
    };
  }

  private async listVoices(input: ListVoicesInput): Promise<Voice[]> {
    if (input.provider) {
      const provider = this.getProvider(input.provider);
      return provider.listVoices();
    }

    // Return voices from all providers
    const allVoices: Voice[] = [];
    for (const provider of this.providers.values()) {
      const voices = await provider.listVoices();
      allVoices.push(...voices);
    }
    return allVoices;
  }

  private async *synthesizeStream(input: SynthesizeInput): AsyncIterable<Buffer> {
    const provider = this.getProvider(input.provider);

    if (!provider.synthesizeStream) {
      throw new Error(`Provider ${provider.id} does not support streaming`);
    }

    yield* provider.synthesizeStream({
      text: input.text,
      voice: input.voice,
    });
  }
}
