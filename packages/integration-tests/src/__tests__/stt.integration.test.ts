/**
 * STT 能力集成测试
 *
 * 这些测试验证 STT 能力的完整功能，包括：
 * - 能力初始化
 * - 批量转录
 * - 流式会话管理
 * - 事件订阅
 *
 * 注意：这些测试使用 mock provider，不需要实际的 STT 服务运行
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CapabilityRegistry } from '@clawbody/core';
import {
  STTCapability,
  type ISTTProvider,
  type TranscriptionResult,
  type TranscriptSegment,
  type StreamingSession,
  type SupportedLanguage,
  type ProviderConfig,
} from '@clawbody/stt';

// Mock provider for integration tests
function createMockSTTProvider(): ISTTProvider {
  let sessionCounter = 0;
  const sessions = new Map<string, { language: string; chunks: Buffer[] }>();

  return {
    id: 'mock-stt',
    name: 'Mock STT Provider',
    supportedLanguages: ['auto', 'zh', 'en', 'ja'] as SupportedLanguage[],

    isAvailable: vi.fn().mockResolvedValue(true),

    transcribe: vi.fn().mockImplementation(async (audio: Buffer): Promise<TranscriptionResult> => {
      // Simulate transcription based on audio length
      const duration = audio.length / 32000; // Assume 16kHz, 16-bit
      return {
        text: '这是一段测试音频的转录结果',
        segments: [
          {
            text: '这是一段测试音频的转录结果',
            startTime: 0,
            endTime: duration,
            confidence: 0.95,
            isFinal: true,
          },
        ],
        language: 'zh',
        duration,
      };
    }),

    createStreamingSession: vi.fn().mockImplementation(async (options): Promise<StreamingSession> => {
      const sessionId = `sess_${++sessionCounter}`;
      sessions.set(sessionId, { language: options?.language ?? 'auto', chunks: [] });
      return {
        sessionId,
        state: 'idle',
        createdAt: new Date(),
        lastActivityAt: new Date(),
      };
    }),

    sendAudioChunk: vi.fn().mockImplementation(async (sessionId: string, chunk: Buffer): Promise<TranscriptSegment | null> => {
      const session = sessions.get(sessionId);
      if (!session) throw new Error('Session not found');
      session.chunks.push(chunk);

      // Return partial result every 3 chunks
      if (session.chunks.length % 3 === 0) {
        return {
          text: `部分结果 ${session.chunks.length}`,
          isFinal: false,
          confidence: 0.8,
        };
      }
      return null;
    }),

    endStreamingSession: vi.fn().mockImplementation(async (sessionId: string): Promise<TranscriptionResult> => {
      const session = sessions.get(sessionId);
      if (!session) throw new Error('Session not found');

      const totalBytes = session.chunks.reduce((sum, c) => sum + c.length, 0);
      const duration = totalBytes / 32000;

      sessions.delete(sessionId);

      return {
        text: '完整的流式转录结果',
        segments: [
          {
            text: '完整的流式转录结果',
            startTime: 0,
            endTime: duration,
            confidence: 0.92,
            isFinal: true,
          },
        ],
        language: session.language,
        duration,
      };
    }),

    cancelStreamingSession: vi.fn().mockImplementation(async (sessionId: string): Promise<void> => {
      sessions.delete(sessionId);
    }),

    transcribeStream: vi.fn().mockImplementation(async function* (
      audioStream: AsyncIterable<Buffer>
    ): AsyncIterable<TranscriptSegment> {
      let chunkCount = 0;
      for await (const _chunk of audioStream) {
        chunkCount++;
        if (chunkCount % 2 === 0) {
          yield {
            text: `流式结果 ${chunkCount}`,
            isFinal: false,
            confidence: 0.85,
          };
        }
      }
      yield {
        text: '最终流式结果',
        isFinal: true,
        confidence: 0.95,
      };
    }),
  };
}

describe('STT Integration Tests', () => {
  let registry: CapabilityRegistry;
  let sttCapability: STTCapability;
  let mockProvider: ISTTProvider;

  beforeEach(async () => {
    registry = new CapabilityRegistry();
    mockProvider = createMockSTTProvider();

    const factories = new Map<string, (config: ProviderConfig) => ISTTProvider>();
    factories.set('mock', () => mockProvider);

    sttCapability = new STTCapability(factories);
    registry.register(sttCapability);

    await registry.initializeAll({
      stt: {
        defaultProvider: 'mock',
        providers: {
          mock: { type: 'mock' },
        },
      },
    });
  });

  afterEach(async () => {
    await registry.shutdownAll();
  });

  describe('Registry Integration', () => {
    it('should register STT capability in registry', () => {
      const cap = registry.get('stt');
      expect(cap).toBeDefined();
      expect(cap?.meta.id).toBe('stt');
      expect(cap?.meta.type).toBe('input');
    });

    it('should report STT in capabilities list', () => {
      const allMeta = registry.getAllMeta();
      const sttMeta = allMeta.find((m) => m.id === 'stt');
      expect(sttMeta).toBeDefined();
      expect(sttMeta?.name).toBe('Speech-to-Text');
    });

    it('should have ready status after initialization', () => {
      expect(sttCapability.status).toBe('ready');
    });
  });

  describe('Batch Transcription', () => {
    it('should transcribe audio via registry', async () => {
      const cap = registry.get('stt');
      expect(cap).toBeDefined();

      // Create mock audio data (1 second of silence at 16kHz, 16-bit)
      const audioBuffer = Buffer.alloc(32000);
      const audioBase64 = audioBuffer.toString('base64');

      const result = await cap!.execute('transcribe', {
        audio: audioBase64,
        language: 'zh',
      });

      expect(result).toHaveProperty('text');
      expect(result).toHaveProperty('duration');
      expect(mockProvider.transcribe).toHaveBeenCalled();
    });

    it('should handle transcription with timestamps', async () => {
      const cap = registry.get('stt');
      const audioBuffer = Buffer.alloc(32000);

      const result = (await cap!.execute('transcribe', {
        audio: audioBuffer.toString('base64'),
        enableTimestamps: true,
      })) as TranscriptionResult;

      expect(result.segments).toBeDefined();
      expect(result.segments.length).toBeGreaterThan(0);
      expect(result.segments[0]).toHaveProperty('startTime');
      expect(result.segments[0]).toHaveProperty('endTime');
    });
  });

  describe('Streaming Session', () => {
    it('should create and manage streaming session', async () => {
      const cap = registry.get('stt');

      // Start session
      const session = (await cap!.execute('startSession', {
        language: 'zh',
      })) as { sessionId: string; state: string };

      expect(session.sessionId).toBeDefined();
      expect(session.state).toBe('idle');

      // Send chunks
      const chunk = Buffer.alloc(3200); // 100ms of audio
      for (let i = 0; i < 5; i++) {
        await cap!.execute('sendChunk', {
          sessionId: session.sessionId,
          audio: chunk.toString('base64'),
        });
      }

      // End session
      const result = (await cap!.execute('endSession', {
        sessionId: session.sessionId,
      })) as TranscriptionResult;

      expect(result.text).toBeDefined();
      expect(result.duration).toBeGreaterThan(0);
    });

    it('should cancel session without error', async () => {
      const cap = registry.get('stt');

      const session = (await cap!.execute('startSession', {})) as { sessionId: string };

      const result = (await cap!.execute('cancelSession', {
        sessionId: session.sessionId,
      })) as { success: boolean };

      expect(result.success).toBe(true);
    });

    it('should throw error for non-existent session', async () => {
      const cap = registry.get('stt');

      await expect(
        cap!.execute('sendChunk', {
          sessionId: 'non-existent',
          audio: Buffer.alloc(100).toString('base64'),
        })
      ).rejects.toThrow('Session not found');
    });
  });

  describe('Event Subscription', () => {
    it('should emit events during transcription', async () => {
      const events: unknown[] = [];
      const unsubscribe = sttCapability.subscribe((event) => {
        events.push(event);
      });

      const audioBuffer = Buffer.alloc(32000);
      await sttCapability.execute('transcribe', {
        audio: audioBuffer.toString('base64'),
      });

      expect(events.length).toBeGreaterThan(0);
      expect(events[0]).toHaveProperty('eventType', 'transcription');

      unsubscribe();
    });

    it('should emit events during streaming session', async () => {
      const events: unknown[] = [];
      const unsubscribe = sttCapability.subscribe((event) => {
        events.push(event);
      });

      // Start session
      const session = (await sttCapability.execute('startSession', {})) as { sessionId: string };
      expect(events.some((e: any) => e.eventType === 'sessionStarted')).toBe(true);

      // Send chunks
      const chunk = Buffer.alloc(3200);
      for (let i = 0; i < 3; i++) {
        await sttCapability.execute('sendChunk', {
          sessionId: session.sessionId,
          audio: chunk.toString('base64'),
        });
      }

      // End session
      await sttCapability.execute('endSession', { sessionId: session.sessionId });
      expect(events.some((e: any) => e.eventType === 'sessionEnded')).toBe(true);

      unsubscribe();
    });
  });

  describe('Language Support', () => {
    it('should list supported languages', async () => {
      const languages = (await sttCapability.execute('listLanguages', {})) as SupportedLanguage[];

      expect(languages).toContain('auto');
      expect(languages).toContain('zh');
      expect(languages).toContain('en');
    });

    it('should list languages for specific provider', async () => {
      const languages = (await sttCapability.execute('listLanguages', {
        provider: 'mock',
      })) as SupportedLanguage[];

      expect(languages.length).toBeGreaterThan(0);
    });
  });

  describe('Health Check', () => {
    it('should report healthy status', async () => {
      const health = await sttCapability.healthCheck();

      expect(health.status).toBe('ready');
      expect(health.details?.['providers']).toContain('mock');
      expect(health.details?.['activeSessions']).toBe(0);
    });

    it('should track active sessions in health check', async () => {
      // Create a session
      await sttCapability.execute('startSession', {});

      const health = await sttCapability.healthCheck();
      expect(health.details?.['activeSessions']).toBe(1);
    });
  });

  describe('Shutdown', () => {
    it('should cleanup on shutdown', async () => {
      // Create active session
      const session = (await sttCapability.execute('startSession', {})) as { sessionId: string };

      // Shutdown
      await sttCapability.shutdown();

      expect(sttCapability.status).toBe('unavailable');
      expect(mockProvider.cancelStreamingSession).toHaveBeenCalledWith(session.sessionId);
    });
  });
});
