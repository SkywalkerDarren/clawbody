import { spawn } from 'child_process';
import type { ITTSProvider, Voice, SynthesisOptions, SynthesisResult } from './interface.js';

export interface EdgeConfig {
  defaultVoice?: string;
}

/**
 * Edge-TTS 提供商 (免费，需要安装 edge-tts CLI)
 */
export class EdgeTTSProvider implements ITTSProvider {
  readonly id = 'edge';
  readonly name = 'Microsoft Edge TTS';

  private defaultVoice: string;
  private voicesCache: Voice[] | null = null;

  constructor(config: EdgeConfig = {}) {
    this.defaultVoice = config.defaultVoice ?? 'zh-CN-XiaoxiaoNeural';
  }

  async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const proc = spawn('which', ['edge-tts']);
      proc.on('close', (code) => resolve(code === 0));
      proc.on('error', () => resolve(false));
    });
  }

  async listVoices(): Promise<Voice[]> {
    if (this.voicesCache) {
      return this.voicesCache;
    }

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const proc = spawn('edge-tts', ['--list-voices']);

      proc.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));

      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`edge-tts --list-voices exited with code ${code}`));
          return;
        }

        const output = Buffer.concat(chunks).toString('utf-8');
        const voices = this.parseVoices(output);
        this.voicesCache = voices;
        resolve(voices);
      });

      proc.on('error', (err) => reject(err));
    });
  }

  async synthesize(options: SynthesisOptions): Promise<SynthesisResult> {
    const voice = options.voice ?? this.defaultVoice;
    const rate = options.speed ? `${options.speed > 1 ? '+' : ''}${Math.round((options.speed - 1) * 100)}%` : '+0%';

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const proc = spawn('edge-tts', [
        '--voice',
        voice,
        '--rate',
        rate,
        '--text',
        options.text,
        '--write-media',
        '/dev/stdout',
      ]);

      proc.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));

      proc.stderr.on('data', (data: Buffer) => {
        // edge-tts outputs progress to stderr, ignore it
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`edge-tts exited with code ${code}`));
          return;
        }

        const audio = Buffer.concat(chunks);
        resolve({
          audio,
          format: 'mp3',
          sampleRate: 24000,
          duration: 0, // MP3 duration requires parsing
        });
      });

      proc.on('error', (err) => reject(err));
    });
  }

  private parseVoices(output: string): Voice[] {
    const voices: Voice[] = [];
    const lines = output.split('\n');

    let currentVoice: Partial<Voice> = {};

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.startsWith('Name:')) {
        if (currentVoice.id) {
          voices.push(currentVoice as Voice);
        }
        currentVoice = {
          id: trimmed.replace('Name:', '').trim(),
          name: '',
          language: '',
        };
      } else if (trimmed.startsWith('ShortName:')) {
        currentVoice.name = trimmed.replace('ShortName:', '').trim();
      } else if (trimmed.startsWith('Locale:')) {
        currentVoice.language = trimmed.replace('Locale:', '').trim();
      } else if (trimmed.startsWith('Gender:')) {
        const gender = trimmed.replace('Gender:', '').trim().toLowerCase();
        if (gender === 'male' || gender === 'female') {
          currentVoice.gender = gender;
        }
      }
    }

    if (currentVoice.id) {
      voices.push(currentVoice as Voice);
    }

    return voices;
  }
}
