import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RelayResponse, CrossPointApi } from '../src/crossbag';
import type { WallabagConfig } from '../src/wallabag';
import {
  buildConfig,
  buildSyncDeps,
  buildTestRequest,
  encodeBase64Utf8,
  renderForm,
  type FetchLike,
  type SetupFormValues,
  type SyncApi,
  type SyncDeps,
} from '../src/plugin';

const formValues: SetupFormValues = {
  serverUrl: 'https://wallabag.example.com/',
  clientId: 'crossbag-client',
  clientSecret: 'client-secret',
  username: 'café ☕',
  password: 'pässwörd',
  syncLimit: '50',
};

function makeApi(relayResponse: RelayResponse = { status: 200, body: '{}' }) {
  return {
    name: 'crossbag',
    relay: vi.fn<CrossPointApi['relay']>(async () => relayResponse),
    writeFile: vi.fn<CrossPointApi['writeFile']>(async () => undefined),
  } satisfies CrossPointApi;
}

function inputByName(container: HTMLElement, name: string): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>(
    `input[name="${name}"]`,
  );
  expect(input, `missing input: ${name}`).not.toBeNull();
  if (input === null) {
    throw new Error(`missing input: ${name}`);
  }
  return input;
}

function buttonByText(container: HTMLElement, label: string): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  expect(button, `missing button: ${label}`).toBeDefined();
  if (button === undefined) {
    throw new Error(`missing button: ${label}`);
  }
  return button;
}

function fillForm(container: HTMLElement): void {
  inputByName(container, 'serverUrl').value = formValues.serverUrl;
  inputByName(container, 'clientId').value = formValues.clientId;
  inputByName(container, 'clientSecret').value = formValues.clientSecret;
  inputByName(container, 'username').value = formValues.username;
  inputByName(container, 'password').value = formValues.password;
}

describe('setup wizard text encoding', () => {
  it('encodes non-ASCII text as UTF-8 base64', () => {
    const text = 'café ☕';

    const encoded = encodeBase64Utf8(text);
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');

    expect(decoded).toBe(text);
  });
});

describe('setup wizard config', () => {
  it('maps form values to the wallabag config and trims server slashes', () => {
    const config = buildConfig({
      ...formValues,
      serverUrl: 'https://wallabag.example.com///',
    });

    expect(config).toEqual({
      server_url: 'https://wallabag.example.com',
      client_id: 'crossbag-client',
      client_secret: 'client-secret',
      username: 'café ☕',
      password: 'pässwörd',
      sync_limit: 50,
    });
  });
});

describe('setup wizard connection test', () => {
  it('builds a bearer-authenticated request for one article', () => {
    const request = buildTestRequest(
      'https://wallabag.example.com/',
      'token-123',
    );

    expect(request.method).toBe('GET');

    const url = new URL(request.url);

    expect(url.pathname.endsWith('/api/entries')).toBe(true);
    expect(url.searchParams.get('perPage')).toBe('1');
    expect(request.headers.Authorization).toBe('Bearer token-123');
  });
});

describe('setup wizard form', () => {
  it('renders one input per config field plus both action buttons', () => {
    const container = document.createElement('div');

    renderForm(container, makeApi());

    const names = [...container.querySelectorAll('input')]
      .map((input) => input.name)
      .sort();

    expect(names).toEqual([
      'clientId',
      'clientSecret',
      'password',
      'serverUrl',
      'syncLimit',
      'username',
    ]);
    expect(buttonByText(container, 'Test Connection')).toBeDefined();
    expect(buttonByText(container, 'Save')).toBeDefined();
  });

  it('saves the form values as UTF-8 JSON in config.json', async () => {
    const container = document.createElement('div');
    const api = makeApi();

    renderForm(container, api);
    fillForm(container);
    buttonByText(container, 'Save').click();

    await vi.waitFor(() => {
      expect(api.writeFile).toHaveBeenCalledTimes(1);
    });

    const call = api.writeFile.mock.calls[0];
    expect(call).toBeDefined();
    if (call === undefined) {
      throw new Error('writeFile was not called');
    }
    const [writtenPath, payload] = call;
    const written = JSON.parse(
      Buffer.from(payload, 'base64').toString('utf8'),
    ) as Record<string, string>;

    expect(writtenPath).toBe('config.json');
    expect(written).toEqual({
      server_url: 'https://wallabag.example.com',
      client_id: 'crossbag-client',
      client_secret: 'client-secret',
      username: 'café ☕',
      password: 'pässwörd',
      sync_limit: 50,
    });
  });

  it('shows a rejected connection without writing config', async () => {
    const container = document.createElement('div');
    const api = makeApi({
      status: 401,
      body: JSON.stringify({ error: 'invalid_grant' }),
    });

    renderForm(container, api);
    fillForm(container);
    buttonByText(container, 'Test Connection').click();

    await vi.waitFor(() => {
      const alert = container.querySelector('[role="alert"]');
      expect(alert?.textContent ?? '').toMatch(
        /connection failed|unauthori[sz]ed|401|invalid/i,
      );
    });

    expect(api.writeFile).not.toHaveBeenCalled();
  });
});

function makeSequencedApi(responses: RelayResponse[]) {
  const queue = [...responses];
  const relay = vi.fn<CrossPointApi['relay']>(async () => {
    const next = queue.shift();
    if (next === undefined) {
      throw new Error('relay called more times than expected');
    }
    return next;
  });

  return {
    name: 'crossbag',
    relay,
    writeFile: vi.fn<CrossPointApi['writeFile']>(async () => undefined),
  } satisfies CrossPointApi;
}

function tokenResponse(accessToken: string): RelayResponse {
  return {
    status: 200,
    body: JSON.stringify({
      access_token: accessToken,
      expires_in: 3600,
      token_type: 'bearer',
    }),
  };
}

describe('setup wizard connection test auth flow', () => {
  it('requests an OAuth2 password-grant token before browsing', async () => {
    const container = document.createElement('div');
    const api = makeSequencedApi([
      tokenResponse('token-abc'),
      { status: 200, body: '{}' },
    ]);

    renderForm(container, api);
    fillForm(container);
    buttonByText(container, 'Test Connection').click();

    await vi.waitFor(() => {
      expect(api.relay).toHaveBeenCalled();
    });

    const first = api.relay.mock.calls[0];
    expect(first).toBeDefined();
    if (first === undefined) {
      throw new Error('relay was not called');
    }
    const [method, url, options] = first;

    expect(method).toBe('POST');
    expect(url).toBe('https://wallabag.example.com/oauth/v2/token');

    const body = new URLSearchParams(options?.body ?? '');
    expect(body.get('grant_type')).toBe('password');
    expect(body.get('client_id')).toBe('crossbag-client');
    expect(body.get('client_secret')).toBe('client-secret');
    expect(body.get('username')).toBe('café ☕');
    expect(body.get('password')).toBe('pässwörd');
  });

  it('browses with the bearer token returned by the token endpoint', async () => {
    const container = document.createElement('div');
    const api = makeSequencedApi([
      tokenResponse('token-abc'),
      { status: 200, body: '{}' },
    ]);

    renderForm(container, api);
    fillForm(container);
    buttonByText(container, 'Test Connection').click();

    await vi.waitFor(() => {
      expect(api.relay).toHaveBeenCalledTimes(2);
    });

    const second = api.relay.mock.calls[1];
    expect(second).toBeDefined();
    if (second === undefined) {
      throw new Error('second relay call missing');
    }
    const [method, url, options] = second;

    expect(method).toBe('GET');
    expect(url).toBe('https://wallabag.example.com/api/entries?perPage=1');
    expect(options?.headers?.Authorization).toBe('Bearer token-abc');
  });

  it('stops after a rejected token request without browsing or saving', async () => {
    const container = document.createElement('div');
    const api = makeSequencedApi([
      { status: 401, body: JSON.stringify({ error: 'invalid_grant' }) },
    ]);

    renderForm(container, api);
    fillForm(container);
    buttonByText(container, 'Test Connection').click();

    await vi.waitFor(() => {
      const alert = container.querySelector('[role="alert"]');
      expect(alert?.textContent ?? '').toMatch(
        /connection failed|unauthori[sz]ed|401|invalid/i,
      );
    });

    expect(api.relay).toHaveBeenCalledTimes(1);

    const first = api.relay.mock.calls[0];
    expect(first).toBeDefined();
    if (first === undefined) {
      throw new Error('relay was not called');
    }
    expect(first[0]).toBe('POST');
    expect(first[1]).toBe('https://wallabag.example.com/oauth/v2/token');

    expect(api.writeFile).not.toHaveBeenCalled();
  });
});

describe('setup wizard sync limit', () => {
  it('renders a sync_limit number input defaulting to 50, bounded 1-500', () => {
    const container = document.createElement('div');

    renderForm(container, makeApi());

    const input = container.querySelector<HTMLInputElement>(
      'input[name="syncLimit"]',
    );

    expect(input, 'missing sync limit input').not.toBeNull();
    expect(input?.type).toBe('number');
    expect(input?.value).toBe('50');
    expect(input?.min).toBe('1');
    expect(input?.max).toBe('500');
  });

  it('builds sync_limit as a number from the form value', () => {
    const config = buildConfig({ ...formValues, syncLimit: '25' });

    expect(config.sync_limit).toBe(25);
  });

  it('integer-checks and clamps values so config.json stays valid', () => {
    const limitFor = (syncLimit: string): number | undefined =>
      buildConfig({ ...formValues, syncLimit }).sync_limit;

    expect(limitFor('0')).toBe(1);
    expect(limitFor('-3')).toBe(1);
    expect(limitFor('501')).toBe(500);
    expect(limitFor('2.5')).toBe(50);
    expect(limitFor('not a number')).toBe(50);
    expect(limitFor('')).toBe(50);
  });
});

const SYNC_CONFIG: WallabagConfig = {
  server_url: 'https://wallabag.example.com',
  client_id: 'crossbag-client',
  client_secret: 'client-secret',
  username: 'café ☕',
  password: 'pässwörd',
  sync_limit: 50,
};

interface ListingEntry {
  name: string;
  isDirectory: boolean;
}

interface SyncScenario {
  articleIds: number[];
}

function entriesBody(ids: number[], page: number): string {
  const perPage = 16;
  const start = (page - 1) * perPage;
  const items = ids
    .slice(start, start + perPage)
    .map((id) => ({ id, title: `Article ${id}` }));

  return JSON.stringify({
    page,
    pages: Math.max(1, Math.ceil(ids.length / perPage)),
    _embedded: { items },
  });
}

function makeSyncRelay(scenario: SyncScenario): CrossPointApi['relay'] {
  return async (_method, url) => {
    if (url.endsWith('/oauth/v2/token')) {
      return {
        status: 200,
        body: JSON.stringify({ access_token: 'token-1' }),
      };
    }
    if (url.includes('/api/entries?')) {
      const page = Number(new URL(url).searchParams.get('page') ?? '1');
      return { status: 200, body: entriesBody(scenario.articleIds, page) };
    }
    return { status: 404, body: '' };
  };
}

function makeSyncApi(scenario: SyncScenario) {
  return {
    name: 'crossbag',
    relay: vi.fn<CrossPointApi['relay']>(makeSyncRelay(scenario)),
    fetchToSd: vi.fn<SyncDeps['fetchToSd']>(async () => ({
      status: 200,
      bytes: 4096,
      complete: true,
    })),
    writeFile: vi.fn<CrossPointApi['writeFile']>(async () => undefined),
  } satisfies SyncApi;
}

type FetchResponse = Awaited<ReturnType<FetchLike>>;

function textResponse(body: string, status = 200): FetchResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => JSON.parse(body) as unknown,
    text: async () => body,
  };
}

function okListing(files: ListingEntry[]): FetchLike {
  return async () => ({
    ok: true,
    status: 200,
    json: async () => files,
    text: async () => '',
  });
}

function syncStatus(container: HTMLElement): HTMLElement {
  const status = container.querySelector<HTMLElement>('[data-sync-status]');
  expect(status, 'missing sync status element').not.toBeNull();
  if (status === null) {
    throw new Error('missing sync status element');
  }
  return status;
}

function openGate() {
  let release!: () => void;
  const promise = new Promise<void>((settle) => {
    release = settle;
  });
  return { promise, release };
}

function articleIdFromUrl(url: string): number {
  const match = /\/api\/entries\/(\d+)\/export\.epub$/.exec(url);
  const id = match?.[1];
  if (id === undefined) {
    throw new Error(`unexpected export URL: ${url}`);
  }
  return Number(id);
}

interface SyncMountOptions {
  articleIds: number[];
  syncLimit?: string;
  files?: ListingEntry[];
  listing?: FetchLike;
  fetchToSd?: SyncDeps['fetchToSd'];
  config?: WallabagConfig | null;
  configBody?: string;
  syncState?: unknown;
}

function makeSyncFetch(options: SyncMountOptions): FetchLike {
  const savedConfig =
    options.config === undefined
      ? {
          ...SYNC_CONFIG,
          sync_limit: Number(options.syncLimit ?? '50'),
        }
      : options.config;
  const listing = options.listing ?? okListing(options.files ?? []);

  return async (url) => {
    const prefix = '/download?path=';
    if (!url.startsWith(prefix)) {
      return await listing(url);
    }

    const path = decodeURIComponent(url.slice(prefix.length));
    if (path === 'config.json') {
      if (options.configBody !== undefined) {
        return textResponse(options.configBody);
      }
      return savedConfig === null
        ? textResponse('', 404)
        : textResponse(JSON.stringify(savedConfig));
    }
    if (path === 'sync-state.json' && options.syncState !== undefined) {
      return textResponse(JSON.stringify(options.syncState));
    }
    return textResponse('', 404);
  };
}

function mountSync(options: SyncMountOptions) {
  const container = document.createElement('div');
  const limit = options.syncLimit ?? '50';
  const api = makeSyncApi({ articleIds: options.articleIds });
  if (options.fetchToSd !== undefined) {
    api.fetchToSd.mockImplementation(options.fetchToSd);
  }
  const fetchImpl = vi.fn<FetchLike>(makeSyncFetch(options));
  vi.stubGlobal('fetch', fetchImpl);

  renderForm(container, api, fetchImpl);
  fillForm(container);
  inputByName(container, 'syncLimit').value = limit;

  return { container, api, fetchImpl };
}

describe('buildSyncDeps', () => {
  it('wires relay, fetchToSd, writeFile and lists filenames from fetch', async () => {
    const api = makeSyncApi({ articleIds: [] });
    const fetchImpl = vi.fn<FetchLike>(
      okListing([
        { name: 'Article 1.epub', isDirectory: false },
        { name: 'nested', isDirectory: true },
        { name: 'Article 2.epub', isDirectory: false },
      ]),
    );

    const deps = buildSyncDeps(api, fetchImpl);

    await deps.relay('GET', 'https://wallabag.example.com/api/entries', {});
    expect(api.relay).toHaveBeenCalledWith(
      'GET',
      'https://wallabag.example.com/api/entries',
      {},
    );

    await deps.fetchToSd(
      'https://wallabag.example.com/api/entries/7/export.epub',
      '/Wallabag/Article 7.epub',
      { Authorization: 'Bearer token-1' },
    );
    expect(api.fetchToSd).toHaveBeenCalledWith(
      'https://wallabag.example.com/api/entries/7/export.epub',
      '/Wallabag/Article 7.epub',
      { Authorization: 'Bearer token-1' },
    );

    await deps.writeFile('sync-state.json', 'eyJ9');
    expect(api.writeFile).toHaveBeenCalledWith('sync-state.json', 'eyJ9');

    const names = await deps.listFiles('/Wallabag');

    expect(fetchImpl).toHaveBeenCalledWith('/api/files?path=%2FWallabag');
    expect(names).toEqual(['Article 1.epub', 'Article 2.epub']);
  });

  it('rejects listFiles when the files endpoint response is not ok', async () => {
    const api = makeSyncApi({ articleIds: [] });
    const fetchImpl = vi.fn<FetchLike>(async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
      text: async () => '',
    }));

    const deps = buildSyncDeps(api, fetchImpl);

    await expect(deps.listFiles('/Wallabag')).rejects.toThrow();
  });

  it('rejects a malformed listing instead of treating it as empty', async () => {
    const api = makeSyncApi({ articleIds: [] });
    const malformed: unknown[] = [
      {},
      null,
      'not a list',
      [null],
      [{ isDirectory: false }],
      [{ name: 42, isDirectory: false }],
    ];

    for (const payload of malformed) {
      const fetchImpl = vi.fn<FetchLike>(async () => ({
        ok: true,
        status: 200,
        json: async () => payload,
        text: async () => '',
      }));
      const deps = buildSyncDeps(api, fetchImpl);

      await expect(
        deps.listFiles('/Wallabag'),
        `accepted ${JSON.stringify(payload)}`,
      ).rejects.toThrow(/invalid/i);
    }
  });

  it('reads device files from the same-origin download endpoint', async () => {
    const api = makeSyncApi({ articleIds: [] });
    const path = '/Wallabag/On the beach.epub.meta.json';
    const fetchImpl = vi.fn<FetchLike>(async () => ({
      ok: true,
      status: 200,
      json: async () => ({}),
      text: async () => '{"book_id":99}',
    }));

    const deps = buildSyncDeps(api, fetchImpl);

    await expect(deps.readFile(path)).resolves.toBe('{"book_id":99}');
    expect(fetchImpl).toHaveBeenCalledWith(
      `/download?path=${encodeURIComponent(path)}`,
    );
  });

  it('rejects readFile when the download endpoint is not ok', async () => {
    const api = makeSyncApi({ articleIds: [] });
    const fetchImpl = vi.fn<FetchLike>(async () => ({
      ok: false,
      status: 404,
      json: async () => ({}),
      text: async () => '',
    }));

    const deps = buildSyncDeps(api, fetchImpl);

    await expect(deps.readFile('config.json')).rejects.toThrow(/404/);
  });
});

describe('setup wizard Sync', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders a Sync button and a status element outside the alert', () => {
    const container = document.createElement('div');

    renderForm(container, makeApi());

    const sync = buttonByText(container, 'Sync');
    const status = syncStatus(container);
    const alert = container.querySelector<HTMLElement>('[role="alert"]');

    expect(sync.disabled).toBe(false);
    expect(alert).not.toBeNull();
    expect(status).not.toBe(alert);
    expect(alert?.contains(status)).toBe(false);
  });

  it('shows progress, then a summary with pulled/failed/skipped counts', async () => {
    const gate = openGate();
    const downloaded: number[] = [];
    const { container, api } = mountSync({
      articleIds: [1, 2],
      fetchToSd: async (url) => {
        downloaded.push(articleIdFromUrl(url));
        if (downloaded.length === 2) {
          await gate.promise;
        }
        return { status: 200, bytes: 4096, complete: true };
      },
    });

    buttonByText(container, 'Sync').click();

    await vi.waitFor(() => {
      expect(syncStatus(container).textContent).toContain('1/2');
    });

    gate.release();

    await vi.waitFor(() => {
      expect(syncStatus(container).textContent).toMatch(/2 pulled/);
    });

    const summary = syncStatus(container).textContent ?? '';
    expect(summary).toContain('2 pulled');
    expect(summary).toContain('0 failed (retries next sync)');
    expect(summary).toContain('0 skipped (deleted server-side)');
    expect(downloaded).toEqual([1, 2]);
    expect(api.fetchToSd).toHaveBeenCalledTimes(2);
    expect(api.writeFile.mock.calls[0]?.[0]).toBe('sync-state.json');
  });

  it('warns that more unread articles remain when the limit is hit', async () => {
    const { container } = mountSync({ articleIds: [101, 102], syncLimit: '1' });

    buttonByText(container, 'Sync').click();

    await vi.waitFor(() => {
      const text = syncStatus(container).textContent ?? '';
      expect(text).toMatch(/1 pulled/);
      expect(text).toContain('more unread articles remain.');
    });
  });

  it('warns when paging stops before the end of the list', async () => {
    const { container, api } = mountSync({ articleIds: [1] });
    api.relay.mockImplementation(async (_method, url) => {
      if (url.endsWith('/oauth/v2/token')) {
        return {
          status: 200,
          body: JSON.stringify({ access_token: 'token-1' }),
        };
      }
      const page = Number(new URL(url).searchParams.get('page') ?? '1');
      if (page === 1) {
        return {
          status: 200,
          body: JSON.stringify({
            page: 1,
            pages: 2,
            _embedded: { items: [{ id: 1, title: 'Article 1' }] },
          }),
        };
      }
      return { status: 503, body: '' };
    });

    buttonByText(container, 'Sync').click();

    await vi.waitFor(() => {
      const text = syncStatus(container).textContent ?? '';
      expect(text).toContain('1 pulled');
      expect(text).toContain('did not reach the end of the list.');
      expect(text).not.toContain('more unread articles remain');
    });
  });

  it('loads the saved config instead of blank form fields', async () => {
    const saved: WallabagConfig = { ...SYNC_CONFIG, sync_limit: 1 };
    const { container, api } = mountSync({
      articleIds: [1, 2],
      config: saved,
    });
    inputByName(container, 'serverUrl').value = '';
    inputByName(container, 'username').value = '';
    inputByName(container, 'password').value = '';

    buttonByText(container, 'Sync').click();

    await vi.waitFor(() => {
      expect(syncStatus(container).textContent).toContain('1 pulled');
    });

    const tokenCall = api.relay.mock.calls[0];
    expect(tokenCall?.[1]).toBe(`${saved.server_url}/oauth/v2/token`);
    expect(api.fetchToSd).toHaveBeenCalledTimes(1);
  });

  it('refuses to sync when config.json is absent', async () => {
    const { container, api } = mountSync({ articleIds: [1], config: null });

    buttonByText(container, 'Sync').click();

    await vi.waitFor(() => {
      expect(syncStatus(container).textContent).toMatch(
        /save your credentials first/i,
      );
    });

    expect(api.relay).not.toHaveBeenCalled();
    expect(api.fetchToSd).not.toHaveBeenCalled();
  });

  it('refuses to sync when config.json is unparseable', async () => {
    const { container, api } = mountSync({
      articleIds: [1],
      configBody: 'not json',
    });

    buttonByText(container, 'Sync').click();

    await vi.waitFor(() => {
      expect(syncStatus(container).textContent).toMatch(
        /save your credentials first/i,
      );
    });

    expect(api.fetchToSd).not.toHaveBeenCalled();
  });

  it('reports a listing failure in the status element', async () => {
    const { container, api } = mountSync({
      articleIds: [1, 2],
      listing: async () => {
        throw new Error('listing down');
      },
    });

    buttonByText(container, 'Sync').click();

    await vi.waitFor(() => {
      expect(syncStatus(container).textContent).toMatch(
        /could not list|failed|error/i,
      );
    });

    expect(api.fetchToSd).not.toHaveBeenCalled();
  });

  it('disables Sync while running so a double click cannot start two syncs', async () => {
    const gate = openGate();
    const { container, api } = mountSync({
      articleIds: [1, 2],
      fetchToSd: async () => {
        await gate.promise;
        return { status: 200, bytes: 4096, complete: true };
      },
    });

    const sync = buttonByText(container, 'Sync');
    sync.click();

    await vi.waitFor(() => {
      expect(sync.disabled).toBe(true);
    });
    sync.click();

    gate.release();

    await vi.waitFor(() => {
      expect(syncStatus(container).textContent).toMatch(/2 pulled/);
    });

    expect(api.fetchToSd).toHaveBeenCalledTimes(2);
    expect(sync.disabled).toBe(false);
  });
});
