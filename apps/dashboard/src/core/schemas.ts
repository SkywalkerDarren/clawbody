import { z } from 'zod';

// === Service Status ===
export const ServiceStatusSchema = z.object({
  status: z.enum(['ok', 'error', 'not_registered']),
  message: z.string().optional(),
  latency: z.number().optional(),
});

export type ServiceStatus = z.infer<typeof ServiceStatusSchema>;

// === Diagnostics ===
export const DiagnosticsSchema = z.object({
  gateway: z.object({
    status: z.string(),
    uptime: z.number(),
  }),
  services: z.record(z.string(), ServiceStatusSchema),
  openclaw: z.object({
    status: z.string(),
    message: z.string().optional(),
  }),
  overall: z.string(),
});

export type Diagnostics = z.infer<typeof DiagnosticsSchema>;

// === Pipeline ===
export const PipelineStatusSchema = z.object({
  enabled: z.boolean(),
  description: z.string().optional(),
});

export type PipelineStatus = z.infer<typeof PipelineStatusSchema>;

export const PipelineResponseSchema = z.object({
  enabled: z.boolean(),
  message: z.string().optional(),
});

export type PipelineResponse = z.infer<typeof PipelineResponseSchema>;

// === Speaker ===
export const SpeakerSchema = z.object({
  id: z.string(),
  name: z.string(),
  enrolledAt: z.coerce.date().optional(),
  embeddingCount: z.number().optional(),
});

export type Speaker = z.infer<typeof SpeakerSchema>;

// API returns { speakers: [...] }
export const SpeakersResponseSchema = z.object({
  speakers: z.array(SpeakerSchema),
});

export type SpeakersResponse = z.infer<typeof SpeakersResponseSchema>;

export const EnrollRequestSchema = z.object({
  speakerId: z.string().min(1, 'Speaker ID is required'),
  speakerName: z.string().min(1, 'Speaker name is required'),
  audio: z.string().min(1, 'Audio data is required'),
});

export type EnrollRequest = z.infer<typeof EnrollRequestSchema>;

export const EnrollResponseSchema = z.object({
  success: z.boolean(),
  speakerId: z.string().optional(),
  speakerName: z.string().optional(),
  embeddingCount: z.number().optional(),
  message: z.string().optional(),
});

export type EnrollResponse = z.infer<typeof EnrollResponseSchema>;

// === TTS ===
export const SpeakRequestSchema = z.object({
  text: z.string().min(1, 'Text is required'),
  emotion: z.string().optional(),
});

export type SpeakRequest = z.infer<typeof SpeakRequestSchema>;

export const SpeakResponseSchema = z.object({
  ok: z.boolean(),
  timings: z
    .object({
      expression_ms: z.number().optional(),
      motion_ms: z.number().optional(),
      tts_ms: z.number().optional(),
    })
    .optional(),
});

export type SpeakResponse = z.infer<typeof SpeakResponseSchema>;

// === STT ===
export const ListenRequestSchema = z.object({
  audio: z.string().min(1, 'Audio data is required'),
  language: z.string().optional(),
});

export type ListenRequest = z.infer<typeof ListenRequestSchema>;

export const ListenResponseSchema = z.object({
  ok: z.boolean(),
  text: z.string(),
  language: z.string().optional(),
  duration: z.number().optional(),
});

export type ListenResponse = z.infer<typeof ListenResponseSchema>;

// === VAD Config ===
export const VADConfigSchema = z.object({
  threshold: z.number().min(0).max(1),
  minSpeechDurationMs: z.number().min(0),
  minSilenceDurationMs: z.number().min(0),
  speechPadMs: z.number().min(0),
});

export type VADConfig = z.infer<typeof VADConfigSchema>;

// === SV Config ===
export const SVConfigSchema = z.object({
  threshold: z.number().min(0).max(1),
  applyVAD: z.boolean(),
});

export type SVConfig = z.infer<typeof SVConfigSchema>;

// === Live2D ===
export const ModelInfoSchema = z.object({
  expressions: z.array(z.string()),
  motions: z.record(z.string(), z.number()),
});

export type ModelInfo = z.infer<typeof ModelInfoSchema>;

// === Vision ===
export const ScreenshotSchema = z.object({
  base64: z.string(),
  width: z.number(),
  height: z.number(),
  timestamp: z.string(),
});

export type Screenshot = z.infer<typeof ScreenshotSchema>;

// === Health ===
export const HealthSchema = z.object({
  ok: z.boolean(),
  uptime: z.number().optional(),
  wsClients: z.number().optional(),
  sseClients: z.number().optional(),
});

export type Health = z.infer<typeof HealthSchema>;
