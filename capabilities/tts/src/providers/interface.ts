/**
 * 声音信息
 */
export interface Voice {
  id: string;
  name: string;
  language: string;
  gender?: 'male' | 'female' | 'neutral';
  preview?: string;
}

/**
 * 合成选项
 */
export interface SynthesisOptions {
  text: string;
  voice?: string;
  speed?: number;
  pitch?: number;
  format?: 'wav' | 'mp3' | 'opus';
}

/**
 * 合成结果
 */
export interface SynthesisResult {
  audio: Buffer;
  format: string;
  sampleRate: number;
  duration: number;
}

/**
 * TTS 提供商接口
 */
export interface ITTSProvider {
  /** 提供商 ID */
  readonly id: string;

  /** 提供商名称 */
  readonly name: string;

  /** 检查是否可用 */
  isAvailable(): Promise<boolean>;

  /** 获取可用声音列表 */
  listVoices(): Promise<Voice[]>;

  /** 合成语音 */
  synthesize(options: SynthesisOptions): Promise<SynthesisResult>;

  /** 流式合成 (可选) */
  synthesizeStream?(options: SynthesisOptions): AsyncIterable<Buffer>;
}
