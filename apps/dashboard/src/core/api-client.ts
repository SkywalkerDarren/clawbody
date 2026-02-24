import { z } from 'zod';

const API_BASE = '/api';

export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiRequest<T>(
  endpoint: string,
  schema: z.ZodType<T>,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  const data: unknown = await response.json();

  if (!response.ok) {
    const errorData = data as { error?: string };
    throw new ApiError(errorData.error ?? `HTTP ${response.status}`, response.status);
  }

  const result = schema.safeParse(data);
  if (!result.success) {
    console.error('API response validation failed:', result.error);
    throw new ApiError(`Invalid API response: ${result.error.message}`);
  }

  return result.data;
}

export function apiGet<T>(endpoint: string, schema: z.ZodType<T>): Promise<T> {
  return apiRequest(endpoint, schema);
}

export function apiPost<T>(endpoint: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
  return apiRequest(endpoint, schema, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
}

export function apiDelete<T>(endpoint: string, schema: z.ZodType<T>): Promise<T> {
  return apiRequest(endpoint, schema, { method: 'DELETE' });
}

// Simple response schema for operations that return { ok: true } or similar
export const OkResponseSchema = z.object({
  ok: z.boolean().optional(),
  success: z.boolean().optional(),
  message: z.string().optional(),
});

export type OkResponse = z.infer<typeof OkResponseSchema>;
