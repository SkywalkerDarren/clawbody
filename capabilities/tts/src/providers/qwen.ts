import type { ITTSProvider, Voice, SynthesisOptions, SynthesisResult } from './interface.js';

export interface QwenConfig {
  baseUrl: string;
  timeout?: number;
}

const QWEN_VOICES: Voice[] = [
  { id: 'Vivian', name: 'Vivian', language: 'en', gender: 'female' },
  { id: 'Ethan', name: 'Ethan', language: 'en', gender: 'male' },
  { id: 'Chelsie', name: 'Chelsie', language: 'en', gender: 'female' },
  { id: 'Serena', name: 'Serena', language: 'zh', gender: 'female' },
  { id: 'Aiden', name: 'Aiden', language: 'zh', gender: 'male' },
  { id: 'Bella', name: 'Bella', language: 'zh', gender: 'female' },
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
      return res.ok;
    } catch {
      return false;
    }
  }

  async listVoices(): Promise<Voice[]> {
    return QWEN_VOICES;
  }

  async synthesize(options: SynthesisOptions): Promise<SynthesisResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await fetch(`${this.baseUrl}/tts/custom-voice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: options.text,
          speaker: options.voice ?? 'Vivian',
          language: null,
          instruct: null,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`Qwen TTS error: ${res.status} ${res.statusText}`);
      }

      const json = (await res.json()) as { audio_base64: string; sample_rate: number };
      const audio = Buffer.from(json.audio_base64, 'base64');

      // Estimate duration: 16-bit mono audio
      const duration = audio.length / (json.sample_rate * 2);

      return {
        audio,
        format: 'wav',
        sampleRate: json.sample_rate,
        duration,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
