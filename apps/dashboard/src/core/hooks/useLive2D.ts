import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api-client';
import { ModelInfoSchema } from '../schemas';

export const MODEL_INFO_QUERY_KEY = ['model-info'] as const;

export function useModelInfo() {
  return useQuery({
    queryKey: MODEL_INFO_QUERY_KEY,
    queryFn: () => apiGet('/model-info', ModelInfoSchema),
    retry: false,
  });
}
