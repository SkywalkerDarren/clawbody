import type {
  ISpeakerVerificationProvider,
  Speaker,
  VerificationResult,
  EnrollmentResult,
  SVConfig,
} from './interface.js';

export interface WeSpeakerProviderConfig {
  baseUrl: string;
  timeout?: number;
}

interface HealthResponse {
  status: string;
  model: string;
}

interface EnrollResponse {
  success: boolean;
  speaker_id: string;
  speaker_name: string;
  embedding_count: number;
  message: string | null;
}

interface VerifyResponse {
  verified: boolean;
  speaker_id: string | null;
  speaker_name: string | null;
  confidence: number;
  threshold: number;
}

interface SpeakerResponse {
  id: string;
  name: string;
  enrolled_at: string;
  embedding_count: number;
}

interface DeleteResponse {
  success: boolean;
}

interface ConfigResponse {
  model: string;
  threshold: number;
  device: string;
  apply_vad: boolean;
}

/**
 * WeSpeaker Speaker Verification Provider
 *
 * Communicates with Python WeSpeaker SV service via HTTP API
 */
export class WeSpeakerProvider implements ISpeakerVerificationProvider {
  readonly id = 'wespeaker';
  readonly name = 'WeSpeaker Speaker Verification';

  private baseUrl: string;
  private timeout: number;

  constructor(config: WeSpeakerProviderConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.timeout = config.timeout ?? 10000;
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

  async enroll(speakerId: string, speakerName: string, audio: Buffer): Promise<EnrollmentResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await fetch(`${this.baseUrl}/enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          speaker_id: speakerId,
          speaker_name: speakerName,
          audio: audio.toString('base64'),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`Enrollment failed: ${res.status} ${res.statusText}`);
      }

      const json = (await res.json()) as EnrollResponse;

      return {
        success: json.success,
        speakerId: json.speaker_id,
        speakerName: json.speaker_name,
        embeddingCount: json.embedding_count,
        message: json.message ?? undefined,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async verify(audio: Buffer): Promise<VerificationResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await fetch(`${this.baseUrl}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audio: audio.toString('base64'),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`Verification failed: ${res.status} ${res.statusText}`);
      }

      const json = (await res.json()) as VerifyResponse;

      return {
        verified: json.verified,
        speakerId: json.speaker_id,
        speakerName: json.speaker_name,
        confidence: json.confidence,
        threshold: json.threshold,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async listSpeakers(): Promise<Speaker[]> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await fetch(`${this.baseUrl}/speakers`, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`Failed to list speakers: ${res.status} ${res.statusText}`);
      }

      const json = (await res.json()) as SpeakerResponse[];

      return json.map((s) => ({
        id: s.id,
        name: s.name,
        enrolledAt: new Date(s.enrolled_at),
        embeddingCount: s.embedding_count,
      }));
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async deleteSpeaker(speakerId: string): Promise<boolean> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await fetch(`${this.baseUrl}/speakers/${encodeURIComponent(speakerId)}`, {
        method: 'DELETE',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`Failed to delete speaker: ${res.status} ${res.statusText}`);
      }

      const json = (await res.json()) as DeleteResponse;
      return json.success;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async getConfig(): Promise<SVConfig> {
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
        model: json.model,
        threshold: json.threshold,
        device: json.device,
        applyVAD: json.apply_vad,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async updateConfig(config: Partial<SVConfig>): Promise<void> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const body: Record<string, unknown> = {};

      if (config.threshold !== undefined) {
        body['threshold'] = config.threshold;
      }
      if (config.applyVAD !== undefined) {
        body['apply_vad'] = config.applyVAD;
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
