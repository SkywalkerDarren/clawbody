import type { ITTSProvider, Voice, SynthesisOptions, SynthesisResult } from './interface.js';

export interface QwenConfig {
  baseUrl: string;
  timeout?: number;
}

const QWEN_VOICES: Voice[] = [
  { id: 'Vivian', name: 'Vivian (明亮女声)', language: 'zh', gender: 'female' },
  { id: 'Serena', name: 'Serena (温柔女声)', language: 'zh', gender: 'female' },
  { id: 'Uncle_Fu', name: 'Uncle Fu (醇厚男声)', language: 'zh', gender: 'male' },
  { id: 'Dylan', name: 'Dylan (北京男声)', language: 'zh', gender: 'male' },
  { id: 'Eric', name: 'Eric (四川男声)', language: 'zh', gender: 'male' },
  { id: 'Ryan', name: 'Ryan (动感男声)', language: 'en', gender: 'male' },
  { id: 'Aiden', name: 'Aiden (美式男声)', language: 'en', gender: 'male' },
];

/**
 * Qwen3-TTS 提供商
 */
export class QwenTTSProvider implements ITTSProvider {
  readonly id = 'qwen';
  readonly name = 'Qwen3-TTS';

  private baseUrl: string;
  private timeout: number;

  constructor(config: QwenConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.timeout = config.timeout ?? 60000;
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

  async listVoices(): Promise<Voice[]> {
    try {
      const res = await fetch(`${this.baseUrl}/speakers`);
      if (res.ok) {
        const data = (await res.json()) as { speakers: string[] };
        return data.speakers.map((id) => {
          const voice = QWEN_VOICES.find((v) => v.id === id);
          return voice ?? { id, name: id, language: 'zh', gender: undefined };
        });
      }
    } catch {
      // fallback
    }
    return QWEN_VOICES;
  }

  async synthesize(options: SynthesisOptions): Promise<SynthesisResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await fetch(`${this.baseUrl}/synthesize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: options.text,
          speaker: options.voice ?? 'Vivian',
          language: 'Auto',
          instruct: null,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`Qwen TTS error: ${res.status} ${res.statusText}`);
      }

      const json = (await res.json()) as {
        audio: string;
        sample_rate: number;
        duration_ms: number;
      };
      const audio = Buffer.from(json.audio, 'base64');

      return {
        audio,
        format: 'wav',
        sampleRate: json.sample_rate,
        duration: json.duration_ms / 1000,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
