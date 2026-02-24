import { describe, it, expect } from 'vitest';
import {
  PipelineStatusSchema,
  DiagnosticsSchema,
  SpeakerSchema,
  SpeakersResponseSchema,
  EnrollRequestSchema,
  VADConfigSchema,
  SVConfigSchema,
  ModelInfoSchema,
  ScreenshotSchema,
} from './schemas';

describe('API Schemas', () => {
  describe('PipelineStatusSchema', () => {
    it('validates correct pipeline status', () => {
      const result = PipelineStatusSchema.safeParse({
        enabled: true,
        description: 'VAD → SV → STT → OpenClaw pipeline',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid pipeline status', () => {
      const result = PipelineStatusSchema.safeParse({
        enabled: 'yes',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('DiagnosticsSchema', () => {
    it('validates correct diagnostics', () => {
      const result = DiagnosticsSchema.safeParse({
        gateway: { status: 'ok', uptime: 3600 },
        services: {
          tts: { status: 'ok', latency: 15 },
          stt: { status: 'error', message: 'Connection failed' },
        },
        openclaw: { status: 'ok' },
        overall: 'degraded',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('SpeakerSchema', () => {
    it('validates speaker with embedding count', () => {
      const result = SpeakerSchema.safeParse({
        id: 'user001',
        name: '张三',
        embeddingCount: 3,
      });
      expect(result.success).toBe(true);
    });

    it('validates speaker without embedding count', () => {
      const result = SpeakerSchema.safeParse({
        id: 'user001',
        name: '张三',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('SpeakersResponseSchema', () => {
    it('validates object with speakers array', () => {
      const result = SpeakersResponseSchema.safeParse({
        speakers: [
          { id: 'user001', name: '张三' },
          { id: 'user002', name: '李四', embeddingCount: 2 },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('validates empty speakers array', () => {
      const result = SpeakersResponseSchema.safeParse({ speakers: [] });
      expect(result.success).toBe(true);
    });
  });

  describe('EnrollRequestSchema', () => {
    it('validates correct enroll request', () => {
      const result = EnrollRequestSchema.safeParse({
        speakerId: 'user001',
        speakerName: '张三',
        audio: 'base64audiodata',
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty speaker_id', () => {
      const result = EnrollRequestSchema.safeParse({
        speakerId: '',
        speakerName: '张三',
        audio: 'base64audiodata',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing audio', () => {
      const result = EnrollRequestSchema.safeParse({
        speakerId: 'user001',
        speakerName: '张三',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('VADConfigSchema', () => {
    it('validates correct VAD config', () => {
      const result = VADConfigSchema.safeParse({
        threshold: 0.5,
        minSpeechDurationMs: 250,
        minSilenceDurationMs: 300,
        speechPadMs: 30,
      });
      expect(result.success).toBe(true);
    });

    it('rejects threshold out of range', () => {
      const result = VADConfigSchema.safeParse({
        threshold: 1.5,
        minSpeechDurationMs: 250,
        minSilenceDurationMs: 300,
        speechPadMs: 30,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('SVConfigSchema', () => {
    it('validates correct SV config', () => {
      const result = SVConfigSchema.safeParse({
        threshold: 0.6,
        applyVAD: true,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('ModelInfoSchema', () => {
    it('validates correct model info', () => {
      const result = ModelInfoSchema.safeParse({
        expressions: ['f01', 'f02', 'f03'],
        motions: { idle: 3, tap_body: 2 },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('ScreenshotSchema', () => {
    it('validates correct screenshot', () => {
      const result = ScreenshotSchema.safeParse({
        base64: 'base64imagedata',
        width: 1920,
        height: 1080,
        timestamp: '2024-01-01T00:00:00.000Z',
      });
      expect(result.success).toBe(true);
    });
  });
});
