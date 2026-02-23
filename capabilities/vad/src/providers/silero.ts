import type { IVADProvider, VADConfig, VADEvent } from './interface.js';

export interface SileroVADProviderConfig {
  baseUrl: string;
  timeout?: number;
}

interface HealthResponse {
  status: string;
  model: string;
}

interface ProcessResponse {
  is_speech: boolean;
  confidence: number;
  event: 'speech_start' | 'speech_end' | null;
  audio_buffer: string | null;
}

interface ConfigResponse {
  threshold: number;
  min_speech_ms: number;
  min_silence_ms: number;
  speech_pad_ms: number;
  sample_rate: number;
}

/**
 * Silero VAD 提供商
 *
 * 通过 HTTP API 与 Python Silero VAD 服务通信
 */
export class SileroVADProvider implements IVADProvider {
  readonly id = 'silero';
  readonly name = 'Silero VAD';

  private baseUrl: string;
  private timeout: number;

  constructor(config: SileroVADProviderConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.timeout = config.timeout ?? 5000;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const res = await fetch(`${this.baseUrl}/health`, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) return false;

      const data = (await res.json()) as HealthResponse;
      return data.status === 'ready';
    } catch {
      return false;
    }
  }

  async processChunk(audio: Buffer): Promise<VADEvent | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await fetch(`${this.baseUrl}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audio: audio.toString('base64'),
          reset: false,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`Silero VAD error: ${res.status} ${res.statusText}`);
      }

      const json = (await res.json()) as ProcessResponse;

      if (!json.event) {
        return null;
      }

      const event: VADEvent = {
        type: json.event,
        timestamp: Date.now() / 1000,
      };

      if (json.event === 'speech_end' && json.audio_buffer) {
        event.audioBuffer = Buffer.from(json.audio_buffer, 'base64');
      }

      return event;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async reset(): Promise<void> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await fetch(`${this.baseUrl}/reset`, {
        method: 'POST',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`Failed to reset VAD: ${res.status} ${res.statusText}`);
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async getConfig(): Promise<VADConfig> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await fetch(`${this.baseUrl}/config`, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`Failed to get config: ${res.status} ${res.statusText}`);
      }

      const json = (await res.json()) as ConfigResponse;

      return {
        threshold: json.threshold,
        minSpeechDurationMs: json.min_speech_ms,
        minSilenceDurationMs: json.min_silence_ms,
        speechPadMs: json.speech_pad_ms,
        sampleRate: json.sample_rate,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async updateConfig(config: Partial<VADConfig>): Promise<void> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const body: Record<string, unknown> = {};

      if (config.threshold !== undefined) {
        body['threshold'] = config.threshold;
      }
      if (config.minSpeechDurationMs !== undefined) {
        body['min_speech_ms'] = config.minSpeechDurationMs;
      }
      if (config.minSilenceDurationMs !== undefined) {
        body['min_silence_ms'] = config.minSilenceDurationMs;
      }
      if (config.speechPadMs !== undefined) {
        body['speech_pad_ms'] = config.speechPadMs;
      }

      const res = await fetch(`${this.baseUrl}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`Failed to update config: ${res.status} ${res.statusText}`);
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
