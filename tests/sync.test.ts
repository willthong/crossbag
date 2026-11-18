import { describe, expect, it, vi } from 'vitest';
import { runSync, type SyncDeps } from '../src/plugin';
import type { WallabagConfig } from '../src/wallabag';

const CONFIG: WallabagConfig = {
  server_url: 'https://wallabag.example.com',
  client_id: 'crossbag-client',
  client_secret: 'client-secret',
  username: 'reader',
  password: 'hunter2',
  sync_limit: 50,
};

function configWithLimit(syncLimit: number): WallabagConfig {
  return { ...CONFIG, sync_limit: syncLimit };
}

/** A wallabag article, with the minimum fields the entries schema requires. */
function entry(id: number, title = `Article ${id}`): Record<string, unknown> {
  return {
    id,
    title,
    url: `https://example.com/articles/${id}`,
    domain_name: 'example.com',
    created_at: '2024-01-01T00:00:00+0000',
    updated_at: '2024-01-01T00:00:00+0000',
    is_archived: 0,
    is_starred: 0,
    tags: [],
  };
}

function entriesPage(
  ids: number[],
  meta: { page?: number; pages?: number } = {},
): string {
  return JSON.stringify({
    page: meta.page ?? 1,
    pages: meta.pages ?? 1,
    total: ids.length,
    _embedded: { items: ids.map((id) => entry(id)) },
  });
}

function tokenResponse(token = 'test-token'): string {
  return JSON.stringify({
    access_token: token,
    expires_in: 3600,
    token_type: 'bearer',
    refresh_token: 'refresh-token',
    scope: null,
  });
}

function readPageNumber(url: string): number {
  const page = new URL(url).searchParams.get('page');
  return page === null ? 1 : Number(page);
}

function articleIdFromUrl(url: string): number {
  const match = /\/api\/entries\/(\d+)\/export\.epub$/.exec(url);
  const id = match?.[1];
  if (id === undefined) {
    throw new Error(`unexpected export URL: ${url}`);
  }
  return Number(id);
}

function decodeBase64(data: string): string {
  return Buffer.from(data, 'base64').toString('utf8');
}

interface FetchOutcome {
  status: number;
  bytes: number;
  complete: boolean;
}

interface HarnessOptions {
  pages: number[][];
  files?: string[];
  syncState?: unknown;
  sidecars?: Record<string, string>;
  token?: string;
  tokenError?: { status: number; body: string };
  tokenThrows?: Error;
  fetchOutcome?: (id: number) => FetchOutcome | Promise<FetchOutcome>;
  listError?: Error;
  pageError?: (
    page: number,
  ) => Error | { status: number; body: string } | undefined;
}

function makeHarness(options: HarnessOptions) {
  const token = options.token ?? 'test-token';
  const writes: { path: string; data: string }[] = [];
  const fetchCalls: {
    id: number;
    url: string;
    dest: string;
    headers: Record<string, string>;
  }[] = [];

  const relay = vi.fn<SyncDeps['relay']>(async (_method, url) => {
    if (url.endsWith('/oauth/v2/token')) {
      if (options.tokenThrows !== undefined) {
        throw options.tokenThrows;
      }
      if (options.tokenError !== undefined) {
        return options.tokenError;
      }
      return { status: 200, body: tokenResponse(token) };
    }

    const page = readPageNumber(url);
    const failure = options.pageError?.(page);
    if (failure instanceof Error) {
      throw failure;
    }
    if (failure !== undefined) {
      return failure;
    }

    const ids = options.pages[page - 1] ?? [];
    return {
      status: 200,
      body: entriesPage(ids, { page, pages: options.pages.length }),
    };
  });

  const fetchToSd = vi.fn<SyncDeps['fetchToSd']>(async (url, dest, headers) => {
    const id = articleIdFromUrl(url);
    fetchCalls.push({ id, url, dest, headers });
    const outcome = options.fetchOutcome?.(id) ?? {
      status: 200,
      bytes: 4096,
      complete: true,
    };
    return await outcome;
  });

  const writeFile = vi.fn<SyncDeps['writeFile']>(async (path, dataB64) => {
    writes.push({ path, data: dataB64 });
    return { ok: true };
  });

  const listFiles = vi.fn<SyncDeps['listFiles']>(async () => {
    if (options.listError !== undefined) {
      throw options.listError;
    }
    return options.files ?? [];
  });

  const readFile = vi.fn<SyncDeps['readFile']>(async (path) => {
    if (path.endsWith('sync-state.json')) {
      if (options.syncState === undefined) {
        throw new Error('sync-state.json not found');
      }
      return JSON.stringify(options.syncState);
    }

    const name = path.split('/').pop() ?? path;
    const sidecar = options.sidecars?.[name];
    if (sidecar === undefined) {
      throw new Error(`${path} not found`);
    }
    return sidecar;
  });

  const deps: SyncDeps = {
    relay,
    fetchToSd,
    writeFile,
    listFiles,
    readFile,
  };

  return {
    deps,
    relay,
    fetchToSd,
    writeFile,
    listFiles,
    readFile,
    writes,
    fetchCalls,
  };
}

describe('runSync authentication', () => {
  it('requests a token first, then sends it as a bearer header', async () => {
    const harness = makeHarness({ pages: [[11]], token: 'tok-123' });

    await runSync(harness.deps, configWithLimit(5));

    const [first] = harness.relay.mock.calls;
    expect(first?.[0]).toBe('POST');
    expect(first?.[1]).toBe(`${CONFIG.server_url}/oauth/v2/token`);

    const body = String(first?.[3]);
    expect(() => JSON.parse(body)).toThrow();
    const form = new URLSearchParams(body);
    expect(form.get('grant_type')).toBe('password');
    expect(form.get('client_id')).toBe(CONFIG.client_id);
    expect(form.get('client_secret')).toBe(CONFIG.client_secret);
    expect(form.get('username')).toBe(CONFIG.username);
    expect(form.get('password')).toBe(CONFIG.password);

    const headers = first?.[2] ?? {};
    expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded');

    const entryCalls = harness.relay.mock.calls.slice(1);
    expect(entryCalls.length).toBeGreaterThan(0);
    for (const call of entryCalls) {
      expect(call[2].Authorization).toBe('Bearer tok-123');
    }
  });

  it("surfaces wallabag's error when the token is rejected", async () => {
    const harness = makeHarness({
      pages: [[]],
      tokenError: {
        status: 400,
        body: JSON.stringify({ error: 'invalid_grant' }),
      },
    });

    await expect(runSync(harness.deps, configWithLimit(5))).rejects.toThrow(
      /invalid_grant/,
    );

    expect(harness.fetchToSd).not.toHaveBeenCalled();
  });

  it('explains a device relay failure in words', async () => {
    const harness = makeHarness({
      pages: [[]],
      tokenThrows: new Error(
        '/api/relay 502: relay failed; large bodies need /api/fetch',
      ),
    });

    await expect(runSync(harness.deps, configWithLimit(5))).rejects.toThrow(
      /could not reach the server[\s\S]*check the server URL/,
    );

    expect(harness.fetchToSd).not.toHaveBeenCalled();
  });
});

describe('runSync device files', () => {
  it('reads sync-state and sidecars from the device, not the server', async () => {
    const harness = makeHarness({
      pages: [],
      files: ['On the beach.epub', 'On the beach.epub.meta.json'],
      sidecars: {
        'On the beach.epub.meta.json': JSON.stringify({ book_id: 99 }),
      },
    });

    await runSync(harness.deps, configWithLimit(5));

    expect(harness.readFile).toHaveBeenCalledWith('sync-state.json');
    expect(harness.readFile).toHaveBeenCalledWith(
      '/Wallabag/On the beach.epub.meta.json',
    );
    for (const call of harness.relay.mock.calls) {
      expect(String(call[1])).not.toContain('/download?path=');
    }
  });

  it('skips an article whose catalog sidecar records its id', async () => {
    const harness = makeHarness({
      pages: [[99]],
      files: ['On the beach.epub', 'On the beach.epub.meta.json'],
      sidecars: {
        'On the beach.epub.meta.json': JSON.stringify({ book_id: 99 }),
      },
    });

    const result = await runSync(harness.deps, configWithLimit(5));

    expect(harness.fetchToSd).not.toHaveBeenCalled();
    expect(result.pulled).toBe(0);
  });

  it('tolerates one unreadable sidecar without failing the sync', async () => {
    const harness = makeHarness({
      pages: [[1]],
      files: [
        'Broken.epub',
        'Broken.epub.meta.json',
        'Fine.epub',
        'Fine.epub.meta.json',
      ],
      sidecars: { 'Fine.epub.meta.json': JSON.stringify({ book_id: 2 }) },
    });

    const result = await runSync(harness.deps, configWithLimit(5));

    expect(result.pulled).toBe(1);
    expect(harness.fetchCalls.map((call) => call.id)).toEqual([1]);
  });
});

describe('runSync paging', () => {
  it('pages unread metadata entries 16 at a time', async () => {
    const harness = makeHarness({ pages: [[1], [2]] });

    await runSync(harness.deps, configWithLimit(5));

    const urls = harness.relay.mock.calls
      .slice(1)
      .map((call) => new URL(String(call[1])));
    expect(urls).toHaveLength(2);

    for (const url of urls) {
      expect(url.pathname).toBe('/api/entries');
      expect(url.searchParams.get('archive')).toBe('0');
      expect(url.searchParams.get('detail')).toBe('metadata');
      expect(url.searchParams.get('perPage')).toBe('16');
    }

    expect(urls.map((url) => url.searchParams.get('page'))).toEqual(['1', '2']);
  });
});

describe('runSync truncated paging', () => {
  it('marks the result interrupted when a page request throws', async () => {
    const harness = makeHarness({
      pages: [[1], [2]],
      pageError: (page) =>
        page === 2 ? new Error('connection reset') : undefined,
    });

    const result = await runSync(harness.deps, configWithLimit(5));

    expect(result).toMatchObject({
      pulled: 1,
      interrupted: true,
      reachedEnd: false,
      limitHit: false,
    });
  });

  it('marks the result interrupted when a page returns non-2xx', async () => {
    const harness = makeHarness({
      pages: [[1], [2]],
      pageError: (page) =>
        page === 2 ? { status: 503, body: '' } : undefined,
    });

    const result = await runSync(harness.deps, configWithLimit(5));

    expect(result).toMatchObject({ pulled: 1, interrupted: true });
    expect(result.reachedEnd).toBe(false);
  });
});

describe('runSync downloads', () => {
  it('downloads each unread article into /Wallabag as an EPUB', async () => {
    const harness = makeHarness({ pages: [[7, 8]] });

    const result = await runSync(harness.deps, configWithLimit(5));

    expect(harness.fetchCalls.map((call) => call.id)).toEqual([7, 8]);
    for (const call of harness.fetchCalls) {
      const expected = `${CONFIG.server_url}/api/entries/${call.id}/export.epub`;
      expect(call.url).toBe(expected);
      expect(call.dest.startsWith('/Wallabag/')).toBe(true);
      expect(call.dest.endsWith('.epub')).toBe(true);
      expect(call.headers.Authorization).toBe('Bearer test-token');
    }
    expect(result.pulled).toBe(2);
  });
});

describe('runSync batching', () => {
  it('stops at sync_limit and reports that more articles remain', async () => {
    const harness = makeHarness({ pages: [[1, 2, 3, 4, 5]] });

    const result = await runSync(harness.deps, configWithLimit(2));

    expect(harness.fetchToSd).toHaveBeenCalledTimes(2);
    expect(result.pulled).toBe(2);
    expect(result.limitHit).toBe(true);
    expect(result.reachedEnd).toBe(false);
  });

  it('skips a pulled article and fills the batch from the next page', async () => {
    const harness = makeHarness({
      pages: [[1, 2], [3, 4]],
      files: ['Article 1.epub'],
      syncState: { articles: { '1': { filename: 'Article 1.epub' } } },
    });

    const result = await runSync(harness.deps, configWithLimit(2));

    expect(harness.fetchCalls.map((call) => call.id)).toEqual([2, 3]);
    expect(result.pulled).toBe(2);
    expect(harness.relay.mock.calls).toHaveLength(3);
  });
});

describe('runSync presence-aware dedupe', () => {
  it('re-downloads an article whose recorded EPUB was deleted', async () => {
    const harness = makeHarness({
      pages: [[5]],
      files: ['Something else.epub'],
      syncState: {
        articles: { '5': { filename: 'Gone.epub', status: 'pulled' } },
      },
    });

    const result = await runSync(harness.deps, configWithLimit(5));

    expect(harness.fetchCalls.map((call) => call.id)).toEqual([5]);
    expect(result.pulled).toBe(1);
    expect(result.skipped).toBe(0);
  });
});

describe('runSync failure handling', () => {
  it('counts 404 and 410 downloads as skipped, not failed', async () => {
    const harness = makeHarness({
      pages: [[1, 2]],
      fetchOutcome: (id) => ({
        status: id === 1 ? 404 : 410,
        bytes: 0,
        complete: false,
      }),
    });

    const result = await runSync(harness.deps, configWithLimit(5));

    expect(result).toMatchObject({ pulled: 0, failed: 0, skipped: 2 });
  });

  it('counts server errors and network rejections as failed', async () => {
    const harness = makeHarness({
      pages: [[1, 2]],
      fetchOutcome: (id) =>
        id === 1
          ? { status: 500, bytes: 0, complete: false }
          : Promise.reject(new Error('connection reset')),
    });

    const result = await runSync(harness.deps, configWithLimit(5));

    expect(result).toMatchObject({ pulled: 0, failed: 2, skipped: 0 });
  });

  it('aborts without downloading when the /Wallabag listing fails', async () => {
    const harness = makeHarness({
      pages: [[1, 2]],
      listError: new Error('listing unavailable'),
    });

    await expect(runSync(harness.deps, configWithLimit(5))).rejects.toThrow(
      /Wallabag|listing/i,
    );

    expect(harness.fetchToSd).not.toHaveBeenCalled();
  });
});

describe('runSync sync-state', () => {
  it('writes sync-state.json once with each pulled id and filename', async () => {
    const harness = makeHarness({ pages: [[1, 2]] });

    await runSync(harness.deps, configWithLimit(5));

    expect(harness.writeFile).toHaveBeenCalledTimes(1);
    const [write] = harness.writes;
    expect(write?.path).toMatch(/sync-state\.json$/);
    expect(write?.path.startsWith('/Wallabag')).toBe(false);

    const state = JSON.parse(decodeBase64(write?.data ?? '')) as {
      articles: Record<string, { filename: string; status: string }>;
    };
    const destById = new Map(
      harness.fetchCalls.map((call) => [call.id, call.dest]),
    );
    for (const id of [1, 2]) {
      const dest = destById.get(id) ?? '';
      expect(state.articles[String(id)]?.filename).toBe(dest.split('/').pop());
      expect(state.articles[String(id)]?.status).toBe('pulled');
    }
  });

  it('records skipped and failed attempts with their status', async () => {
    const harness = makeHarness({
      pages: [[1, 2, 3]],
      fetchOutcome: (id) => {
        if (id === 1) return { status: 404, bytes: 0, complete: false };
        if (id === 2) return { status: 500, bytes: 0, complete: false };
        return { status: 200, bytes: 1024, complete: true };
      },
    });

    await runSync(harness.deps, configWithLimit(5));

    const [write] = harness.writes;
    const state = JSON.parse(decodeBase64(write?.data ?? '')) as {
      articles: Record<string, { status: string }>;
    };

    expect(state.articles['1']?.status).toBe('skipped');
    expect(state.articles['2']?.status).toBe('failed');
    expect(state.articles['3']?.status).toBe('pulled');
  });

  it('writes the ledger in a finally when the batch errors mid-way', async () => {
    const harness = makeHarness({ pages: [[1, 2]] });

    await expect(
      runSync(harness.deps, configWithLimit(5), (attempted) => {
        if (attempted >= 1) {
          throw new Error('progress handler failed');
        }
      }),
    ).rejects.toThrow(/progress handler failed/);

    const [write] = harness.writes;
    const state = JSON.parse(decodeBase64(write?.data ?? '')) as {
      articles: Record<string, { status: string }>;
    };

    expect(state.articles['1']?.status).toBe('pulled');
  });
});

describe('runSync summary', () => {
  it('accounts for every attempted article', async () => {
    const harness = makeHarness({
      pages: [[1, 2, 3, 4]],
      fetchOutcome: (id) => {
        if (id === 2) {
          return { status: 404, bytes: 0, complete: false };
        }
        if (id === 3) {
          return { status: 503, bytes: 0, complete: false };
        }
        return { status: 200, bytes: 2048, complete: true };
      },
    });

    const result = await runSync(harness.deps, configWithLimit(10));

    expect(result).toMatchObject({ pulled: 2, failed: 1, skipped: 1 });
    const attempted = harness.fetchToSd.mock.calls.length;
    expect(result.pulled + result.failed + result.skipped).toBe(attempted);
  });

  it('reports reachedEnd when the list runs out before the limit', async () => {
    const harness = makeHarness({ pages: [[1]] });

    const result = await runSync(harness.deps, configWithLimit(5));

    expect(result).toMatchObject({
      pulled: 1,
      reachedEnd: true,
      limitHit: false,
    });
  });
});
