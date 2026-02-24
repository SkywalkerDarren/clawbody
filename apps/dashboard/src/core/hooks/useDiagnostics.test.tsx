import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { useDiagnostics } from './useDiagnostics';

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

describe('useDiagnostics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches diagnostics data', async () => {
    const mockDiagnostics = {
      gateway: { status: 'ok', uptime: 3600 },
      services: {
        tts: { status: 'ok', latency: 15 },
        stt: { status: 'ok', latency: 20 },
      },
      openclaw: { status: 'ok' },
      overall: 'ok',
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockDiagnostics),
    });

    const { result } = renderHook(() => useDiagnostics(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockDiagnostics);
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/diagnostics',
      expect.objectContaining({
        headers: { 'Content-Type': 'application/json' },
      })
    );
  });

  it('handles degraded status', async () => {
    const mockDiagnostics = {
      gateway: { status: 'ok', uptime: 100 },
      services: {
        tts: { status: 'ok', latency: 15 },
        stt: { status: 'error', message: 'Connection failed' },
      },
      openclaw: { status: 'not_configured' },
      overall: 'degraded',
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockDiagnostics),
    });

    const { result } = renderHook(() => useDiagnostics(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.overall).toBe('degraded');
    expect(result.current.data?.services.stt.status).toBe('error');
  });

  it('handles fetch error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: 'Server unavailable' }),
    });

    const { result } = renderHook(() => useDiagnostics(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Server unavailable');
  });
});
