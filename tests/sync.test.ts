import { describe, expect, it, vi } from 'vitest';
import { runSync, type SyncDeps, type SyncProgress } from '../src/plugin';
import type { WallabagConfig } from '../src/wallabag';

const CONFIG: WallabagConfig = {
  server_url: 'https://wallabag.example.com',
  client_id: 'crossbag-client',
  client_secret: 'client-secret',
  username: 'reader',
  password: 'hunter2',
  sync_limit: 50,
  prune_on_sync: true,
  sync_favourites: false,
};

function configWithLimit(syncLimit: number): WallabagConfig {
  return { ...CONFIG, sync_limit: syncLimit };
}

function configWithPrefix(datePrefixedFilenames: boolean): WallabagConfig {
  return { ...CONFIG, date_prefixed_filenames: datePrefixedFilenames };
}

function configWithFavourites(syncFavourites: boolean): WallabagConfig {
  return { ...CONFIG, sync_favourites: syncFavourites };
}

/** A wallabag article, with the minimum fields the entries schema requires. */
function entry(
  id: number,
  title = `Article ${id}`,
  createdAt = '2024-01-01T00:00:00+0000',
): Record<string, unknown> {
  return {
    id,
    title,
    url: `https://example.com/articles/${id}`,
    domain_name: 'example.com',
    created_at: createdAt,
    updated_at: '2024-01-01T00:00:00+0000',
    is_archived: 0,
    is_starred: 0,
    tags: [],
  };
}

function entriesPage(
  ids: number[],
  meta: { page?: number; pages?: number; createdAt?: string } = {},
): string {
  return JSON.stringify({
    page: meta.page ?? 1,
    pages: meta.pages ?? 1,
    total: ids.length,
    _embedded: {
      items: ids.map((id) => entry(id, undefined, meta.createdAt)),
    },
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

/** The relay calls that paged the unread listing, excluding token and prune. */
function pageCalls(relay: { mock: { calls: unknown[][] } }): unknown[][] {
  return relay.mock.calls.filter((call) =>
    String(call[1]).includes('/api/entries?'),
  );
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
  starredPages?: number[][];
  files?: string[];
  syncState?: unknown;
  sidecars?: Record<string, string>;
  token?: string;
  tokenError?: { status: number; body: string };
  tokenThrows?: Error;
  fetchOutcome?: (id: number) => FetchOutcome | Promise<FetchOutcome>;
  listError?: Error;
  createdAt?: string;
  pageError?: (
    page: number,
  ) => Error | { status: number; body: string } | undefined;
  starredPageError?: (
    page: number,
  ) => Error | { status: number; body: string } | undefined;
  entryResponse?: (
    id: number,
  ) => Error | { status: number; body: string } | undefined;
  deleteStatus?: (path: string) => number;
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
  const deleteCalls: string[] = [];

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

    const entryId = /\/api\/entries\/(\d+)$/.exec(url)?.[1];
    if (entryId !== undefined) {
      const id = Number(entryId);
      const response = options.entryResponse?.(id) ?? {
        status: 200,
        body: JSON.stringify({ id, is_archived: 0 }),
      };
      if (response instanceof Error) {
        throw response;
      }
      return response;
    }

    const page = readPageNumber(url);
    const starred = new URL(url).searchParams.get('starred') === '1';
    const failure = starred
      ? options.starredPageError?.(page)
      : options.pageError?.(page);
    if (failure instanceof Error) {
      throw failure;
    }
    if (failure !== undefined) {
      return failure;
    }

    const pages = (starred ? options.starredPages : options.pages) ?? [];
    const ids = pages[page - 1] ?? [];
    return {
      status: 200,
      body: entriesPage(ids, {
        page,
        pages: pages.length,
        createdAt: options.createdAt,
      }),
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

  const deleteFile = vi.fn<SyncDeps['deleteFile']>(async (path) => {
    deleteCalls.push(path);
    return { status: options.deleteStatus?.(path) ?? 200 };
  });

  const deps: SyncDeps = {
    relay,
    fetchToSd,
    writeFile,
    listFiles,
    readFile,
    deleteFile,
  };

  return {
    deps,
    relay,
    fetchToSd,
    writeFile,
    listFiles,
    readFile,
    deleteFile,
    writes,
    fetchCalls,
    deleteCalls,
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
      tokenThrows: new Error('/api/relay 502: relay failed'),
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
  it('pages unread metadata entries 8 at a time', async () => {
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
      expect(url.searchParams.get('perPage')).toBe('8');
    }

    expect(urls.map((url) => url.searchParams.get('page'))).toEqual(['1', '2']);
  });
});

describe('runSync favourite articles', () => {
  it('walks the starred listing and downloads its articles when enabled', async () => {
    const harness = makeHarness({
      pages: [[]],
      starredPages: [[10, 11]],
    });

    const result = await runSync(harness.deps, configWithFavourites(true));

    const entryCalls = harness.relay.mock.calls
      .slice(1)
      .map((call) => ({ url: new URL(String(call[1])), call }));
    const starred = entryCalls.filter(
      ({ url }) => url.searchParams.get('starred') === '1',
    );

    expect(starred).toHaveLength(1);
    expect(starred[0]?.url.pathname).toBe('/api/entries');
    expect(starred[0]?.url.searchParams.get('detail')).toBe('metadata');
    expect(starred[0]?.url.searchParams.get('sort')).toBe('created');
    expect(starred[0]?.url.searchParams.get('order')).toBe('desc');
    expect(starred[0]?.url.searchParams.get('perPage')).toBe('8');
    expect(starred[0]?.call[2].Authorization).toBe('Bearer test-token');

    expect(harness.fetchCalls.map((call) => call.id)).toEqual([10, 11]);
    expect(result).toMatchObject({ pulled: 2, reachedEnd: true });
  });

  it('leaves the starred listing alone when the toggle is off or absent', async () => {
    for (const config of [configWithFavourites(false), CONFIG]) {
      const harness = makeHarness({
        pages: [[1]],
        starredPages: [[2]],
      });

      await runSync(harness.deps, config);

      expect(
        harness.relay.mock.calls.some((call) =>
          String(call[1]).includes('starred=1'),
        ),
      ).toBe(false);
      expect(harness.fetchCalls.map((call) => call.id)).toEqual([1]);
    }
  });

  it('downloads a starred unread article once, not once per walk', async () => {
    const harness = makeHarness({
      pages: [[1, 2]],
      starredPages: [[2, 3]],
    });

    const result = await runSync(harness.deps, configWithFavourites(true));

    expect(harness.fetchCalls.map((call) => call.id)).toEqual([1, 2, 3]);
    expect(result).toMatchObject({ pulled: 3, failed: 0, skipped: 0 });
  });

  it('spends the shared sync_limit unread-first, then favourites', async () => {
    const harness = makeHarness({
      pages: [[1, 2]],
      starredPages: [[2, 3, 4]],
    });

    const result = await runSync(harness.deps, {
      ...configWithFavourites(true),
      sync_limit: 3,
    });

    expect(harness.fetchCalls.map((call) => call.id)).toEqual([1, 2, 3]);
    expect(result).toMatchObject({ pulled: 3, limitHit: true });
    expect(result.reachedEnd).toBe(false);
  });

  it('re-pulls a pruned favourite when the toggle is later enabled', async () => {
    const harness = makeHarness({
      pages: [[]],
      starredPages: [[5]],
      files: [],
      syncState: {
        articles: { '5': { filename: 'Gone.epub', status: 'pulled' } },
      },
    });

    const result = await runSync(harness.deps, configWithFavourites(true));

    expect(harness.fetchCalls.map((call) => call.id)).toEqual([5]);
    expect(result.pruned).toBe(0);
    expect(result.pulled).toBe(1);
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
      stopReason: 'connection reset',
    });
  });

  it('marks the result interrupted when a page returns non-2xx', async () => {
    const harness = makeHarness({
      pages: [[1], [2]],
      pageError: (page) =>
        page === 2 ? { status: 503, body: '' } : undefined,
    });

    const result = await runSync(harness.deps, configWithLimit(5));

    expect(result).toMatchObject({
      pulled: 1,
      interrupted: true,
      stopReason: 'page 2: HTTP 503',
    });
    expect(result.reachedEnd).toBe(false);
  });

  it('retries at a smaller page size when the relay rejects the reply', async () => {
    const harness = makeHarness({ pages: [[1, 2, 3, 4]] });
    harness.relay.mockImplementation(async (_method, url) => {
      if (url.endsWith('/oauth/v2/token')) {
        return { status: 200, body: tokenResponse() };
      }

      const perPage = Number(new URL(url).searchParams.get('perPage'));
      if (perPage > 4) {
        throw new Error(
          '/api/relay 502: relay failed; large bodies need /api/fetch',
        );
      }

      const page = readPageNumber(url);
      const start = (page - 1) * perPage;
      return {
        status: 200,
        body: entriesPage([1, 2, 3, 4].slice(start, start + perPage), {
          page,
          pages: 1,
        }),
      };
    });

    const result = await runSync(harness.deps, configWithLimit(10));

    expect(result).toMatchObject({ pulled: 4, interrupted: false });
    expect(harness.fetchCalls.map((call) => call.id)).toEqual([1, 2, 3, 4]);
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

describe('runSync date-prefixed filenames', () => {
  it('prefixes a downloaded EPUB with its added date when enabled', async () => {
    const harness = makeHarness({ pages: [[1]] });

    await runSync(harness.deps, configWithPrefix(true));

    expect(harness.fetchCalls.map((call) => call.dest)).toEqual([
      '/Wallabag/240101-Article 1.epub',
    ]);
  });

  it('leaves filenames unprefixed when the flag is off or absent', async () => {
    const off = makeHarness({ pages: [[1]] });
    await runSync(off.deps, configWithPrefix(false));
    expect(off.fetchCalls.map((call) => call.dest)).toEqual([
      '/Wallabag/Article 1.epub',
    ]);

    const absent = makeHarness({ pages: [[1]] });
    await runSync(absent.deps, CONFIG);
    expect(absent.fetchCalls.map((call) => call.dest)).toEqual([
      '/Wallabag/Article 1.epub',
    ]);
  });

  it('falls back to the unprefixed name when created_at cannot be parsed', async () => {
    const harness = makeHarness({ pages: [[1]], createdAt: 'not-a-date' });

    const result = await runSync(harness.deps, configWithPrefix(true));

    expect(harness.fetchCalls.map((call) => call.dest)).toEqual([
      '/Wallabag/Article 1.epub',
    ]);
    expect(result.pulled).toBe(1);
  });

  it.each(['2024-13-45T00:00:00+0000', '2024-01-01junk'])(
    'downloads %s unprefixed without throwing',
    async (createdAt) => {
      const harness = makeHarness({ pages: [[1]], createdAt });

      const result = await runSync(harness.deps, configWithPrefix(true));

      expect(harness.fetchCalls.map((call) => call.dest)).toEqual([
        '/Wallabag/Article 1.epub',
      ]);
      expect(result.pulled).toBe(1);
    },
  );
});

describe('runSync phase progress', () => {
  it('reports each metadata page and then each download attempt', async () => {
    const harness = makeHarness({ pages: [[1, 2], [3]] });
    const events: { at: 'progress' | 'fetch'; value: unknown }[] = [];

    const fetchToSd = harness.deps.fetchToSd;
    harness.deps.fetchToSd = async (url, dest, headers) => {
      events.push({ at: 'fetch', value: articleIdFromUrl(url) });
      return await fetchToSd(url, dest, headers);
    };

    await runSync(harness.deps, configWithLimit(10), (...args: unknown[]) => {
      events.push({ at: 'progress', value: args[0] });
    });

    expect(events).toEqual([
      { at: 'progress', value: { phase: 'reading', page: 1, pages: 2 } },
      { at: 'progress', value: { phase: 'reading', page: 2, pages: 2 } },
      {
        at: 'progress',
        value: {
          phase: 'downloading',
          index: 1,
          total: 3,
          title: 'Article 1',
        },
      },
      { at: 'fetch', value: 1 },
      {
        at: 'progress',
        value: {
          phase: 'downloading',
          index: 2,
          total: 3,
          title: 'Article 2',
        },
      },
      { at: 'fetch', value: 2 },
      {
        at: 'progress',
        value: {
          phase: 'downloading',
          index: 3,
          total: 3,
          title: 'Article 3',
        },
      },
      { at: 'fetch', value: 3 },
    ]);
  });
});

describe('runSync progress total', () => {
  it('counts every unread article not on disk before downloading', async () => {
    const harness = makeHarness({ pages: [[1, 2], [3, 4, 5]] });
    const progress: SyncProgress[] = [];

    await runSync(harness.deps, configWithLimit(2), (event) => {
      progress.push(event);
    });

    const firstDownload = progress.findIndex(
      (event) => event.phase === 'downloading',
    );
    expect(progress[firstDownload]).toMatchObject({ index: 1, total: 5 });
    expect(progress.slice(0, firstDownload)).toEqual([
      { phase: 'reading', page: 1, pages: 2 },
      { phase: 'reading', page: 2, pages: 2 },
    ]);
    expect(harness.fetchCalls.map((call) => call.id)).toEqual([1, 2]);
  });

  it('leaves already-pulled articles out of the total', async () => {
    const harness = makeHarness({
      pages: [[1, 2], [3, 4]],
      files: ['Article 1.epub'],
      syncState: { articles: { '1': { filename: 'Article 1.epub' } } },
    });
    const progress: SyncProgress[] = [];

    await runSync(harness.deps, configWithLimit(10), (event) => {
      progress.push(event);
    });

    const downloads = progress.filter(
      (event) => event.phase === 'downloading',
    );
    expect(downloads[0]).toMatchObject({ index: 1, total: 3 });
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
    expect(pageCalls(harness.relay)).toHaveLength(2);
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
      runSync(harness.deps, configWithLimit(5), (progress) => {
        if (progress.phase === 'downloading' && progress.index >= 2) {
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

function archivedBody(id: number): string {
  return JSON.stringify({ id, is_archived: 1 });
}

function starredArchivedBody(id: number): string {
  return JSON.stringify({ id, is_archived: 1, is_starred: 1 });
}

function unreadBody(id: number): string {
  return JSON.stringify({ id, is_archived: 0 });
}

function writtenState(harness: { writes: { data: string }[] }): {
  articles: Record<string, unknown>;
} {
  const [write] = harness.writes;
  return JSON.parse(decodeBase64(write?.data ?? '')) as {
    articles: Record<string, unknown>;
  };
}

function entryCalls(relay: {
  mock: { calls: unknown[][] };
}): string[] {
  return relay.mock.calls
    .map((call) => String(call[1]))
    .filter((url) => /\/api\/entries\/\d+$/.test(url));
}

describe('runSync prune', () => {
  it('prunes an archived tracked EPUB and its sidecar', async () => {
    const harness = makeHarness({
      pages: [[]],
      files: ['Gone.epub', 'Gone.epub.meta.json'],
      syncState: {
        articles: { '5': { filename: 'Gone.epub', status: 'pulled' } },
      },
      entryResponse: (id) => ({ status: 200, body: archivedBody(id) }),
    });

    const result = await runSync(harness.deps, CONFIG);

    expect(result.pruned).toBe(1);
    expect(harness.deleteCalls).toEqual([
      '/Wallabag/Gone.epub',
      '/Wallabag/Gone.epub.meta.json',
    ]);
    expect(writtenState(harness).articles['5']).toBeUndefined();
  });

  it('prunes a tracked article the server answers 404 for', async () => {
    const harness = makeHarness({
      pages: [[]],
      files: ['Deleted upstream.epub'],
      syncState: {
        articles: {
          '7': { filename: 'Deleted upstream.epub', status: 'pulled' },
        },
      },
      entryResponse: () => ({ status: 404, body: '' }),
    });

    const result = await runSync(harness.deps, CONFIG);

    expect(result.pruned).toBe(1);
    expect(harness.deleteCalls).toEqual(['/Wallabag/Deleted upstream.epub']);
    expect(writtenState(harness).articles['7']).toBeUndefined();
  });

  it('keeps an archived favourite while sync_favourites is on', async () => {
    const harness = makeHarness({
      pages: [[]],
      files: ['Favourite.epub', 'Favourite.epub.meta.json'],
      syncState: {
        articles: { '10': { filename: 'Favourite.epub', status: 'pulled' } },
      },
      entryResponse: (id) => ({
        status: 200,
        body: starredArchivedBody(id),
      }),
    });

    const result = await runSync(harness.deps, configWithFavourites(true));

    expect(result.pruned).toBe(0);
    expect(harness.deleteCalls).toEqual([]);
    expect(writtenState(harness).articles['10']).toBeDefined();
  });

  it('prunes an archived favourite when sync_favourites is off', async () => {
    const harness = makeHarness({
      pages: [[]],
      files: ['Favourite.epub'],
      syncState: {
        articles: { '10': { filename: 'Favourite.epub', status: 'pulled' } },
      },
      entryResponse: (id) => ({
        status: 200,
        body: starredArchivedBody(id),
      }),
    });

    const result = await runSync(harness.deps, configWithFavourites(false));

    expect(result.pruned).toBe(1);
    expect(harness.deleteCalls).toEqual(['/Wallabag/Favourite.epub']);
    expect(writtenState(harness).articles['10']).toBeUndefined();
  });

  it('prunes an archived unstarred article while sync_favourites is on', async () => {
    const harness = makeHarness({
      pages: [[]],
      files: ['Unstarred.epub'],
      syncState: {
        articles: { '11': { filename: 'Unstarred.epub', status: 'pulled' } },
      },
      entryResponse: (id) => ({ status: 200, body: archivedBody(id) }),
    });

    const result = await runSync(harness.deps, configWithFavourites(true));

    expect(result.pruned).toBe(1);
    expect(harness.deleteCalls).toEqual(['/Wallabag/Unstarred.epub']);
    expect(writtenState(harness).articles['11']).toBeUndefined();
  });

  it('keeps an unread tracked article and its ledger entry', async () => {
    const harness = makeHarness({
      pages: [[]],
      files: ['Still unread.epub'],
      syncState: {
        articles: {
          '9': { filename: 'Still unread.epub', status: 'pulled' },
        },
      },
      entryResponse: (id) => ({ status: 200, body: unreadBody(id) }),
    });

    const result = await runSync(harness.deps, CONFIG);

    expect(result.pruned).toBe(0);
    expect(harness.deleteCalls).toEqual([]);
    expect(writtenState(harness).articles['9']).toBeDefined();
  });

  it.each([
    ['a network error', () => new Error('/api/relay 502: relay failed')],
    ['a 500', () => ({ status: 500, body: '' })],
    ['a malformed body', () => ({ status: 200, body: 'not json' })],
    [
      'a body without is_archived',
      () => ({ status: 200, body: JSON.stringify({ id: 3 }) }),
    ],
  ])('deletes nothing after %s', async (_label, entryResponse) => {
    const harness = makeHarness({
      pages: [[]],
      files: ['Ambiguous.epub'],
      syncState: {
        articles: { '3': { filename: 'Ambiguous.epub', status: 'pulled' } },
      },
      entryResponse,
    });

    const result = await runSync(harness.deps, CONFIG);

    expect(result.pruned).toBe(0);
    expect(harness.deleteCalls).toEqual([]);
    expect(writtenState(harness).articles['3']).toBeDefined();
  });

  it('prunes a catalog-pulled article tracked only by its sidecar', async () => {
    const harness = makeHarness({
      pages: [[]],
      files: ['Catalog book.epub', 'Catalog book.epub.meta.json'],
      sidecars: {
        'Catalog book.epub.meta.json': JSON.stringify({ book_id: 42 }),
      },
      entryResponse: (id) => ({ status: 200, body: archivedBody(id) }),
    });

    const result = await runSync(harness.deps, CONFIG);

    expect(result.pruned).toBe(1);
    expect(harness.deleteCalls).toEqual([
      '/Wallabag/Catalog book.epub',
      '/Wallabag/Catalog book.epub.meta.json',
    ]);
  });

  it('never touches files crossbag did not record', async () => {
    const harness = makeHarness({
      pages: [[]],
      files: ['Hand placed.epub', 'notes.txt', 'Shelves'],
    });

    const result = await runSync(harness.deps, CONFIG);

    expect(result.pruned).toBe(0);
    expect(entryCalls(harness.relay)).toEqual([]);
    expect(harness.deleteCalls).toEqual([]);
  });

  it('keeps the ledger entry when a delete fails, to retry next sync', async () => {
    const harness = makeHarness({
      pages: [[]],
      files: ['Partial.epub', 'Partial.epub.meta.json'],
      syncState: {
        articles: { '8': { filename: 'Partial.epub', status: 'pulled' } },
      },
      entryResponse: (id) => ({ status: 200, body: archivedBody(id) }),
      deleteStatus: (path) => (path.endsWith('.meta.json') ? 500 : 200),
    });

    const result = await runSync(harness.deps, CONFIG);

    expect(result.pruned).toBe(0);
    expect(harness.deleteCalls).toEqual([
      '/Wallabag/Partial.epub',
      '/Wallabag/Partial.epub.meta.json',
    ]);
    expect(writtenState(harness).articles['8']).toBeDefined();
  });

  it('skips the phase entirely when prune_on_sync is false', async () => {
    const harness = makeHarness({
      pages: [[]],
      files: ['Gone.epub', 'Gone.epub.meta.json'],
      syncState: {
        articles: { '6': { filename: 'Gone.epub', status: 'pulled' } },
      },
      entryResponse: (id) => ({ status: 200, body: archivedBody(id) }),
    });

    const result = await runSync(harness.deps, {
      ...CONFIG,
      prune_on_sync: false,
    });

    expect(result.pruned).toBeUndefined();
    expect(entryCalls(harness.relay)).toEqual([]);
    expect(harness.deleteCalls).toEqual([]);
    expect(writtenState(harness).articles['6']).toBeDefined();
  });

  it('reports pruning progress before the pull phase', async () => {
    const harness = makeHarness({
      pages: [[]],
      files: ['A.epub', 'B.epub'],
      syncState: {
        articles: {
          '1': { filename: 'A.epub', status: 'pulled' },
          '2': { filename: 'B.epub', status: 'pulled' },
        },
      },
      entryResponse: (id) => ({ status: 200, body: unreadBody(id) }),
    });
    const progress: SyncProgress[] = [];

    await runSync(harness.deps, CONFIG, (event) => progress.push(event));

    expect(progress).toEqual([
      { phase: 'pruning', index: 1, total: 2 },
      { phase: 'pruning', index: 2, total: 2 },
    ]);
  });
});
