import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { useSVConfig, useUpdateSVConfig } from './useSVConfig';

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

describe('useSVConfig hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useSVConfig', () => {
    it('fetches SV config', async () => {
      const mockConfig = {
        threshold: 0.6,
        applyVAD: true,
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockConfig),
      });

      const { result } = renderHook(() => useSVConfig(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockConfig);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/sv/config',
        expect.objectContaining({
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });
  });

  describe('useUpdateSVConfig', () => {
    it('updates SV config threshold', async () => {
      const updatedConfig = {
        threshold: 0.7,
        applyVAD: true,
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(updatedConfig),
      });

      const { result } = renderHook(() => useUpdateSVConfig(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ threshold: 0.7 });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/sv/config',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ threshold: 0.7 }),
        })
      );
    });

    it('updates SV config applyVAD', async () => {
      const updatedConfig = {
        threshold: 0.6,
        applyVAD: false,
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(updatedConfig),
      });

      const { result } = renderHook(() => useUpdateSVConfig(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ applyVAD: false });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/sv/config',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ applyVAD: false }),
        })
      );
    });
  });
});
