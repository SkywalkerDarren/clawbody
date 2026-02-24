import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, OkResponseSchema } from '../api-client';
import { VADConfigSchema, type VADConfig } from '../schemas';

export const VAD_CONFIG_QUERY_KEY = ['vad-config'] as const;

export function useVADConfig() {
  return useQuery({
    queryKey: VAD_CONFIG_QUERY_KEY,
    queryFn: () => apiGet('/vad/config', VADConfigSchema),
  });
}

export function useUpdateVADConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<VADConfig>) => apiPost('/vad/config', VADConfigSchema, data),
    onSuccess: (data) => {
      queryClient.setQueryData<VADConfig>(VAD_CONFIG_QUERY_KEY, data);
    },
  });
}

export function useResetVAD() {
  return useMutation({
    mutationFn: () => apiPost('/vad/reset', OkResponseSchema),
  });
}
