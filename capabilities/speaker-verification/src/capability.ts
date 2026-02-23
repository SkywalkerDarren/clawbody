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
  ISpeakerVerificationProvider,
  SVConfig,
  Speaker,
  VerificationResult,
  EnrollmentResult,
} from './providers/interface.js';

export interface SVCapabilityConfig {
  defaultProvider: string;
  providers: Record<string, ProviderConfig>;
  verification?: VerificationConfig;
  integration?: IntegrationConfig;
}

export interface ProviderConfig {
  type: string;
  [key: string]: unknown;
}

export interface VerificationConfig {
  threshold?: number;
  applyVAD?: boolean;
}

export interface IntegrationConfig {
  enabled?: boolean;
  rejectUnknown?: boolean;
}

// === Input/Output Types ===

export interface EnrollInput {
  speakerId: string;
  speakerName: string;
  audio: string; // base64 encoded PCM audio
  provider?: string;
}

export interface EnrollOutput extends EnrollmentResult {}

export interface VerifyInput {
  audio: string; // base64 encoded PCM audio
  provider?: string;
}

export interface VerifyOutput extends VerificationResult {}

export interface ListSpeakersInput {
  provider?: string;
}

export interface ListSpeakersOutput {
  speakers: Speaker[];
}

export interface DeleteSpeakerInput {
  speakerId: string;
  provider?: string;
}

export interface DeleteSpeakerOutput {
  success: boolean;
}

export interface GetConfigInput {
  provider?: string;
}

export interface UpdateConfigInput {
  provider?: string;
  threshold?: number;
  applyVAD?: boolean;
}

/**
 * Speaker Verification Capability
 */
export class SpeakerVerificationCapability implements ICapability<SVCapabilityConfig> {
  readonly meta: CapabilityMeta = {
    id: 'speaker-verification',
    name: 'Speaker Verification',
    version: '1.0.0',
    type: 'input',
    description: '声纹验证能力，支持说话人注册和身份验证',
  };

  private _status: CapabilityStatus = 'initializing';
  private providers = new Map<string, ISpeakerVerificationProvider>();
  private defaultProvider = 'wespeaker';
  private providerFactories: Map<string, (config: ProviderConfig) => ISpeakerVerificationProvider>;
  private eventHandlers = new Set<EventHandler>();
  private integrationConfig: IntegrationConfig = {
    enabled: true,
    rejectUnknown: true,
  };

  constructor(
    factories: Map<string, (config: ProviderConfig) => ISpeakerVerificationProvider>
  ) {
    this.providerFactories = factories;
  }

  get status(): CapabilityStatus {
    return this._status;
  }

  async initialize(config: SVCapabilityConfig): Promise<void> {
    this.defaultProvider = config.defaultProvider;

    if (config.integration) {
      this.integrationConfig = { ...this.integrationConfig, ...config.integration };
    }

    for (const [name, providerConfig] of Object.entries(config.providers)) {
      const factory = this.providerFactories.get(providerConfig.type);
      if (!factory) {
        logger.warn('sv', `Unknown provider type: ${providerConfig.type}`);
        continue;
      }

      try {
        const provider = factory(providerConfig);
        this.providers.set(name, provider);

        const available = await provider.isAvailable();
        if (available) {
          logger.info('sv', `Provider registered and ready: ${provider.name}`, { id: name });

          // Apply verification config if provided
          if (config.verification) {
            await provider.updateConfig(config.verification);
          }
        } else {
          logger.warn('sv', `Provider registered but not yet available: ${provider.name}`, {
            id: name,
          });
        }
      } catch (err) {
        logger.error('sv', `Failed to create provider: ${name}`, err);
      }
    }

    this._status = this.providers.size > 0 ? 'ready' : 'unavailable';

    if (this._status === 'ready') {
      logger.info('sv', `Speaker Verification capability ready with ${this.providers.size} provider(s)`);
    } else {
      logger.warn('sv', 'No Speaker Verification providers available');
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
        integrationEnabled: this.integrationConfig.enabled,
        rejectUnknown: this.integrationConfig.rejectUnknown,
      },
    };
  }

  getOperations(): OperationDescriptor[] {
    return [
      {
        name: 'enroll',
        description: '注册说话人声纹',
        inputSchema: {
          type: 'object',
          properties: {
            speakerId: { type: 'string', description: '说话人唯一标识' },
            speakerName: { type: 'string', description: '说话人显示名称' },
            audio: { type: 'string', description: 'Base64 编码的 PCM 音频 (16-bit, 16kHz, mono)' },
            provider: { type: 'string', description: 'SV 提供商' },
          },
          required: ['speakerId', 'speakerName', 'audio'],
        },
        outputSchema: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            speakerId: { type: 'string' },
            speakerName: { type: 'string' },
            embeddingCount: { type: 'number' },
            message: { type: 'string' },
          },
        },
        streaming: false,
      },
      {
        name: 'verify',
        description: '验证说话人身份',
        inputSchema: {
          type: 'object',
          properties: {
            audio: { type: 'string', description: 'Base64 编码的 PCM 音频 (16-bit, 16kHz, mono)' },
            provider: { type: 'string', description: 'SV 提供商' },
          },
          required: ['audio'],
        },
        outputSchema: {
          type: 'object',
          properties: {
            verified: { type: 'boolean' },
            speakerId: { type: 'string' },
            speakerName: { type: 'string' },
            confidence: { type: 'number' },
            threshold: { type: 'number' },
          },
        },
        streaming: false,
      },
      {
        name: 'listSpeakers',
        description: '列出所有已注册的说话人',
        inputSchema: {
          type: 'object',
          properties: {
            provider: { type: 'string', description: 'SV 提供商' },
          },
        },
        outputSchema: {
          type: 'object',
          properties: {
            speakers: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  enrolledAt: { type: 'string' },
                  embeddingCount: { type: 'number' },
                },
              },
            },
          },
        },
        streaming: false,
      },
      {
        name: 'deleteSpeaker',
        description: '删除说话人',
        inputSchema: {
          type: 'object',
          properties: {
            speakerId: { type: 'string', description: '说话人唯一标识' },
            provider: { type: 'string', description: 'SV 提供商' },
          },
          required: ['speakerId'],
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
        description: '获取 SV 配置',
        inputSchema: {
          type: 'object',
          properties: {
            provider: { type: 'string', description: 'SV 提供商' },
          },
        },
        outputSchema: {
          type: 'object',
          properties: {
            model: { type: 'string' },
            threshold: { type: 'number' },
            device: { type: 'string' },
            applyVAD: { type: 'boolean' },
          },
        },
        streaming: false,
      },
      {
        name: 'updateConfig',
        description: '更新 SV 配置',
        inputSchema: {
          type: 'object',
          properties: {
            provider: { type: 'string', description: 'SV 提供商' },
            threshold: { type: 'number', description: '验证阈值 (0-1)' },
            applyVAD: { type: 'boolean', description: '是否应用 VAD' },
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
      case 'enroll':
        return this.enroll(input as EnrollInput) as Promise<TOutput>;
      case 'verify':
        return this.verify(input as VerifyInput) as Promise<TOutput>;
      case 'listSpeakers':
        return this.listSpeakers(input as ListSpeakersInput) as Promise<TOutput>;
      case 'deleteSpeaker':
        return this.deleteSpeaker(input as DeleteSpeakerInput) as Promise<TOutput>;
      case 'getConfig':
        return this.getConfig(input as GetConfigInput) as Promise<TOutput>;
      case 'updateConfig':
        return this.updateConfig(input as UpdateConfigInput) as Promise<TOutput>;
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  }

  /**
   * Subscribe to SV events (sv:verified, sv:rejected)
   */
  subscribe(handler: EventHandler): Unsubscribe {
    this.eventHandlers.add(handler);
    return () => {
      this.eventHandlers.delete(handler);
    };
  }

  async shutdown(): Promise<void> {
    this.providers.clear();
    this.eventHandlers.clear();
    this._status = 'unavailable';
  }

  // === Private methods ===

  private getProvider(providerId?: string): ISpeakerVerificationProvider {
    const id = providerId ?? this.defaultProvider;
    const provider = this.providers.get(id);

    if (!provider) {
      const firstProvider = this.providers.values().next().value;
      if (firstProvider) {
        logger.warn('sv', `Provider ${id} not found, using fallback`);
        return firstProvider;
      }
      throw new Error(`No Speaker Verification provider available`);
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
        logger.error('sv', 'Event handler error', err);
      }
    }
  }

  private async enroll(input: EnrollInput): Promise<EnrollOutput> {
    const provider = this.getProvider(input.provider);
    const audioBuffer = Buffer.from(input.audio, 'base64');

    const result = await provider.enroll(input.speakerId, input.speakerName, audioBuffer);

    if (result.success) {
      this.emitEvent('sv:enrolled', {
        speakerId: result.speakerId,
        speakerName: result.speakerName,
        embeddingCount: result.embeddingCount,
      });
    }

    return result;
  }

  private async verify(input: VerifyInput): Promise<VerifyOutput> {
    const provider = this.getProvider(input.provider);
    const audioBuffer = Buffer.from(input.audio, 'base64');

    const result = await provider.verify(audioBuffer);

    // Emit appropriate event
    if (result.verified) {
      this.emitEvent('sv:verified', {
        speakerId: result.speakerId,
        speakerName: result.speakerName,
        confidence: result.confidence,
      });
    } else {
      this.emitEvent('sv:rejected', {
        confidence: result.confidence,
        threshold: result.threshold,
      });
    }

    return result;
  }

  private async listSpeakers(input: ListSpeakersInput): Promise<ListSpeakersOutput> {
    const provider = this.getProvider(input.provider);
    const speakers = await provider.listSpeakers();
    return { speakers };
  }

  private async deleteSpeaker(input: DeleteSpeakerInput): Promise<DeleteSpeakerOutput> {
    const provider = this.getProvider(input.provider);
    const success = await provider.deleteSpeaker(input.speakerId);

    if (success) {
      this.emitEvent('sv:speaker_deleted', {
        speakerId: input.speakerId,
      });
    }

    return { success };
  }

  private async getConfig(input: GetConfigInput): Promise<SVConfig> {
    const provider = this.getProvider(input.provider);
    return provider.getConfig();
  }

  private async updateConfig(input: UpdateConfigInput): Promise<{ success: boolean }> {
    const provider = this.getProvider(input.provider);

    const config: Partial<SVConfig> = {};
    if (input.threshold !== undefined) config.threshold = input.threshold;
    if (input.applyVAD !== undefined) config.applyVAD = input.applyVAD;

    await provider.updateConfig(config);
    return { success: true };
  }
}
