import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '../api-client';
import { SVConfigSchema, type SVConfig } from '../schemas';

export const SV_CONFIG_QUERY_KEY = ['sv-config'] as const;

export function useSVConfig() {
  return useQuery({
    queryKey: SV_CONFIG_QUERY_KEY,
    queryFn: () => apiGet('/sv/config', SVConfigSchema),
  });
}

export function useUpdateSVConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<SVConfig>) => apiPost('/sv/config', SVConfigSchema, data),
    onSuccess: (data) => {
      queryClient.setQueryData<SVConfig>(SV_CONFIG_QUERY_KEY, data);
    },
  });
}
