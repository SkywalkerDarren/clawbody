/**
 * 支持的语言
 */
export type SupportedLanguage =
  | 'auto' // 自动检测
  | 'zh' // 中文
  | 'en' // 英文
  | 'ja' // 日文
  | 'ko' // 韩文
  | 'yue' // 粤语
  | 'wuu'; // 吴语

/**
 * 音频格式
 */
export interface AudioFormat {
  sampleRate: number; // 采样率 (16000, 24000, 48000)
  channels: number; // 声道数 (1 = mono, 2 = stereo)
  encoding: 'pcm_s16le' | 'pcm_f32le' | 'wav' | 'mp3' | 'opus';
}

/**
 * 转录选项
 */
export interface TranscriptionOptions {
  language?: SupportedLanguage;
  format?: AudioFormat;
  enableTimestamps?: boolean; // 是否返回时间戳
  enablePunctuation?: boolean; // 是否添加标点
  hotwords?: string[]; // 热词列表，提高识别准确率
}

/**
 * 转录片段
 */
export interface TranscriptSegment {
  text: string;
  startTime?: number; // 开始时间 (秒)
  endTime?: number; // 结束时间 (秒)
  confidence?: number; // 置信度 (0-1)
  isFinal: boolean; // 是否为最终结果
}

/**
 * 批量转录结果
 */
export interface TranscriptionResult {
  text: string; // 完整文本
  segments: TranscriptSegment[]; // 分段结果
  language: string; // 检测到的语言
  duration: number; // 音频时长 (秒)
}

/**
 * 流式会话状态
 */
export type SessionState = 'idle' | 'listening' | 'processing' | 'closed';

/**
 * 流式会话
 */
export interface StreamingSession {
  sessionId: string;
  state: SessionState;
  createdAt: Date;
  lastActivityAt: Date;
}

/**
 * STT 提供商接口
 */
export interface ISTTProvider {
  /** 提供商 ID */
  readonly id: string;

  /** 提供商名称 */
  readonly name: string;

  /** 支持的语言列表 */
  readonly supportedLanguages: SupportedLanguage[];

  /** 检查是否可用 */
  isAvailable(): Promise<boolean>;

  /** 批量转录 */
  transcribe(audio: Buffer, options?: TranscriptionOptions): Promise<TranscriptionResult>;

  /** 创建流式会话 */
  createStreamingSession(options?: TranscriptionOptions): Promise<StreamingSession>;

  /** 发送音频块到流式会话 */
  sendAudioChunk(sessionId: string, chunk: Buffer): Promise<TranscriptSegment | null>;

  /** 结束流式会话 */
  endStreamingSession(sessionId: string): Promise<TranscriptionResult>;

  /** 取消流式会话 */
  cancelStreamingSession(sessionId: string): Promise<void>;

  /** 流式转录 (AsyncIterable 接口) */
  transcribeStream(
    audioStream: AsyncIterable<Buffer>,
    options?: TranscriptionOptions
  ): AsyncIterable<TranscriptSegment>;
}
