import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api, apiGet, apiPost } from './api';

describe('API Client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('makes GET requests', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: 'test' }),
    } as Response);

    const result = await apiGet<{ data: string }>('/test');

    expect(fetch).toHaveBeenCalledWith(
      '/api/test',
      expect.objectContaining({
        headers: { 'Content-Type': 'application/json' },
      })
    );
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ data: 'test' });
  });

  it('makes POST requests with body', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    } as Response);

    const result = await apiPost('/test', { foo: 'bar' });

    expect(fetch).toHaveBeenCalledWith(
      '/api/test',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ foo: 'bar' }),
      })
    );
    expect(result.success).toBe(true);
  });

  it('handles errors', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: 'Not found' }),
    } as Response);

    const result = await api('/test');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Not found');
  });

  it('handles network errors', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

    const result = await api('/test');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Network error');
  });
});
