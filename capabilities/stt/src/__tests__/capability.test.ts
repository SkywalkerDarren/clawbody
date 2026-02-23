import { describe, it, expect, beforeEach, vi } from 'vitest';
import { STTCapability, type ProviderConfig } from '../capability.js';
import type {
  ISTTProvider,
  TranscriptionResult,
  TranscriptSegment,
  StreamingSession,
  SupportedLanguage,
} from '../providers/interface.js';

function createMockProvider(id: string, overrides?: Partial<ISTTProvider>): ISTTProvider {
  const mockSession: StreamingSession = {
    sessionId: 'sess_123',
    state: 'idle',
    createdAt: new Date(),
    lastActivityAt: new Date(),
  };

  const mockResult: TranscriptionResult = {
    text: '你好世界',
    segments: [
      { text: '你好', startTime: 0, endTime: 0.5, confidence: 0.95, isFinal: true },
      { text: '世界', startTime: 0.5, endTime: 1.0, confidence: 0.92, isFinal: true },
    ],
    language: 'zh',
    duration: 1.0,
  };

  return {
    id,
    name: `Mock ${id}`,
    supportedLanguages: ['auto', 'zh', 'en', 'ja'] as SupportedLanguage[],
    isAvailable: vi.fn().mockResolvedValue(true),
    transcribe: vi.fn().mockResolvedValue(mockResult),
    createStreamingSession: vi.fn().mockResolvedValue(mockSession),
    sendAudioChunk: vi.fn().mockResolvedValue({
      text: '你好',
      isFinal: false,
      confidence: 0.85,
    } as TranscriptSegment),
    endStreamingSession: vi.fn().mockResolvedValue(mockResult),
    cancelStreamingSession: vi.fn().mockResolvedValue(undefined),
    transcribeStream: vi.fn().mockImplementation(async function* () {
      yield { text: '你好', isFinal: false, confidence: 0.8 };
      yield { text: '你好世界', isFinal: true, confidence: 0.95 };
    }),
    ...overrides,
  };
}

describe('STTCapability', () => {
  let capability: STTCapability;
  let mockProvider: ISTTProvider;

  beforeEach(() => {
    mockProvider = createMockProvider('mock');
    const factories = new Map<string, (config: ProviderConfig) => ISTTProvider>();
    factories.set('mock', () => mockProvider);
    capability = new STTCapability(factories);
  });

  describe('meta', () => {
    it('should have correct metadata', () => {
      expect(capability.meta.id).toBe('stt');
      expect(capability.meta.name).toBe('Speech-to-Text');
      expect(capability.meta.type).toBe('input');
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

    it('should set status to ready even when provider not yet available', async () => {
      const unavailableProvider = createMockProvider('unavailable', {
        isAvailable: vi.fn().mockResolvedValue(false),
      });
      const factories = new Map<string, (config: ProviderConfig) => ISTTProvider>();
      factories.set('unavailable', () => unavailableProvider);
      const cap = new STTCapability(factories);

      await cap.initialize({
        defaultProvider: 'unavailable',
        providers: {
          unavailable: { type: 'unavailable' },
        },
      });

      // Provider is registered even if not available
      expect(cap.status).toBe('ready');
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

    it('should apply streaming config', async () => {
      await capability.initialize({
        defaultProvider: 'mock',
        providers: { mock: { type: 'mock' } },
        streaming: {
          chunkDurationMs: 200,
          sessionTimeoutSec: 60,
          maxConcurrentSessions: 5,
        },
      });

      expect(capability.status).toBe('ready');
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

    it('should include active sessions count', async () => {
      await capability.initialize({
        defaultProvider: 'mock',
        providers: { mock: { type: 'mock' } },
      });

      const health = await capability.healthCheck();

      expect(health.details?.['activeSessions']).toBe(0);
    });
  });

  describe('getOperations', () => {
    it('should return all STT operations', () => {
      const ops = capability.getOperations();

      expect(ops.length).toBeGreaterThanOrEqual(6);
      const opNames = ops.map((o) => o.name);
      expect(opNames).toContain('transcribe');
      expect(opNames).toContain('startSession');
      expect(opNames).toContain('sendChunk');
      expect(opNames).toContain('endSession');
      expect(opNames).toContain('cancelSession');
      expect(opNames).toContain('listLanguages');
    });
  });

  describe('execute', () => {
    beforeEach(async () => {
      await capability.initialize({
        defaultProvider: 'mock',
        providers: { mock: { type: 'mock' } },
      });
    });

    describe('transcribe', () => {
      it('should transcribe audio and return result', async () => {
        const audioBase64 = Buffer.from('mock audio data').toString('base64');

        const result = await capability.execute<
          { audio: string; language?: string },
          { text: string; language: string; duration: number }
        >('transcribe', { audio: audioBase64, language: 'zh' });

        expect(result.text).toBe('你好世界');
        expect(result.language).toBe('zh');
        expect(result.duration).toBe(1.0);
        expect(mockProvider.transcribe).toHaveBeenCalled();
      });

      it('should pass transcription options', async () => {
        const audioBase64 = Buffer.from('mock audio').toString('base64');

        await capability.execute('transcribe', {
          audio: audioBase64,
          language: 'en',
          enableTimestamps: true,
        });

        expect(mockProvider.transcribe).toHaveBeenCalledWith(
          expect.any(Buffer),
          expect.objectContaining({
            language: 'en',
            enableTimestamps: true,
          })
        );
      });
    });

    describe('streaming session', () => {
      it('should create streaming session', async () => {
        const result = await capability.execute<
          { language?: string },
          { sessionId: string; state: string }
        >('startSession', { language: 'zh' });

        expect(result.sessionId).toBe('sess_123');
        expect(result.state).toBe('idle');
        expect(mockProvider.createStreamingSession).toHaveBeenCalled();
      });

      it('should send audio chunk and receive partial result', async () => {
        // First create a session
        await capability.execute('startSession', {});

        const audioChunk = Buffer.from('chunk data').toString('base64');
        const result = await capability.execute<
          { sessionId: string; audio: string },
          { text: string | null; isFinal: boolean }
        >('sendChunk', { sessionId: 'sess_123', audio: audioChunk });

        expect(result.text).toBe('你好');
        expect(result.isFinal).toBe(false);
        expect(mockProvider.sendAudioChunk).toHaveBeenCalled();
      });

      it('should end session and return final result', async () => {
        // First create a session
        await capability.execute('startSession', {});

        const result = await capability.execute<
          { sessionId: string },
          { text: string; duration: number }
        >('endSession', { sessionId: 'sess_123' });

        expect(result.text).toBe('你好世界');
        expect(result.duration).toBe(1.0);
        expect(mockProvider.endStreamingSession).toHaveBeenCalled();
      });

      it('should cancel session', async () => {
        // First create a session
        await capability.execute('startSession', {});

        const result = await capability.execute<{ sessionId: string }, { success: boolean }>(
          'cancelSession',
          { sessionId: 'sess_123' }
        );

        expect(result.success).toBe(true);
        expect(mockProvider.cancelStreamingSession).toHaveBeenCalled();
      });

      it('should throw when session not found', async () => {
        await expect(
          capability.execute('sendChunk', { sessionId: 'nonexistent', audio: 'abc' })
        ).rejects.toThrow('Session not found');
      });

      it('should enforce max concurrent sessions', async () => {
        // Initialize with max 1 session
        const factories = new Map<string, (config: ProviderConfig) => ISTTProvider>();
        let sessionCounter = 0;
        factories.set('mock', () =>
          createMockProvider('mock', {
            createStreamingSession: vi.fn().mockImplementation(async () => ({
              sessionId: `sess_${++sessionCounter}`,
              state: 'idle',
              createdAt: new Date(),
              lastActivityAt: new Date(),
            })),
          })
        );
        const cap = new STTCapability(factories);
        await cap.initialize({
          defaultProvider: 'mock',
          providers: { mock: { type: 'mock' } },
          streaming: { maxConcurrentSessions: 1 },
        });

        // First session should succeed
        await cap.execute('startSession', {});

        // Second session should fail
        await expect(cap.execute('startSession', {})).rejects.toThrow(
          'Maximum concurrent sessions reached'
        );
      });
    });

    describe('listLanguages', () => {
      it('should return languages from provider', async () => {
        const result = await capability.execute<{ provider?: string }, SupportedLanguage[]>(
          'listLanguages',
          { provider: 'mock' }
        );

        expect(result).toContain('zh');
        expect(result).toContain('en');
        expect(result).toContain('auto');
      });

      it('should return all languages when no provider specified', async () => {
        const result = await capability.execute<{ provider?: string }, SupportedLanguage[]>(
          'listLanguages',
          {}
        );

        expect(result.length).toBeGreaterThan(0);
      });
    });

    it('should throw for unknown operation', async () => {
      await expect(capability.execute('unknown', {})).rejects.toThrow('Unknown operation: unknown');
    });
  });

  describe('subscribe', () => {
    it('should allow subscribing to events', async () => {
      await capability.initialize({
        defaultProvider: 'mock',
        providers: { mock: { type: 'mock' } },
      });

      const events: unknown[] = [];
      const unsubscribe = capability.subscribe((event) => {
        events.push(event);
      });

      // Trigger an event by transcribing
      const audioBase64 = Buffer.from('mock audio').toString('base64');
      await capability.execute('transcribe', { audio: audioBase64 });

      expect(events.length).toBeGreaterThan(0);
      expect(events[0]).toHaveProperty('eventType', 'transcription');

      unsubscribe();
    });

    it('should unsubscribe correctly', async () => {
      await capability.initialize({
        defaultProvider: 'mock',
        providers: { mock: { type: 'mock' } },
      });

      const events: unknown[] = [];
      const unsubscribe = capability.subscribe((event) => {
        events.push(event);
      });

      unsubscribe();

      // Trigger an event
      const audioBase64 = Buffer.from('mock audio').toString('base64');
      await capability.execute('transcribe', { audio: audioBase64 });

      expect(events.length).toBe(0);
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

    it('should cancel active sessions on shutdown', async () => {
      await capability.initialize({
        defaultProvider: 'mock',
        providers: { mock: { type: 'mock' } },
      });

      // Create a session
      await capability.execute('startSession', {});

      await capability.shutdown();

      expect(mockProvider.cancelStreamingSession).toHaveBeenCalled();
    });
  });

  describe('provider fallback', () => {
    it('should fallback to available provider when requested not found', async () => {
      await capability.initialize({
        defaultProvider: 'nonexistent',
        providers: { mock: { type: 'mock' } },
      });

      const audioBase64 = Buffer.from('mock audio').toString('base64');
      const result = await capability.execute<{ audio: string }, { text: string }>('transcribe', {
        audio: audioBase64,
      });

      expect(result.text).toBe('你好世界');
    });

    it('should throw when no providers available', async () => {
      await capability.initialize({
        defaultProvider: 'mock',
        providers: {},
      });

      const audioBase64 = Buffer.from('mock audio').toString('base64');
      await expect(capability.execute('transcribe', { audio: audioBase64 })).rejects.toThrow(
        'No STT provider available'
      );
    });
  });
});
