import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TTSCapability, type ProviderConfig } from '../capability.js';
import type { ITTSProvider, Voice, SynthesisResult } from '../providers/interface.js';

function createMockProvider(id: string, overrides?: Partial<ITTSProvider>): ITTSProvider {
  return {
    id,
    name: `Mock ${id}`,
    isAvailable: vi.fn().mockResolvedValue(true),
    listVoices: vi.fn().mockResolvedValue([
      { id: 'voice1', name: 'Voice 1', language: 'en', gender: 'female' as const },
    ]),
    synthesize: vi.fn().mockResolvedValue({
      audio: Buffer.from('mock audio'),
      format: 'wav',
      sampleRate: 24000,
      duration: 1.5,
    }),
    ...overrides,
  };
}

describe('TTSCapability', () => {
  let capability: TTSCapability;
  let mockProvider: ITTSProvider;

  beforeEach(() => {
    mockProvider = createMockProvider('mock');
    const factories = new Map<string, (config: ProviderConfig) => ITTSProvider>();
    factories.set('mock', () => mockProvider);
    capability = new TTSCapability(factories);
  });

  describe('meta', () => {
    it('should have correct metadata', () => {
      expect(capability.meta.id).toBe('tts');
      expect(capability.meta.name).toBe('Text-to-Speech');
      expect(capability.meta.type).toBe('output');
    });
  });

  describe('initialize', () => {
    it('should initialize with providers', async () => {
      await capability.initialize({
        defaultProvider: 'mock',
        providers: {
          mock: { type: 'mock' },
        },
      });

      expect(capability.status).toBe('ready');
    });

    it('should set status to unavailable when no providers available', async () => {
      const unavailableProvider = createMockProvider('unavailable', {
        isAvailable: vi.fn().mockResolvedValue(false),
      });
      const factories = new Map<string, (config: ProviderConfig) => ITTSProvider>();
      factories.set('unavailable', () => unavailableProvider);
      const cap = new TTSCapability(factories);

      await cap.initialize({
        defaultProvider: 'unavailable',
        providers: {
          unavailable: { type: 'unavailable' },
        },
      });

      expect(cap.status).toBe('unavailable');
    });

    it('should skip unknown provider types', async () => {
      await capability.initialize({
        defaultProvider: 'mock',
        providers: {
          unknown: { type: 'unknown-type' },
        },
      });

      expect(capability.status).toBe('unavailable');
    });
  });

  describe('healthCheck', () => {
    it('should return ready status when providers available', async () => {
      await capability.initialize({
        defaultProvider: 'mock',
        providers: { mock: { type: 'mock' } },
      });

      const health = await capability.healthCheck();

      expect(health.status).toBe('ready');
      expect(health.details?.['providers']).toContain('mock');
    });

    it('should return unavailable when no providers', async () => {
      await capability.initialize({
        defaultProvider: 'mock',
        providers: {},
      });

      const health = await capability.healthCheck();

      expect(health.status).toBe('unavailable');
    });
  });

  describe('getOperations', () => {
    it('should return speak, synthesize, and listVoices operations', () => {
      const ops = capability.getOperations();

      expect(ops).toHaveLength(3);
      expect(ops.map((o) => o.name)).toContain('speak');
      expect(ops.map((o) => o.name)).toContain('synthesize');
      expect(ops.map((o) => o.name)).toContain('listVoices');
    });
  });

  describe('execute', () => {
    beforeEach(async () => {
      await capability.initialize({
        defaultProvider: 'mock',
        providers: { mock: { type: 'mock' } },
      });
    });

    describe('speak', () => {
      it('should synthesize and return duration', async () => {
        const result = await capability.execute<{ text: string }, { duration: number; provider: string }>(
          'speak',
          { text: 'Hello world' }
        );

        expect(result.duration).toBe(1.5);
        expect(result.provider).toBe('mock');
        expect(mockProvider.synthesize).toHaveBeenCalledWith({
          text: 'Hello world',
          voice: undefined,
          speed: undefined,
        });
      });

      it('should pass voice and speed options', async () => {
        await capability.execute('speak', {
          text: 'Hello',
          voice: 'voice1',
          speed: 1.5,
        });

        expect(mockProvider.synthesize).toHaveBeenCalledWith({
          text: 'Hello',
          voice: 'voice1',
          speed: 1.5,
        });
      });
    });

    describe('synthesize', () => {
      it('should return base64 encoded audio', async () => {
        const result = await capability.execute<
          { text: string },
          { audio: string; format: string; sampleRate: number; duration: number }
        >('synthesize', { text: 'Hello' });

        expect(result.audio).toBe(Buffer.from('mock audio').toString('base64'));
        expect(result.format).toBe('wav');
        expect(result.sampleRate).toBe(24000);
        expect(result.duration).toBe(1.5);
      });
    });

    describe('listVoices', () => {
      it('should return voices from provider', async () => {
        const result = await capability.execute<{ provider?: string }, Voice[]>('listVoices', {
          provider: 'mock',
        });

        expect(result).toHaveLength(1);
        expect(result[0]?.id).toBe('voice1');
      });

      it('should return voices from all providers when no provider specified', async () => {
        const result = await capability.execute<{ provider?: string }, Voice[]>('listVoices', {});

        expect(result).toHaveLength(1);
      });
    });

    it('should throw for unknown operation', async () => {
      await expect(capability.execute('unknown', {})).rejects.toThrow('Unknown operation: unknown');
    });
  });

  describe('shutdown', () => {
    it('should clear providers and set status to unavailable', async () => {
      await capability.initialize({
        defaultProvider: 'mock',
        providers: { mock: { type: 'mock' } },
      });

      await capability.shutdown();

      expect(capability.status).toBe('unavailable');
    });
  });

  describe('provider fallback', () => {
    it('should fallback to available provider when requested not found', async () => {
      await capability.initialize({
        defaultProvider: 'nonexistent',
        providers: { mock: { type: 'mock' } },
      });

      // Should not throw, should use mock as fallback
      const result = await capability.execute<{ text: string }, { provider: string }>('speak', {
        text: 'Hello',
      });

      expect(result.provider).toBe('mock');
    });

    it('should throw when no providers available', async () => {
      await capability.initialize({
        defaultProvider: 'mock',
        providers: {},
      });

      await expect(capability.execute('speak', { text: 'Hello' })).rejects.toThrow(
        'No TTS provider available'
      );
    });
  });
});
