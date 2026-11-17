import { describe, expect, it, vi } from 'vitest';
import type { RelayResponse, CrossPointApi } from '../src/crossbag';
import {
  buildConfig,
  buildTestRequest,
  encodeBase64Utf8,
  renderForm,
  type SetupFormValues,
} from '../src/plugin';

const formValues: SetupFormValues = {
  serverUrl: 'https://wallabag.example.com/',
  clientId: 'crossbag-client',
  clientSecret: 'client-secret',
  username: 'café ☕',
  password: 'pässwörd',
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
