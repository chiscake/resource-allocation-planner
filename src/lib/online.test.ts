import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  fetchWithTimeout,
  withTimeout,
  probeSupabase,
  isLikelyNetworkFailure,
  NetworkTimeoutError,
  networkFailureMessage,
} from './online';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('withTimeout', () => {
  it('resolves when the promise finishes in time', async () => {
    await expect(withTimeout(Promise.resolve(42), 50)).resolves.toBe(42);
  });

  it('rejects with NetworkTimeoutError when slow', async () => {
    const slow = new Promise<number>((resolve) => setTimeout(() => resolve(1), 100));
    await expect(withTimeout(slow, 20)).rejects.toBeInstanceOf(NetworkTimeoutError);
  });
});

describe('fetchWithTimeout', () => {
  it('returns response from fetch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('ok', { status: 200 })),
    );
    const res = await fetchWithTimeout('https://example.test', { timeoutMs: 100 });
    expect(res.status).toBe(200);
  });

  it('times out', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(new DOMException('Aborted', 'AbortError'));
            });
          }),
      ),
    );
    await expect(
      fetchWithTimeout('https://example.test', { timeoutMs: 20 }),
    ).rejects.toBeInstanceOf(NetworkTimeoutError);
  });
});

describe('probeSupabase', () => {
  it('returns true on any HTTP response and hits rest/v1 with anon key', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 401 }));
    await expect(
      probeSupabase('http://127.0.0.1:54321', {
        fetchImpl,
        timeoutMs: 100,
        anonKey: 'test-key',
      }),
    ).resolves.toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:54321/rest/v1/',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ apikey: 'test-key' }),
      }),
    );
  });

  it('returns false on network failure', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(
      probeSupabase('http://127.0.0.1:54321', { fetchImpl, timeoutMs: 100 }),
    ).resolves.toBe(false);
  });
});

describe('toIdbValue', () => {
  it('round-trips plain data', async () => {
    const { toIdbValue } = await import('$lib/db/offline-idb');
    const input = { a: 1, nested: { b: 'x' } };
    expect(toIdbValue(input)).toEqual(input);
  });
});

describe('isLikelyNetworkFailure', () => {
  it('treats timeout as network failure', () => {
    expect(isLikelyNetworkFailure(new NetworkTimeoutError(5))).toBe(true);
  });

  it('networkFailureMessage prefers offline copy', () => {
    expect(networkFailureMessage(new NetworkTimeoutError(5), 'Нет сети')).toBe('Нет сети');
  });
});
