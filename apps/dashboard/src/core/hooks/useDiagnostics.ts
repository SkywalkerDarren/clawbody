import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api-client';
import { DiagnosticsSchema } from '../schemas';

export const DIAGNOSTICS_QUERY_KEY = ['diagnostics'] as const;

export function useDiagnostics() {
  return useQuery({
    queryKey: DIAGNOSTICS_QUERY_KEY,
    queryFn: () => apiGet('/diagnostics', DiagnosticsSchema),
    refetchInterval: 30_000,
  });
}
