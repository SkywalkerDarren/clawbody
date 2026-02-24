import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { useSpeak, useSpeakStream } from './useTTS';

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

describe('useTTS hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useSpeak', () => {
    it('sends speak request', async () => {
      const mockResponse = {
        ok: true,
        timings: { tts_ms: 850 },
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { result } = renderHook(() => useSpeak(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ text: 'Hello world' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/speak',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ text: 'Hello world' }),
        })
      );
      expect(result.current.data?.timings?.tts_ms).toBe(850);
    });

    it('handles speak error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'TTS service unavailable' }),
      });

      const { result } = renderHook(() => useSpeak(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ text: 'Hello' });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error?.message).toBe('TTS service unavailable');
    });
  });

  describe('useSpeakStream', () => {
    it('sends stream speak request', async () => {
      const mockResponse = { ok: true };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { result } = renderHook(() => useSpeakStream(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ text: 'Stream test', emotion: 'happy' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/speak/stream',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ text: 'Stream test', emotion: 'happy' }),
        })
      );
    });
  });
});
