/**
 * Speaker information
 */
export interface Speaker {
  id: string;
  name: string;
  enrolledAt: Date;
  embeddingCount: number;
}

/**
 * Verification result
 */
export interface VerificationResult {
  verified: boolean;
  speakerId: string | null;
  speakerName: string | null;
  confidence: number;
  threshold: number;
}

/**
 * Enrollment result
 */
export interface EnrollmentResult {
  success: boolean;
  speakerId: string;
  speakerName: string;
  embeddingCount: number;
  message?: string;
}

/**
 * Speaker Verification configuration
 */
export interface SVConfig {
  model: string;
  threshold: number;
  device: string;
  applyVAD: boolean;
}

/**
 * Speaker Verification Provider Interface
 */
export interface ISpeakerVerificationProvider {
  /** Provider ID */
  readonly id: string;

  /** Provider name */
  readonly name: string;

  /** Check if provider is available */
  isAvailable(): Promise<boolean>;

  /** Enroll a speaker with voice sample */
  enroll(speakerId: string, speakerName: string, audio: Buffer): Promise<EnrollmentResult>;

  /** Verify speaker identity */
  verify(audio: Buffer): Promise<VerificationResult>;

  /** List all enrolled speakers */
  listSpeakers(): Promise<Speaker[]>;

  /** Delete a speaker */
  deleteSpeaker(speakerId: string): Promise<boolean>;

  /** Get current configuration */
  getConfig(): Promise<SVConfig>;

  /** Update configuration */
  updateConfig(config: Partial<SVConfig>): Promise<void>;
}
