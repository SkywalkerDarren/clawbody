import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { useVADConfig, useUpdateVADConfig, useResetVAD } from './useVAD';

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

describe('useVAD hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useVADConfig', () => {
    it('fetches VAD config', async () => {
      const mockConfig = {
        threshold: 0.5,
        minSpeechDurationMs: 250,
        minSilenceDurationMs: 300,
        speechPadMs: 30,
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockConfig),
      });

      const { result } = renderHook(() => useVADConfig(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockConfig);
    });
  });

  describe('useUpdateVADConfig', () => {
    it('updates VAD config', async () => {
      const updatedConfig = {
        threshold: 0.6,
        minSpeechDurationMs: 200,
        minSilenceDurationMs: 350,
        speechPadMs: 40,
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(updatedConfig),
      });

      const { result } = renderHook(() => useUpdateVADConfig(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ threshold: 0.6 });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/vad/config',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ threshold: 0.6 }),
        })
      );
    });
  });

  describe('useResetVAD', () => {
    it('resets VAD state', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });

      const { result } = renderHook(() => useResetVAD(), {
        wrapper: createWrapper(),
      });

      result.current.mutate();

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/vad/reset',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });
  });
});
