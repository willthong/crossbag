import type { CrossPointApi } from './crossbag';
import type { WallabagConfig } from './wallabag';

export const PLUGIN_NAME = 'crossbag';

/** The one home for the sync-limit default and bounds. */
export const SYNC_LIMIT_DEFAULT = 50;
export const SYNC_LIMIT_MIN = 1;
export const SYNC_LIMIT_MAX = 500;

/** Values collected by the setup wizard's form. */
export interface SetupFormValues {
  serverUrl: string;
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  syncLimit: string;
  datePrefixedFilenames: string;
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
  type: 'text' | 'password' | 'number' | 'checkbox';
  value: string;
  min?: string;
  max?: string;
}

type InputMap = Record<keyof SetupFormValues, HTMLInputElement>;

const FIELDS: readonly FieldSpec[] = [
  { name: 'serverUrl', label: 'Server URL', type: 'text', value: 'https://' },
  { name: 'clientId', label: 'Client ID', type: 'text', value: '' },
  { name: 'clientSecret', label: 'Client Secret', type: 'password', value: '' },
  { name: 'username', label: 'Username', type: 'text', value: '' },
  { name: 'password', label: 'Password', type: 'password', value: '' },
  {
    name: 'syncLimit',
    label: 'Articles per sync',
    type: 'number',
    value: String(SYNC_LIMIT_DEFAULT),
    min: String(SYNC_LIMIT_MIN),
    max: String(SYNC_LIMIT_MAX),
  },
  {
    name: 'datePrefixedFilenames',
    label: 'Date-prefixed filenames',
    type: 'checkbox',
    value: 'false',
  },
];

/** Clamp any number into the supported sync-limit range. */
function clampSyncLimit(value: number): number {
  const whole = Math.trunc(value);
  return Math.min(SYNC_LIMIT_MAX, Math.max(SYNC_LIMIT_MIN, whole));
}

/** Parse the sync-limit field, falling back to the default for bad input. */
export function parseSyncLimit(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return SYNC_LIMIT_DEFAULT;
  }

  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed)) {
    return SYNC_LIMIT_DEFAULT;
  }

  return clampSyncLimit(parsed);
}

/**
 * Trim pasted whitespace and trailing slashes so path templates never produce
 * `//` or a host name with a stray space in it. A pasted URL often arrives with
 * a trailing newline, and the device's relay cannot connect to `host%20`.
 */
function normalizeServerUrl(serverUrl: string): string {
  return serverUrl.trim().replace(/\/+$/, '');
}

/**
 * Explain why a server URL cannot be used, or return undefined when it can.
 * Checked before any request so a typo (a bare host, a pasted newline, a
 * missing scheme) is reported in words instead of as a device relay failure.
 */
export function serverUrlProblem(serverUrl: string): string | undefined {
  const url = normalizeServerUrl(serverUrl);
  if (url === '') {
    return 'Enter the server URL.';
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'The server URL must be a full address, like https://wallabag.example.com.';
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return 'The server URL must start with http:// or https://.';
  }
  if (parsed.hostname === '') {
    return 'The server URL needs a host name, like https://wallabag.example.com.';
  }

  return undefined;
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
    server_url: normalizeServerUrl(values.serverUrl),
    client_id: values.clientId,
    client_secret: values.clientSecret,
    username: values.username,
    password: values.password,
    // The on-reader catalog cannot form-encode config values itself, so the
    // wizard stores the finished, encoded body for it to send verbatim.
    auth_body: buildTokenRequest(values).body,
    sync_limit: parseSyncLimit(values.syncLimit),
    date_prefixed_filenames: values.datePrefixedFilenames === 'true',
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
    url: `${normalizeServerUrl(values.serverUrl)}/oauth/v2/token`,
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
    url: `${normalizeServerUrl(serverUrl)}/api/entries?detail=metadata&perPage=1`,
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
    syncLimit: inputs.syncLimit.value,
    datePrefixedFilenames: inputs.datePrefixedFilenames.checked
      ? 'true'
      : 'false',
  };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Turn a failed relay into something a person can act on. The device answers
 * `/api/relay` with a bare 502 "relay failed" whenever its own outbound request
 * fails, and its message blames large bodies even when the cause is a URL the
 * device could not connect to. Name the likely causes and keep the device's
 * words so the log can be matched up.
 */
function describeRelayFailure(error: unknown): string {
  const message = describeError(error);
  if (!message.includes('/api/relay')) {
    return message;
  }

  // The device blames large bodies whenever its relay gives up, even when the
  // real cause is an unreachable server. Only trust that label when the device
  // names it, since `detail=metadata` keeps legitimate wizard replies small.
  if (message.includes('large bodies')) {
    return (
      'the reply was too large for the device relay — the server may be ' +
      `ignoring the metadata request (the device said: ${message})`
    );
  }

  return (
    'the device could not reach the server — check the server URL and that ' +
    `the reader is online (the device said: ${message})`
  );
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

/**
 * Summarise an HTTP failure, preferring wallabag's OAuth2 error body (for
 * example `invalid_client` or `invalid_grant`) over a bare status code.
 */
function describeHttpFailure(status: number, body: string): string {
  const parsed = parseJsonBody(body);
  if (isRecord(parsed)) {
    const code = typeof parsed.error === 'string' ? parsed.error : undefined;
    const description =
      typeof parsed.error_description === 'string'
        ? parsed.error_description
        : undefined;
    if (code !== undefined && description !== undefined && description !== '') {
      return `${code}: ${description} (HTTP ${status})`;
    }
    if (code !== undefined && code !== '') {
      return `${code} (HTTP ${status})`;
    }
  }
  return `HTTP ${status}`;
}

function setAlert(alert: HTMLElement, message: string): void {
  alert.textContent = message;
}

function setStatus(status: HTMLElement, message: string): void {
  status.textContent = message;
}

async function testConnection(
  inputs: InputMap,
  api: CrossPointApi,
  alert: HTMLElement,
): Promise<void> {
  const values = readValues(inputs);
  const problem = serverUrlProblem(values.serverUrl);
  if (problem !== undefined) {
    setAlert(alert, problem);
    return;
  }

  const tokenRequest = buildTokenRequest(values);

  try {
    const tokenResponse = await api.relay(
      tokenRequest.method,
      tokenRequest.url,
      { 'Content-Type': 'application/x-www-form-urlencoded' },
      tokenRequest.body,
    );

    if (!isOk(tokenResponse.status)) {
      setAlert(
        alert,
        `Connection failed: ${describeHttpFailure(
          tokenResponse.status,
          tokenResponse.body,
        )}.`,
      );
      return;
    }

    const token = parseAccessToken(tokenResponse.body);
    if (token === undefined) {
      setAlert(alert, 'Connection failed: no access token in the response.');
      return;
    }

    const request = buildTestRequest(values.serverUrl, token);
    const response = await api.relay(
      request.method,
      request.url,
      request.headers,
    );

    if (!isOk(response.status)) {
      setAlert(
        alert,
        `Connection failed: ${describeHttpFailure(
          response.status,
          response.body,
        )}.`,
      );
      return;
    }

    setAlert(alert, 'Connection works.');
  } catch (error) {
    setAlert(alert, `Connection failed: ${describeRelayFailure(error)}`);
  }
}

async function saveConfig(
  inputs: InputMap,
  api: CrossPointApi,
  alert: HTMLElement,
): Promise<void> {
  const values = readValues(inputs);
  const problem = serverUrlProblem(values.serverUrl);
  if (problem !== undefined) {
    setAlert(alert, problem);
    return;
  }

  const config = buildConfig(values);
  const payload = encodeBase64Utf8(JSON.stringify(config));

  try {
    await api.writeFile(pluginFilePath(api.dir, CONFIG_PATH), payload);
    setAlert(
      alert,
      'Credentials saved. Switch to your device to browse articles.',
    );
  } catch (error) {
    setAlert(alert, `Could not save credentials: ${describeError(error)}`);
  }
}

/**
 * Button styling for the wizard, kept in the plugin rather than borrowed from
 * the firmware's WebUI: the plugin API hands us a bare container and promises
 * nothing about the host's stylesheet or class names.
 */
const BUTTON_STYLES = `
.cbag-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; margin: 0.75rem 0; }
.cbag-btn {
  appearance: none;
  border: 1px solid transparent;
  border-radius: 0.4rem;
  padding: 0.5rem 1rem;
  font: inherit;
  font-weight: 600;
  line-height: 1.2;
  cursor: pointer;
  transition: filter 120ms ease, box-shadow 120ms ease;
}
.cbag-btn:hover:enabled { filter: brightness(1.08); }
.cbag-btn:active:enabled { filter: brightness(0.92); }
.cbag-btn:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
.cbag-btn:disabled { cursor: progress; opacity: 0.6; }
.cbag-btn-secondary { background: #e2e8f0; border-color: #cbd5e1; color: #1e293b; }
.cbag-btn-primary { background: #2563eb; border-color: #1d4ed8; color: #ffffff; }
.cbag-btn-accent { background: #059669; border-color: #047857; color: #ffffff; }
@media (prefers-color-scheme: dark) {
  .cbag-btn-secondary { background: #334155; border-color: #475569; color: #f1f5f9; }
  .cbag-btn-primary { background: #3b82f6; border-color: #2563eb; }
  .cbag-btn-accent { background: #10b981; border-color: #059669; }
}
`;

/** Inject the wizard's stylesheet once, however often the form re-renders. */
function ensureButtonStyles(container: HTMLElement): void {
  if (container.querySelector('style[data-cbag-styles]') !== null) {
    return;
  }
  const style = document.createElement('style');
  style.setAttribute('data-cbag-styles', '');
  style.textContent = BUTTON_STYLES;
  container.append(style);
}

function addButton(
  parent: HTMLElement,
  label: string,
  variant: 'secondary' | 'primary' | 'accent',
  onClick: () => void,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `cbag-btn cbag-btn-${variant}`;
  button.textContent = label;
  button.addEventListener('click', onClick);
  parent.append(button);
  return button;
}

/** Narrow the wizard's API to the richer surface Sync needs. */
function asSyncApi(api: CrossPointApi): SyncApi | undefined {
  const candidate = api as Partial<SyncApi>;
  return typeof candidate.fetchToSd === 'function'
    ? (api as SyncApi)
    : undefined;
}

/** Build the one-line summary shown after Sync ends. */
function summarize(result: SyncResult, lastLine?: string): string {
  let summary =
    `${result.pulled} pulled · ${result.failed} failed (retries next sync) · ` +
    `${result.skipped} skipped (deleted server-side)`;

  if (result.limitHit) {
    summary += ' — more unread articles remain.';
  }
  if (result.interrupted) {
    summary += ' — the sync did not reach the end of the list.';
    if (result.stopReason !== undefined) {
      summary += ` Reason: ${result.stopReason}`;
    }
    if (lastLine !== undefined) {
      summary = `${lastLine} — ${summary}`;
    }
  }

  return summary;
}

async function syncArticles(
  api: CrossPointApi,
  status: HTMLElement,
  fetchImpl: FetchLike,
  button: HTMLButtonElement,
): Promise<void> {
  if (button.disabled) {
    return;
  }

  const syncApi = asSyncApi(api);
  if (syncApi === undefined) {
    setStatus(status, 'Sync is unavailable: the device API has no file download.');
    return;
  }

  button.disabled = true;
  setStatus(status, 'Syncing…');

  let lastStatusLine: string | undefined;

  try {
    const deps = buildSyncDeps(syncApi, fetchImpl);
    const config = await loadSavedConfig(deps);
    const result = await runSync(deps, config, (p) => {
      lastStatusLine =
        p.phase === 'reading'
          ? `Reading unread list: page ${p.page}/${p.pages}`
          : `Downloading ${p.index}/${p.total}${p.title ? `: ${p.title}` : ''}`;
      setStatus(status, lastStatusLine);
    });
    setStatus(status, summarize(result, lastStatusLine));
  } catch (error) {
    const why = describeError(error);
    setStatus(status, `${lastStatusLine ? `${lastStatusLine} — ` : ''}${why}`);
  } finally {
    button.disabled = false;
  }
}

/** Fill only fields the person has not edited since the form rendered. */
function applyPrefill(inputs: InputMap, values: SetupFormValues): void {
  for (const field of FIELDS) {
    const input = inputs[field.name];
    if (field.type === 'checkbox') {
      // A checkbox has no editable text; untouched means still at its default.
      if (input.checked === (field.value === 'true')) {
        input.checked = values[field.name] === 'true';
      }
      continue;
    }
    if (input.value === field.value) {
      input.value = values[field.name];
    }
  }
}

/** Load saved form values, or undefined when there is no usable config. */
async function loadPrefillValues(
  api: CrossPointApi,
  fetchImpl: FetchLike,
): Promise<SetupFormValues | undefined> {
  if (api.dir === undefined || api.dir === '') {
    return undefined;
  }

  // Only read when the device exposes file access or the caller supplied a
  // way to fetch; otherwise the page fetch would be an unrelated network hit.
  if (asSyncApi(api) === undefined && fetchImpl === globalThis.fetch) {
    return undefined;
  }

  try {
    const deps = buildSyncDeps(api, fetchImpl);
    return configValues(await loadSavedConfig(deps));
  } catch {
    // A missing or malformed config just means this is a first-time setup.
    return undefined;
  }
}

/** Render the setup wizard into the container and wire its buttons. */
export function renderForm(
  container: HTMLElement,
  api: CrossPointApi,
  fetchImpl: FetchLike = globalThis.fetch,
): void {
  const form = document.createElement('form');
  const inputs = {} as InputMap;

  for (const field of FIELDS) {
    const label = document.createElement('label');
    label.textContent = field.label;
    const input = document.createElement('input');
    input.type = field.type;
    input.name = field.name;
    if (field.type === 'checkbox') {
      input.checked = field.value === 'true';
    } else {
      input.value = field.value;
    }
    if (field.min !== undefined) {
      input.min = field.min;
    }
    if (field.max !== undefined) {
      input.max = field.max;
    }
    label.append(input);
    form.append(label);
    inputs[field.name] = input;
  }

  // The read is async, so leave the buttons usable and only fill fields that
  // still hold their defaults; an edit made while the read runs wins.
  void loadPrefillValues(api, fetchImpl).then((values) => {
    if (values !== undefined) {
      applyPrefill(inputs, values);
    }
  });

  const alert = document.createElement('p');
  alert.setAttribute('role', 'alert');

  const status = document.createElement('p');
  status.setAttribute('data-sync-status', '');

  const actions = document.createElement('div');
  actions.className = 'cbag-actions';

  addButton(actions, 'Test Connection', 'secondary', () => {
    void testConnection(inputs, api, alert);
  });
  addButton(actions, 'Save', 'primary', () => {
    void saveConfig(inputs, api, alert);
  });
  const syncButton = addButton(actions, 'Sync', 'accent', () => {
    void syncArticles(api, status, fetchImpl, syncButton);
  });

  form.append(actions);
  form.append(status);
  form.append(alert);

  ensureButtonStyles(container);
  container.append(form);
}

/** Characters that are illegal in filenames on the device or on FAT storage. */
// eslint-disable-next-line no-control-regex
const ILLEGAL_FILENAME_CHARS = /[\\/:*?"<>|\u0000-\u001f\u007f]/g;

/** Turn an article title into a filesystem-safe filename part. */
export function sanitizeFilenamePart(raw: string): string {
  const cleaned = raw
    .replace(ILLEGAL_FILENAME_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '');

  return cleaned.length > 0 ? cleaned : 'untitled';
}

/** The last path segment, so paths and bare names compare alike. */
function basename(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] ?? path;
}

/** Pick a unique `.epub` filename for an article in `/Wallabag`. */
export function chooseFilename(
  title: string,
  id: number,
  existing: ReadonlySet<string>,
  datePrefix?: string,
): string {
  const sanitized = sanitizeFilenamePart(title);
  const base = datePrefix ? `${datePrefix}-${sanitized}` : sanitized;
  const taken = new Set([...existing].map((name) => name.toLowerCase()));
  const isTaken = (candidate: string): boolean =>
    taken.has(candidate.toLowerCase());

  const preferred = `${base}.epub`;
  if (!isTaken(preferred)) {
    return preferred;
  }

  const qualified = `${base}-${id}.epub`;
  if (!isTaken(qualified)) {
    return qualified;
  }

  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}-${id}-${suffix}.epub`;
    if (!isTaken(candidate)) {
      return candidate;
    }
  }
}

/** Status recorded for an article Sync has attempted. */
export type SyncStatus = 'pulled' | 'skipped' | 'failed';

const SYNC_STATUS_VALUES = ['pulled', 'skipped', 'failed'] as const;

function isSyncStatus(value: unknown): value is SyncStatus {
  return (
    typeof value === 'string' &&
    (SYNC_STATUS_VALUES as readonly string[]).includes(value)
  );
}

export interface SyncStateArticle {
  filename: string;
  status: SyncStatus;
}

/** Ledger of articles Sync has attempted: article id -> filename and status. */
export interface SyncState {
  articles: Record<string, SyncStateArticle>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readSyncStateArticle(value: unknown): SyncStateArticle | undefined {
  if (!isRecord(value) || typeof value.filename !== 'string') {
    return undefined;
  }

  // A ledger written before statuses existed recorded only successful pulls.
  const status = value.status === undefined ? 'pulled' : value.status;
  if (!isSyncStatus(status)) {
    return undefined;
  }

  return { filename: value.filename, status };
}

/** Parse the user-editable `sync-state.json`, tolerating garbage. */
export function readSyncState(raw: unknown): SyncState {
  const empty: SyncState = { articles: {} };
  if (!isRecord(raw) || !isRecord(raw.articles)) {
    return empty;
  }

  const articles: Record<string, SyncStateArticle> = {};
  for (const [id, value] of Object.entries(raw.articles)) {
    if (!/^\d+$/.test(id)) {
      continue;
    }
    const article = readSyncStateArticle(value);
    if (article !== undefined) {
      articles[id] = article;
    }
  }

  return { articles };
}

const EPUB_SUFFIX = '.epub';
const SIDECAR_SUFFIX = '.meta.json';

/** The EPUB a sidecar describes, or undefined when `name` is not a sidecar. */
function sidecarEpub(name: string): string | undefined {
  const lower = name.toLowerCase();
  if (!lower.endsWith(SIDECAR_SUFFIX)) {
    return undefined;
  }

  const epub = name.slice(0, -SIDECAR_SUFFIX.length);
  return lower.slice(0, -SIDECAR_SUFFIX.length).endsWith(EPUB_SUFFIX)
    ? epub
    : undefined;
}

/** Ids already present on the SD card, from sync-state and sidecars. */
export function computePulledIds(
  state: SyncState,
  files: string[],
  sidecarIds: Record<string, number>,
): Set<number> {
  // FAT is case-insensitive and `chooseFilename` dedupes case-insensitively,
  // so presence must too — otherwise a case difference between the recorded
  // filename and the on-disk name makes a pulled article look deleted and
  // Sync re-downloads it every run.
  const present = new Set(
    files.map((name) => basename(name).toLowerCase()),
  );
  const pulled = new Set<number>();

  for (const [id, entry] of Object.entries(state.articles)) {
    const articleId = Number(id);
    if (!Number.isInteger(articleId)) {
      continue;
    }

    if (entry.status === 'failed') {
      continue;
    }
    if (entry.status === 'skipped') {
      pulled.add(articleId);
      continue;
    }

    const saved = basename(entry.filename);
    if (saved.toLowerCase().endsWith(EPUB_SUFFIX) && present.has(saved.toLowerCase())) {
      pulled.add(articleId);
    }
  }

  for (const [name, id] of Object.entries(sidecarIds)) {
    const epub = sidecarEpub(basename(name));
    if (epub !== undefined && present.has(epub.toLowerCase())) {
      pulled.add(id);
    }
  }

  return pulled;
}

/** Firmware capabilities Sync needs, injected so tests can mock the device. */
export interface SyncDeps {
  relay: (
    method: string,
    url: string,
    headers: Record<string, string>,
    body?: string,
  ) => Promise<{ status: number; body: string }>;
  fetchToSd: (
    url: string,
    dest: string,
    headers: Record<string, string>,
  ) => Promise<{ status: number; bytes: number; complete: boolean }>;
  writeFile: (path: string, dataB64: string) => Promise<{ ok: boolean }>;
  listFiles: (path: string) => Promise<string[]>;
  readFile: (path: string) => Promise<string>;
}

/** Phase-aware progress reported while Sync runs. */
export type SyncProgress =
  | { phase: 'reading'; page: number; pages: number }
  | { phase: 'downloading'; index: number; total: number; title: string };

export interface SyncResult {
  pulled: number;
  failed: number;
  skipped: number;
  reachedEnd: boolean;
  limitHit: boolean;
  interrupted: boolean;
  /** Why paging stopped early, when interrupted. */
  stopReason?: string;
}

/** Firmware handles Sync needs from `api`, beyond the setup-wizard surface. */
export interface SyncApi {
  name: string;
  dir: CrossPointApi['dir'];
  relay: CrossPointApi['relay'];
  fetchToSd: SyncDeps['fetchToSd'];
  writeFile: CrossPointApi['writeFile'];
}

/** The slice of `fetch` Sync's device-file access depends on. */
export type FetchLike = (url: string) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

/**
 * Turn a `GET /api/files` body into non-directory names.
 *
 * A malformed body must throw rather than look like an empty directory: Sync
 * would otherwise treat every recorded article as deleted and re-download
 * the entire unread list.
 */
function fileNamesFromListing(payload: unknown): string[] {
  if (!Array.isArray(payload)) {
    throw new Error('Invalid /api/files response: expected a list.');
  }

  const names: string[] = [];
  for (const entry of payload) {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error('Invalid /api/files response: expected file objects.');
    }
    const { name, isDirectory } = entry as {
      name?: unknown;
      isDirectory?: unknown;
    };
    if (typeof name !== 'string') {
      throw new Error('Invalid /api/files response: file has no name.');
    }
    if (isDirectory !== true) {
      names.push(name);
    }
  }

  return names;
}

/**
 * Resolve a plugin-owned file name against the plugin's own SD folder.
 * Device-absolute paths (sidecars under `/Wallabag`) pass through unchanged;
 * `writeFile` requires an absolute path, so bare names cannot be sent as-is.
 *
 * A missing `api.dir` means the firmware predates it: throwing here beats
 * sending `undefined/config.json`, which the device rejects as `bad path`.
 */
export function pluginFilePath(
  pluginDir: string | undefined,
  name: string,
): string {
  if (name.startsWith('/')) {
    return name;
  }
  if (pluginDir === undefined || pluginDir === '') {
    throw new Error(
      'The device API did not provide a plugin directory (api.dir); ' +
        'update the firmware to 2.0.0rc or newer.',
    );
  }
  return `${pluginDir}/${name}`;
}

/** Device capabilities needed to read and write plugin files. */
type SyncDepsApi = Omit<SyncApi, 'fetchToSd'> &
  Partial<Pick<SyncApi, 'fetchToSd'>>;

/** Wire the firmware `api` and the page's `fetch` into SyncDeps. */
export function buildSyncDeps(api: SyncDepsApi, fetchImpl: FetchLike): SyncDeps {
  return {
    relay: async (method, url, headers, body) => {
      return await api.relay(method, url, headers, body);
    },
    fetchToSd: async (url, dest, headers) => {
      if (typeof api.fetchToSd !== 'function') {
        throw new Error(
          'Sync is unavailable: the device API has no file download.',
        );
      }
      return await api.fetchToSd(url, dest, headers);
    },
    writeFile: async (path, dataB64) => {
      await api.writeFile(pluginFilePath(api.dir, path), dataB64);
      return { ok: true };
    },
    listFiles: async (path) => {
      const url = `/api/files?path=${encodeURIComponent(path)}`;
      const response = await fetchImpl(url);
      if (!response.ok) {
        throw new Error(`Could not list ${path} (HTTP ${response.status}).`);
      }
      return fileNamesFromListing(await response.json());
    },
    readFile: async (path) => {
      const url =
        `/download?path=${encodeURIComponent(pluginFilePath(api.dir, path))}`;
      const response = await fetchImpl(url);
      if (!response.ok) {
        throw new Error(`Could not read ${path} (HTTP ${response.status}).`);
      }
      return await response.text();
    },
  };
}

const WALLABAG_DIR = '/Wallabag';
const SYNC_STATE_PATH = 'sync-state.json';
const CONFIG_PATH = 'config.json';
// The device relay buffers a whole reply in RAM and refuses anything over
// 32 KB. A wallabag metadata entry carries URLs, annotations, tags and the
// article's original HTTP headers, so 16 per page can overflow. The on-reader
// catalog uses 8/page for the same listing; match it to leave headroom.
const ENTRIES_PER_PAGE = 8;
const MIN_ENTRIES_PER_PAGE = 1;

/** An unread article as Sync needs it: an id, a title and its added date. */
interface SyncArticle {
  id: number;
  title: string;
  created_at: string;
}

/**
 * The `YYMMDD` prefix for an ISO timestamp's leading date, so a lexical sort
 * is chronological. Returns '' unless the value starts with a valid ISO
 * date-time, so malformed or impossible dates never produce a bogus prefix.
 */
function formatDatePrefix(createdAt: string): string {
  const startsWithIsoDateTime =
    /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/.test(
      createdAt,
    );
  if (!startsWithIsoDateTime || Number.isNaN(Date.parse(createdAt))) {
    return '';
  }
  return `${createdAt.slice(2, 4)}${createdAt.slice(5, 7)}${createdAt.slice(8, 10)}`;
}

/** One decoded page of the unread entry listing. */
interface EntriesPage {
  items: SyncArticle[];
  page: number;
  pages: number;
}

/** Turn a stored config into the form values the request builders expect. */
function configValues(config: WallabagConfig): SetupFormValues {
  return {
    serverUrl: config.server_url,
    clientId: config.client_id,
    clientSecret: config.client_secret,
    username: config.username,
    password: config.password,
    syncLimit: String(config.sync_limit ?? SYNC_LIMIT_DEFAULT),
    datePrefixedFilenames:
      config.date_prefixed_filenames === true ? 'true' : 'false',
  };
}

/** Clamp a configured batch size into the supported bounds. */
function syncLimitOf(config: WallabagConfig): number {
  const raw = config.sync_limit;
  if (raw === undefined || !Number.isFinite(raw)) {
    return SYNC_LIMIT_DEFAULT;
  }
  return clampSyncLimit(raw);
}

/** Trade the configured credentials for a bearer token, or throw. */
async function obtainToken(
  deps: SyncDeps,
  config: WallabagConfig,
): Promise<string> {
  const request = buildTokenRequest(configValues(config));

  let response: { status: number; body: string };
  try {
    response = await deps.relay(
      request.method,
      request.url,
      { 'Content-Type': 'application/x-www-form-urlencoded' },
      request.body,
    );
  } catch (error) {
    throw new Error(
      `Could not reach the wallabag server: ${describeRelayFailure(error)}`,
      { cause: error },
    );
  }

  if (!isOk(response.status)) {
    throw new Error(
      `Authentication failed: ${describeHttpFailure(
        response.status,
        response.body,
      )}.`,
    );
  }

  const token = parseAccessToken(response.body);
  if (token === undefined) {
    throw new Error('Authentication failed: no access token in the response.');
  }

  return token;
}

/** Build the metadata-only listing URL for one page of unread articles. */
function buildEntriesUrl(
  serverUrl: string,
  page: number,
  perPage: number = ENTRIES_PER_PAGE,
): string {
  const params = new URLSearchParams({
    archive: '0',
    detail: 'metadata',
    sort: 'created',
    order: 'desc',
    page: String(page),
    perPage: String(perPage),
  });

  return `${normalizeServerUrl(serverUrl)}/api/entries?${params.toString()}`;
}

/** Decode one entries page, or undefined when the body is malformed. */
function parseEntriesPage(body: string): EntriesPage | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return undefined;
  }

  if (!isRecord(parsed) || !isRecord(parsed._embedded)) {
    return undefined;
  }

  const rawItems = parsed._embedded.items;
  if (!Array.isArray(rawItems)) {
    return undefined;
  }

  const items: SyncArticle[] = [];
  for (const item of rawItems) {
    if (!isRecord(item)) {
      return undefined;
    }
    const { id, title, created_at } = item;
    if (typeof id !== 'number' || !Number.isInteger(id)) {
      return undefined;
    }
    items.push({
      id,
      title: typeof title === 'string' ? title : '',
      created_at: typeof created_at === 'string' ? created_at : '',
    });
  }

  return {
    items,
    page: typeof parsed.page === 'number' ? parsed.page : 1,
    pages: typeof parsed.pages === 'number' ? parsed.pages : 1,
  };
}

/** Decode a JSON body that may arrive either plain or base64 encoded. */
function parseJsonBody(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    try {
      return JSON.parse(atob(body));
    } catch {
      return undefined;
    }
  }
}

/** Check the saved config's required fields without importing zod. */
function isWallabagConfig(value: unknown): value is WallabagConfig {
  if (!isRecord(value)) {
    return false;
  }

  const textFields = [
    'server_url',
    'client_id',
    'client_secret',
    'username',
    'password',
  ] as const;
  for (const field of textFields) {
    if (typeof value[field] !== 'string') {
      return false;
    }
  }

  const limit = value.sync_limit;
  return limit === undefined || typeof limit === 'number';
}

/** Load the saved `config.json`; Sync never trusts blank form fields. */
async function loadSavedConfig(deps: SyncDeps): Promise<WallabagConfig> {
  let raw: string;
  try {
    raw = await deps.readFile(CONFIG_PATH);
  } catch (error) {
    throw new Error(
      'Could not load config.json. Save your credentials first.',
      { cause: error },
    );
  }

  const parsed = parseJsonBody(raw);
  if (!isWallabagConfig(parsed)) {
    throw new Error(
      'Could not read config.json. Save your credentials first.',
    );
  }

  return parsed;
}

/** Extract the article id a catalog sidecar records under `book_id`. */
function parseSidecarId(body: string): number | undefined {
  const parsed = parseJsonBody(body);
  if (!isRecord(parsed)) {
    return undefined;
  }

  const raw = parsed.book_id;
  const id = typeof raw === 'string' ? Number(raw) : raw;

  return typeof id === 'number' && Number.isInteger(id) ? id : undefined;
}

/** Read the sidecars that have a matching EPUB on disk, mapping name to id. */
async function readSidecarIds(
  deps: SyncDeps,
  files: string[],
): Promise<Record<string, number>> {
  const names = files.map((name) => basename(name));
  const present = new Set(names);
  const sidecars = names.filter((name) => {
    const epub = sidecarEpub(name);
    return epub !== undefined && present.has(epub);
  });

  const reads = await Promise.all(
    sidecars.map(async (name): Promise<[string, number] | undefined> => {
      try {
        const raw = await deps.readFile(`${WALLABAG_DIR}/${name}`);
        const id = parseSidecarId(raw);
        return id === undefined ? undefined : [name, id];
      } catch {
        // One unreadable sidecar simply contributes no id.
        return undefined;
      }
    }),
  );

  const ids: Record<string, number> = {};
  for (const entry of reads) {
    if (entry !== undefined) {
      ids[entry[0]] = entry[1];
    }
  }

  return ids;
}

/** Load the stored sync-state ledger, or an empty one when unreadable. */
async function loadSyncState(deps: SyncDeps): Promise<SyncState> {
  try {
    return readSyncState(parseJsonBody(await deps.readFile(SYNC_STATE_PATH)));
  } catch {
    return { articles: {} };
  }
}

/** Classify one download: skipped, failed, or pulled. */
function classifyOutcome(outcome: {
  status: number;
  complete: boolean;
}): SyncStatus {
  if (outcome.status === 404 || outcome.status === 410) {
    return 'skipped';
  }
  if (!isOk(outcome.status) || !outcome.complete) {
    return 'failed';
  }
  return 'pulled';
}

/** Pull one bounded batch of unread articles onto the SD card. */
export async function runSync(
  deps: SyncDeps,
  config: WallabagConfig,
  onProgress?: (progress: SyncProgress) => void,
): Promise<SyncResult> {
  const token = await obtainToken(deps, config);
  const authHeaders = { Authorization: `Bearer ${token}` };

  let files: string[];
  try {
    files = await deps.listFiles(WALLABAG_DIR);
  } catch (error) {
    throw new Error(`Could not list ${WALLABAG_DIR}: ${describeError(error)}`, {
      cause: error,
    });
  }

  const state = await loadSyncState(deps);
  const sidecarIds = await readSidecarIds(deps, files);
  const pulledIds = computePulledIds(state, files, sidecarIds);
  const names = new Set(files.map((name) => basename(name)));
  const nextState: SyncState = { articles: { ...state.articles } };

  const limit = syncLimitOf(config);
  let pulled = 0;
  let failed = 0;
  let skipped = 0;
  let page = 1;
  let pageSize = ENTRIES_PER_PAGE;
  let listingReachedEnd = false;
  let limitHit = false;
  let interrupted = false;
  let stopReason: string | undefined;

  const record = (
    article: SyncArticle,
    filename: string,
    status: SyncStatus,
  ): void => {
    nextState.articles[String(article.id)] = { filename, status };
  };

  // Phase 1: walk the entire unread listing before downloading anything, so
  // the progress total is the real number of articles that need syncing. The
  // walk only fetches metadata; the downloads happen in phase 2.
  const candidates: SyncArticle[] = [];
  const candidateIds = new Set<number>();

  while (true) {
    const url = buildEntriesUrl(config.server_url, page, pageSize);
    let response: { status: number; body: string };
    try {
      response = await deps.relay('GET', url, authHeaders);
    } catch (error) {
      // The device's relay rejects a reply it cannot buffer (over ~32 KB)
      // with a 502. Metadata pages can still cross that line, so retry the
      // walk at half the page size before giving up. Restarting from page 1
      // discards the partial candidates, which the smaller pages re-discover.
      if (
        pageSize > MIN_ENTRIES_PER_PAGE &&
        describeError(error).includes('large bodies')
      ) {
        pageSize = Math.max(MIN_ENTRIES_PER_PAGE, Math.floor(pageSize / 2));
        page = 1;
        candidates.length = 0;
        candidateIds.clear();
        continue;
      }
      interrupted = true;
      stopReason = describeRelayFailure(error);
      break;
    }

    if (!isOk(response.status)) {
      interrupted = true;
      stopReason = `page ${page}: ${describeHttpFailure(response.status, response.body)}`;
      break;
    }

    const listing = parseEntriesPage(response.body);
    if (listing === undefined) {
      interrupted = true;
      stopReason = `page ${page}: the entries listing could not be read`;
      break;
    }
    if (!listing.items.length) {
      listingReachedEnd = true;
      break;
    }

    onProgress?.({ phase: 'reading', page: listing.page, pages: Math.max(1, listing.pages) });

    for (const article of listing.items) {
      if (!pulledIds.has(article.id) && !candidateIds.has(article.id)) {
        candidateIds.add(article.id);
        candidates.push(article);
      }
    }

    if (page >= listing.pages) {
      listingReachedEnd = true;
      break;
    }
    page += 1;
  }

  // Phase 2: download the candidates newest-first until `sync_limit`
  // successful pulls land or the candidate list is exhausted. Skips and
  // failures do not consume the batch, matching the old skip-and-fill walk.
  try {
    for (const [i, article] of candidates.entries()) {
      if (pulled >= limit) {
        limitHit = true;
        break;
      }

      onProgress?.({ phase: 'downloading', index: i + 1, total: candidates.length, title: article.title });

      const datePrefix = config.date_prefixed_filenames
        ? formatDatePrefix(article.created_at)
        : undefined;
      const filename = chooseFilename(
        article.title,
        article.id,
        names,
        datePrefix,
      );
      names.add(filename);
      const dest = `${WALLABAG_DIR}/${filename}`;
      const exportUrl =
        `${normalizeServerUrl(config.server_url)}` +
        `/api/entries/${article.id}/export.epub`;

      try {
        const outcome = await deps.fetchToSd(exportUrl, dest, authHeaders);
        const verdict = classifyOutcome(outcome);
        if (verdict === 'skipped') {
          skipped += 1;
        } else if (verdict === 'failed') {
          failed += 1;
        } else {
          pulled += 1;
        }
        record(article, filename, verdict);
      } catch {
        failed += 1;
        record(article, filename, 'failed');
      }
      pulledIds.add(article.id);
    }
  } finally {
    await deps.writeFile(SYNC_STATE_PATH, encodeBase64Utf8(JSON.stringify(nextState)));
  }

  return {
    pulled,
    failed,
    skipped,
    reachedEnd: listingReachedEnd && !interrupted && !limitHit,
    limitHit,
    interrupted,
    stopReason,
  };
}

export type { CrossPointApi, RelayResponse } from './crossbag';

/**
 * Register the setup page with the firmware.
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
