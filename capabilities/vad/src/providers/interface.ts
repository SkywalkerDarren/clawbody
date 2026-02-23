/**
 * VAD 检测结果
 */
export interface VADSegment {
  start: number; // 开始时间 (秒)
  end: number; // 结束时间 (秒)
  confidence: number; // 置信度 (0-1)
  isSpeech: boolean; // 是否为语音
}

/**
 * VAD 事件类型
 */
export type VADEventType = 'speech_start' | 'speech_end' | 'speech_segment';

/**
 * VAD 事件
 */
export interface VADEvent {
  type: VADEventType;
  timestamp: number;
  segment?: VADSegment;
  audioBuffer?: Buffer; // speech_end 时包含完整音频
}

/**
 * VAD 配置
 */
export interface VADConfig {
  threshold?: number; // 语音检测阈值 (0-1, 默认 0.5)
  minSpeechDurationMs?: number; // 最小语音时长 (默认 250ms)
  minSilenceDurationMs?: number; // 最小静音时长，用于判断说话结束 (默认 500ms)
  speechPadMs?: number; // 语音前后填充 (默认 300ms)
  sampleRate?: number; // 采样率 (默认 16000)
}

/**
 * VAD 提供商接口
 */
export interface IVADProvider {
  /** 提供商 ID */
  readonly id: string;

  /** 提供商名称 */
  readonly name: string;

  /** 检查是否可用 */
  isAvailable(): Promise<boolean>;

  /** 处理音频块，返回 VAD 事件 */
  processChunk(audio: Buffer): Promise<VADEvent | null>;

  /** 重置状态 */
  reset(): Promise<void>;

  /** 获取当前配置 */
  getConfig(): Promise<VADConfig>;

  /** 更新配置 */
  updateConfig(config: Partial<VADConfig>): Promise<void>;
}
