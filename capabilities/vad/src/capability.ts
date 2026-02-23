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
import type { IVADProvider, VADConfig, VADEvent } from './providers/interface.js';

export interface VADCapabilityConfig {
  defaultProvider: string;
  providers: Record<string, ProviderConfig>;
  detection?: DetectionConfig;
  integration?: IntegrationConfig;
}

export interface ProviderConfig {
  type: string;
  [key: string]: unknown;
}

export interface DetectionConfig {
  threshold?: number;
  minSpeechDurationMs?: number;
  minSilenceDurationMs?: number;
  speechPadMs?: number;
}

export interface IntegrationConfig {
  autoTriggerSTT?: boolean;
  sttProvider?: string;
}

// === Input/Output Types ===

export interface ProcessChunkInput {
  audio: string; // base64 encoded PCM audio
  provider?: string;
}

export interface ProcessChunkOutput {
  event: 'speech_start' | 'speech_end' | null;
  timestamp: number;
  audioBuffer?: string; // base64 encoded (on speech_end)
}

export interface ResetInput {
  provider?: string;
}

export interface ResetOutput {
  success: boolean;
}

export interface GetConfigInput {
  provider?: string;
}

export interface UpdateConfigInput {
  provider?: string;
  threshold?: number;
  minSpeechDurationMs?: number;
  minSilenceDurationMs?: number;
  speechPadMs?: number;
}

/**
 * VAD 能力 - 语音活动检测
 */
export class VADCapability implements ICapability<VADCapabilityConfig> {
  readonly meta: CapabilityMeta = {
    id: 'vad',
    name: 'Voice Activity Detection',
    version: '1.0.0',
    type: 'input',
    description: '语音活动检测能力，支持检测说话开始和结束',
  };

  private _status: CapabilityStatus = 'initializing';
  private providers = new Map<string, IVADProvider>();
  private defaultProvider = 'silero';
  private providerFactories: Map<string, (config: ProviderConfig) => IVADProvider>;
  private eventHandlers = new Set<EventHandler>();
  private integrationConfig: IntegrationConfig = {
    autoTriggerSTT: true,
    sttProvider: 'qwen',
  };

  constructor(factories: Map<string, (config: ProviderConfig) => IVADProvider>) {
    this.providerFactories = factories;
  }

  get status(): CapabilityStatus {
    return this._status;
  }

  async initialize(config: VADCapabilityConfig): Promise<void> {
    this.defaultProvider = config.defaultProvider;

    if (config.integration) {
      this.integrationConfig = { ...this.integrationConfig, ...config.integration };
    }

    for (const [name, providerConfig] of Object.entries(config.providers)) {
      const factory = this.providerFactories.get(providerConfig.type);
      if (!factory) {
        logger.warn('vad', `Unknown provider type: ${providerConfig.type}`);
        continue;
      }

      try {
        const provider = factory(providerConfig);
        this.providers.set(name, provider);

        const available = await provider.isAvailable();
        if (available) {
          logger.info('vad', `Provider registered and ready: ${provider.name}`, { id: name });

          // Apply detection config if provided
          if (config.detection) {
            await provider.updateConfig(config.detection);
          }
        } else {
          logger.warn('vad', `Provider registered but not yet available: ${provider.name}`, {
            id: name,
          });
        }
      } catch (err) {
        logger.error('vad', `Failed to create provider: ${name}`, err);
      }
    }

    this._status = this.providers.size > 0 ? 'ready' : 'unavailable';

    if (this._status === 'ready') {
      logger.info('vad', `VAD capability ready with ${this.providers.size} provider(s)`);
    } else {
      logger.warn('vad', 'No VAD providers available');
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
        autoTriggerSTT: this.integrationConfig.autoTriggerSTT,
      },
    };
  }

  getOperations(): OperationDescriptor[] {
    return [
      {
        name: 'processChunk',
        description: '处理音频块，检测语音活动',
        inputSchema: {
          type: 'object',
          properties: {
            audio: { type: 'string', description: 'Base64 编码的 PCM 音频 (16-bit, 16kHz, mono)' },
            provider: { type: 'string', description: 'VAD 提供商' },
          },
          required: ['audio'],
        },
        outputSchema: {
          type: 'object',
          properties: {
            event: { type: 'string', description: 'speech_start, speech_end 或 null' },
            timestamp: { type: 'number', description: '事件时间戳' },
            audioBuffer: { type: 'string', description: 'Base64 编码的完整语音 (speech_end 时)' },
          },
        },
        streaming: false,
      },
      {
        name: 'reset',
        description: '重置 VAD 检测器状态',
        inputSchema: {
          type: 'object',
          properties: {
            provider: { type: 'string', description: 'VAD 提供商' },
          },
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
        name: 'getConfig',
        description: '获取 VAD 配置',
        inputSchema: {
          type: 'object',
          properties: {
            provider: { type: 'string', description: 'VAD 提供商' },
          },
        },
        outputSchema: {
          type: 'object',
          properties: {
            threshold: { type: 'number' },
            minSpeechDurationMs: { type: 'number' },
            minSilenceDurationMs: { type: 'number' },
            speechPadMs: { type: 'number' },
            sampleRate: { type: 'number' },
          },
        },
        streaming: false,
      },
      {
        name: 'updateConfig',
        description: '更新 VAD 配置',
        inputSchema: {
          type: 'object',
          properties: {
            provider: { type: 'string', description: 'VAD 提供商' },
            threshold: { type: 'number', description: '语音检测阈值 (0-1)' },
            minSpeechDurationMs: { type: 'number', description: '最小语音时长 (ms)' },
            minSilenceDurationMs: { type: 'number', description: '最小静音时长 (ms)' },
            speechPadMs: { type: 'number', description: '语音前后填充 (ms)' },
          },
        },
        outputSchema: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
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
      case 'processChunk':
        return this.processChunk(input as ProcessChunkInput) as Promise<TOutput>;
      case 'reset':
        return this.reset(input as ResetInput) as Promise<TOutput>;
      case 'getConfig':
        return this.getConfig(input as GetConfigInput) as Promise<TOutput>;
      case 'updateConfig':
        return this.updateConfig(input as UpdateConfigInput) as Promise<TOutput>;
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  }

  /**
   * 订阅 VAD 事件 (speech_start, speech_end)
   */
  subscribe(handler: EventHandler): Unsubscribe {
    this.eventHandlers.add(handler);
    return () => {
      this.eventHandlers.delete(handler);
    };
  }

  async shutdown(): Promise<void> {
    // Reset all providers
    for (const provider of this.providers.values()) {
      try {
        await provider.reset();
      } catch {
        // Ignore errors during shutdown
      }
    }
    this.providers.clear();
    this.eventHandlers.clear();
    this._status = 'unavailable';
  }

  // === Private methods ===

  private getProvider(providerId?: string): IVADProvider {
    const id = providerId ?? this.defaultProvider;
    const provider = this.providers.get(id);

    if (!provider) {
      const firstProvider = this.providers.values().next().value;
      if (firstProvider) {
        logger.warn('vad', `Provider ${id} not found, using fallback`);
        return firstProvider;
      }
      throw new Error(`No VAD provider available`);
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
        logger.error('vad', 'Event handler error', err);
      }
    }
  }

  private async processChunk(input: ProcessChunkInput): Promise<ProcessChunkOutput> {
    const provider = this.getProvider(input.provider);
    const audioBuffer = Buffer.from(input.audio, 'base64');

    const vadEvent = await provider.processChunk(audioBuffer);

    if (!vadEvent) {
      return {
        event: null,
        timestamp: Date.now() / 1000,
      };
    }

    // Emit event to subscribers
    this.emitEvent(vadEvent.type, {
      timestamp: vadEvent.timestamp,
      hasAudio: !!vadEvent.audioBuffer,
    });

    const output: ProcessChunkOutput = {
      event: vadEvent.type === 'speech_segment' ? null : vadEvent.type,
      timestamp: vadEvent.timestamp,
    };

    if (vadEvent.type === 'speech_end' && vadEvent.audioBuffer) {
      output.audioBuffer = vadEvent.audioBuffer.toString('base64');

      // Emit speech_end with audio for STT integration
      this.emitEvent('speech_end_with_audio', {
        timestamp: vadEvent.timestamp,
        audioBuffer: output.audioBuffer,
        autoTriggerSTT: this.integrationConfig.autoTriggerSTT,
        sttProvider: this.integrationConfig.sttProvider,
      });
    }

    return output;
  }

  private async reset(input: ResetInput): Promise<ResetOutput> {
    const provider = this.getProvider(input.provider);
    await provider.reset();
    return { success: true };
  }

  private async getConfig(input: GetConfigInput): Promise<VADConfig> {
    const provider = this.getProvider(input.provider);
    return provider.getConfig();
  }

  private async updateConfig(input: UpdateConfigInput): Promise<{ success: boolean }> {
    const provider = this.getProvider(input.provider);

    const config: Partial<VADConfig> = {};
    if (input.threshold !== undefined) config.threshold = input.threshold;
    if (input.minSpeechDurationMs !== undefined)
      config.minSpeechDurationMs = input.minSpeechDurationMs;
    if (input.minSilenceDurationMs !== undefined)
      config.minSilenceDurationMs = input.minSilenceDurationMs;
    if (input.speechPadMs !== undefined) config.speechPadMs = input.speechPadMs;

    await provider.updateConfig(config);
    return { success: true };
  }
}
