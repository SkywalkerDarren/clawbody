import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { useListen } from './useSTT';

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

describe('useSTT hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useListen', () => {
    it('sends listen request and returns transcription', async () => {
      const mockResponse = {
        ok: true,
        text: 'Hello world',
        language: 'en',
        duration: 2.5,
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { result } = renderHook(() => useListen(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ audio: 'base64audiodata' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/listen',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ audio: 'base64audiodata' }),
        })
      );
      expect(result.current.data?.text).toBe('Hello world');
      expect(result.current.data?.duration).toBe(2.5);
    });

    it('sends listen request with language option', async () => {
      const mockResponse = {
        ok: true,
        text: '你好世界',
        language: 'zh',
        duration: 1.8,
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { result } = renderHook(() => useListen(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ audio: 'base64audiodata', language: 'zh' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/listen',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ audio: 'base64audiodata', language: 'zh' }),
        })
      );
    });

    it('handles STT error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'STT service unavailable' }),
      });

      const { result } = renderHook(() => useListen(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ audio: 'base64audiodata' });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error?.message).toBe('STT service unavailable');
    });
  });
});
