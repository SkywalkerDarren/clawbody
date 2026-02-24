import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { useSpeakers, useEnrollSpeaker, useDeleteSpeaker } from './useSpeakers';

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

describe('useSpeakers hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useSpeakers', () => {
    it('fetches speakers list', async () => {
      const mockSpeakers = [
        { id: 'user001', name: 'Test User', embeddingCount: 1 },
      ];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ speakers: mockSpeakers }),
      });

      const { result } = renderHook(() => useSpeakers(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockSpeakers);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/sv/speakers',
        expect.objectContaining({
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    it('handles empty speakers list', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ speakers: [] }),
      });

      const { result } = renderHook(() => useSpeakers(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual([]);
    });
  });

  describe('useEnrollSpeaker', () => {
    it('enrolls a new speaker', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            speakerId: 'user001',
            speakerName: 'Test User',
            embeddingCount: 1,
          }),
      });

      const { result } = renderHook(() => useEnrollSpeaker(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        speakerId: 'user001',
        speakerName: 'Test User',
        audio: 'base64audio',
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/sv/enroll',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            speakerId: 'user001',
            speakerName: 'Test User',
            audio: 'base64audio',
          }),
        })
      );
    });
  });

  describe('useDeleteSpeaker', () => {
    it('deletes a speaker', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const { result } = renderHook(() => useDeleteSpeaker(), {
        wrapper: createWrapper(),
      });

      result.current.mutate('user001');

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/sv/speakers/user001',
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });

    it('handles special characters in speaker id', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const { result } = renderHook(() => useDeleteSpeaker(), {
        wrapper: createWrapper(),
      });

      result.current.mutate('user/001');

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/sv/speakers/user%2F001',
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });
  });
});
