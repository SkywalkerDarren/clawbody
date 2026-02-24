import { useMutation } from '@tanstack/react-query';
import { apiPost } from '../api-client';
import { ListenResponseSchema, type ListenRequest } from '../schemas';

export function useListen() {
  return useMutation({
    mutationFn: (data: ListenRequest) => apiPost('/listen', ListenResponseSchema, data),
  });
}
