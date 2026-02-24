import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { useModelInfo } from './useLive2D';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('useLive2D hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useModelInfo', () => {
    it('fetches model info', async () => {
      const mockModelInfo = {
        expressions: ['f01', 'f02', 'f03', 'f04'],
        motions: {
          idle: 3,
          tap_body: 2,
          flick_head: 1,
        },
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockModelInfo),
      });

      const { result } = renderHook(() => useModelInfo(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockModelInfo);
      expect(result.current.data?.expressions).toHaveLength(4);
      expect(result.current.data?.motions.idle).toBe(3);
    });

    it('handles model not loaded', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Model not loaded' }),
      });

      const { result } = renderHook(() => useModelInfo(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error?.message).toBe('Model not loaded');
    });
  });
});
