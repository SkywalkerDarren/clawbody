import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '../api-client';
import { PipelineStatusSchema, PipelineResponseSchema, type PipelineStatus } from '../schemas';

export const PIPELINE_QUERY_KEY = ['pipeline'] as const;

export function usePipelineStatus() {
  return useQuery({
    queryKey: PIPELINE_QUERY_KEY,
    queryFn: () => apiGet('/pipeline', PipelineStatusSchema),
    refetchInterval: 30_000,
  });
}

export function useEnablePipeline() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiPost('/pipeline/enable', PipelineResponseSchema),
    onSuccess: (data) => {
      queryClient.setQueryData<PipelineStatus>(PIPELINE_QUERY_KEY, {
        enabled: data.enabled,
      });
    },
  });
}

export function useDisablePipeline() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiPost('/pipeline/disable', PipelineResponseSchema),
    onSuccess: (data) => {
      queryClient.setQueryData<PipelineStatus>(PIPELINE_QUERY_KEY, {
        enabled: data.enabled,
      });
    },
  });
}
