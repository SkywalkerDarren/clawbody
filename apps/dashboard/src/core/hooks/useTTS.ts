import { useMutation } from '@tanstack/react-query';
import { apiPost } from '../api-client';
import { SpeakResponseSchema, type SpeakRequest } from '../schemas';

export function useSpeak() {
  return useMutation({
    mutationFn: (data: SpeakRequest) => apiPost('/speak', SpeakResponseSchema, data),
  });
}

export function useSpeakStream() {
  return useMutation({
    mutationFn: async (data: SpeakRequest) => {
      // Stream endpoint returns SSE, not JSON - just trigger it and don't parse response
      // Audio will be played via SSE broadcast to Live2D frontend
      const response = await fetch('/api/speak/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error(`Stream request failed: ${response.status}`);
      }

      // Don't try to parse SSE as JSON, just return success
      return { ok: true };
    },
  });
}
