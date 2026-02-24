import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Import hooks after mocking
import { usePipelineStatus, useEnablePipeline, useDisablePipeline } from './usePipeline';

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

describe('usePipeline hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('usePipelineStatus', () => {
    it('fetches pipeline status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ enabled: true }),
      });

      const { result } = renderHook(() => usePipelineStatus(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual({ enabled: true });
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/pipeline',
        expect.objectContaining({
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    it('handles error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Server error' }),
      });

      const { result } = renderHook(() => usePipelineStatus(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error?.message).toBe('Server error');
    });
  });

  describe('useEnablePipeline', () => {
    it('enables pipeline', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ enabled: true }),
      });

      const { result } = renderHook(() => useEnablePipeline(), {
        wrapper: createWrapper(),
      });

      result.current.mutate();

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/pipeline/enable',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });
  });

  describe('useDisablePipeline', () => {
    it('disables pipeline', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ enabled: false }),
      });

      const { result } = renderHook(() => useDisablePipeline(), {
        wrapper: createWrapper(),
      });

      result.current.mutate();

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/pipeline/disable',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });
  });
});
