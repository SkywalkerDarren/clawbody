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
    mutationFn: (data: SpeakRequest) => apiPost('/speak/stream', SpeakResponseSchema, data),
  });
}
