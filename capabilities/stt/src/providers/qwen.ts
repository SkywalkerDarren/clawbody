import type {
  ISTTProvider,
  TranscriptionOptions,
  TranscriptionResult,
  TranscriptSegment,
  StreamingSession,
  SupportedLanguage,
} from './interface.js';

export interface QwenSTTConfig {
  baseUrl: string;
  timeout?: number;
}

interface CreateSessionResponse {
  session_id: string;
  state: string;
  ws_url: string;
}

interface TranscribeResponse {
  text: string;
  segments: Array<{
    text: string;
    start_time?: number;
    end_time?: number;
    confidence?: number;
    is_final: boolean;
  }>;
  language: string;
  duration: number;
}

interface ChunkResponse {
  text: string | null;
  is_final: boolean;
  confidence?: number;
}

/**
 * Qwen3-ASR STT 提供商
 */
export class QwenSTTProvider implements ISTTProvider {
  readonly id = 'qwen';
  readonly name = 'Qwen3-ASR';
  readonly supportedLanguages: SupportedLanguage[] = ['auto', 'zh', 'en', 'ja', 'ko', 'yue'];

  private baseUrl: string;
  private timeout: number;

  constructor(config: QwenSTTConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.timeout = config.timeout ?? 30000;
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

      const data = (await res.json()) as { status: string };
      return data.status === 'ready';
    } catch {
      return false;
    }
  }

  async transcribe(audio: Buffer, options?: TranscriptionOptions): Promise<TranscriptionResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await fetch(`${this.baseUrl}/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audio: audio.toString('base64'),
          language: options?.language ?? 'auto',
          enable_timestamps: options?.enableTimestamps ?? false,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`Qwen STT error: ${res.status} ${res.statusText}`);
      }

      const json = (await res.json()) as TranscribeResponse;

      return {
        text: json.text,
        segments: json.segments.map((s) => ({
          text: s.text,
          startTime: s.start_time,
          endTime: s.end_time,
          confidence: s.confidence,
          isFinal: s.is_final,
        })),
        language: json.language,
        duration: json.duration,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async createStreamingSession(options?: TranscriptionOptions): Promise<StreamingSession> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const res = await fetch(`${this.baseUrl}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language: options?.language ?? 'auto',
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`Failed to create session: ${res.status} ${res.statusText}`);
      }

      const json = (await res.json()) as CreateSessionResponse;

      return {
        sessionId: json.session_id,
        state: json.state as 'idle' | 'listening' | 'processing' | 'closed',
        createdAt: new Date(),
        lastActivityAt: new Date(),
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async sendAudioChunk(sessionId: string, chunk: Buffer): Promise<TranscriptSegment | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await fetch(`${this.baseUrl}/sessions/${sessionId}/chunks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audio: chunk.toString('base64'),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`Failed to send chunk: ${res.status} ${res.statusText}`);
      }

      const json = (await res.json()) as ChunkResponse;

      if (json.text) {
        return {
          text: json.text,
          isFinal: json.is_final,
          confidence: json.confidence,
        };
      }

      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async endStreamingSession(sessionId: string): Promise<TranscriptionResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await fetch(`${this.baseUrl}/sessions/${sessionId}/end`, {
        method: 'POST',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`Failed to end session: ${res.status} ${res.statusText}`);
      }

      const json = (await res.json()) as TranscribeResponse;

      return {
        text: json.text,
        segments: json.segments.map((s) => ({
          text: s.text,
          startTime: s.start_time,
          endTime: s.end_time,
          confidence: s.confidence,
          isFinal: s.is_final,
        })),
        language: json.language,
        duration: json.duration,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async cancelStreamingSession(sessionId: string): Promise<void> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      await fetch(`${this.baseUrl}/sessions/${sessionId}`, {
        method: 'DELETE',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async *transcribeStream(
    audioStream: AsyncIterable<Buffer>,
    options?: TranscriptionOptions
  ): AsyncIterable<TranscriptSegment> {
    // Create a streaming session
    const session = await this.createStreamingSession(options);

    try {
      for await (const chunk of audioStream) {
        const segment = await this.sendAudioChunk(session.sessionId, chunk);
        if (segment) {
          yield segment;
        }
      }

      // End session and get final result
      const result = await this.endStreamingSession(session.sessionId);
      yield {
        text: result.text,
        isFinal: true,
        confidence: 0.95,
      };
    } catch (error) {
      await this.cancelStreamingSession(session.sessionId);
      throw error;
    }
  }
}
