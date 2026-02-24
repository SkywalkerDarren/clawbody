import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api-client';
import { ScreenshotSchema } from '../schemas';

export const SCREENSHOT_QUERY_KEY = ['screenshot'] as const;

export function useScreenshot() {
  return useQuery({
    queryKey: SCREENSHOT_QUERY_KEY,
    queryFn: () => apiGet('/screen', ScreenshotSchema),
    enabled: false, // Manual trigger only
  });
}
