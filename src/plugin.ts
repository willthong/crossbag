import type { CrossPointApi } from './crossbag';
import type { WallabagConfig } from './wallabag';

export const PLUGIN_NAME = 'crossbag';

/** Values collected by the setup wizard's form. */
export interface SetupFormValues {
  serverUrl: string;
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
}

export interface TestRequest {
  method: 'GET';
  url: string;
  headers: Record<string, string>;
}

export interface TokenRequest {
  method: 'POST';
  url: string;
  body: string;
}

interface FieldSpec {
  name: keyof SetupFormValues;
  label: string;
  type: 'text' | 'password';
  value: string;
}

type InputMap = Record<keyof SetupFormValues, HTMLInputElement>;

const FIELDS: readonly FieldSpec[] = [
  { name: 'serverUrl', label: 'Server URL', type: 'text', value: 'https://' },
  { name: 'clientId', label: 'Client ID', type: 'text', value: '' },
  { name: 'clientSecret', label: 'Client Secret', type: 'password', value: '' },
  { name: 'username', label: 'Username', type: 'text', value: '' },
  { name: 'password', label: 'Password', type: 'password', value: '' },
];

/** Strip trailing slashes so path templates never produce `//`. */
function withoutTrailingSlashes(serverUrl: string): string {
  return serverUrl.replace(/\/+$/, '');
}

/** Encode text as base64 of its UTF-8 bytes. */
export function encodeBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

/** Map setup-wizard form values to the wallabag config file shape. */
export function buildConfig(values: SetupFormValues): WallabagConfig {
  return {
    server_url: withoutTrailingSlashes(values.serverUrl),
    client_id: values.clientId,
    client_secret: values.clientSecret,
    username: values.username,
    password: values.password,
  };
}

/** Build the OAuth2 password-grant request that issues a bearer token. */
export function buildTokenRequest(values: SetupFormValues): TokenRequest {
  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: values.clientId,
    client_secret: values.clientSecret,
    username: values.username,
    password: values.password,
  });

  return {
    method: 'POST',
    url: `${withoutTrailingSlashes(values.serverUrl)}/oauth/v2/token`,
    body: body.toString(),
  };
}

/** Build the browse request the wizard uses to prove the server answers. */
export function buildTestRequest(
  serverUrl: string,
  token: string,
): TestRequest {
  return {
    method: 'GET',
    url: `${withoutTrailingSlashes(serverUrl)}/api/entries?perPage=1`,
    headers: { Authorization: `Bearer ${token}` },
  };
}

function readValues(inputs: InputMap): SetupFormValues {
  return {
    serverUrl: inputs.serverUrl.value,
    clientId: inputs.clientId.value,
    clientSecret: inputs.clientSecret.value,
    username: inputs.username.value,
    password: inputs.password.value,
  };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isOk(status: number): boolean {
  return status >= 200 && status < 300;
}

function parseAccessToken(body: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed !== 'object' || parsed === null) {
      return undefined;
    }
    const token = (parsed as { access_token?: unknown }).access_token;
    return typeof token === 'string' && token !== '' ? token : undefined;
  } catch {
    return undefined;
  }
}

function setAlert(alert: HTMLElement, message: string): void {
  alert.textContent = message;
}

async function testConnection(
  inputs: InputMap,
  api: CrossPointApi,
  alert: HTMLElement,
): Promise<void> {
  const values = readValues(inputs);
  const tokenRequest = buildTokenRequest(values);

  try {
    const tokenResponse = await api.relay(tokenRequest.method, tokenRequest.url, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenRequest.body,
    });

    if (!isOk(tokenResponse.status)) {
      setAlert(alert, `Connection failed (HTTP ${tokenResponse.status}).`);
      return;
    }

    const token = parseAccessToken(tokenResponse.body);
    if (token === undefined) {
      setAlert(alert, 'Connection failed: no access token in the response.');
      return;
    }

    const request = buildTestRequest(values.serverUrl, token);
    const response = await api.relay(request.method, request.url, {
      headers: request.headers,
    });

    if (!isOk(response.status)) {
      setAlert(alert, `Connection failed (HTTP ${response.status}).`);
      return;
    }

    setAlert(alert, 'Connection works.');
  } catch (error) {
    setAlert(alert, `Connection failed: ${describeError(error)}`);
  }
}

async function saveConfig(
  inputs: InputMap,
  api: CrossPointApi,
  alert: HTMLElement,
): Promise<void> {
  const config = buildConfig(readValues(inputs));
  const payload = encodeBase64Utf8(JSON.stringify(config));

  try {
    await api.writeFile('config.json', payload);
    setAlert(
      alert,
      'Credentials saved. Switch to your device to browse articles.',
    );
  } catch (error) {
    setAlert(alert, `Could not save credentials: ${describeError(error)}`);
  }
}

function addButton(
  form: HTMLFormElement,
  label: string,
  onClick: () => void,
): void {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', onClick);
  form.append(button);
}

/** Render the setup wizard into the container and wire its buttons. */
export function renderForm(container: HTMLElement, api: CrossPointApi): void {
  const form = document.createElement('form');
  const inputs = {} as InputMap;

  for (const field of FIELDS) {
    const label = document.createElement('label');
    label.textContent = field.label;
    const input = document.createElement('input');
    input.type = field.type;
    input.name = field.name;
    input.value = field.value;
    label.append(input);
    form.append(label);
    inputs[field.name] = input;
  }

  const alert = document.createElement('p');
  alert.setAttribute('role', 'alert');

  addButton(form, 'Test Connection', () => {
    void testConnection(inputs, api, alert);
  });
  addButton(form, 'Save', () => {
    void saveConfig(inputs, api, alert);
  });

  form.append(alert);
  container.append(form);
}

/**
 * Register the setup wizard with the firmware.
 *
 * The firmware injects the `CrossPoint` global before the bundle runs. Where
 * it is absent (Node tests, typecheck, build) this returns immediately, so
 * importing the module stays side-effect free.
 */
export function main(): void {
  const crossPoint = globalThis.CrossPoint;
  if (crossPoint === undefined) {
    return;
  }

  crossPoint.registerPlugin((container, api) => {
    renderForm(container, api);
  });
}

main();

export type { CrossPointApi, RelayResponse } from './crossbag';
