"use strict";
(() => {
  // src/plugin.ts
  var PLUGIN_NAME = "crossbag";
  var SYNC_LIMIT_DEFAULT = 50;
  var SYNC_LIMIT_MIN = 1;
  var SYNC_LIMIT_MAX = 500;
  var FIELDS = [
    { name: "serverUrl", label: "Server URL", type: "text", value: "https://" },
    { name: "clientId", label: "Client ID", type: "text", value: "" },
    { name: "clientSecret", label: "Client Secret", type: "password", value: "" },
    { name: "username", label: "Username", type: "text", value: "" },
    { name: "password", label: "Password", type: "password", value: "" },
    {
      name: "syncLimit",
      label: "Articles per sync",
      type: "number",
      value: String(SYNC_LIMIT_DEFAULT),
      min: String(SYNC_LIMIT_MIN),
      max: String(SYNC_LIMIT_MAX)
    }
  ];
  function clampSyncLimit(value) {
    const whole = Math.trunc(value);
    return Math.min(SYNC_LIMIT_MAX, Math.max(SYNC_LIMIT_MIN, whole));
  }
  function parseSyncLimit(raw) {
    const trimmed = raw.trim();
    if (trimmed === "") {
      return SYNC_LIMIT_DEFAULT;
    }
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed)) {
      return SYNC_LIMIT_DEFAULT;
    }
    return clampSyncLimit(parsed);
  }
  function withoutTrailingSlashes(serverUrl) {
    return serverUrl.replace(/\/+$/, "");
  }
  function encodeBase64Utf8(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary);
  }
  function buildConfig(values) {
    return {
      server_url: withoutTrailingSlashes(values.serverUrl),
      client_id: values.clientId,
      client_secret: values.clientSecret,
      username: values.username,
      password: values.password,
      // The on-reader catalog cannot form-encode config values itself, so the
      // wizard stores the finished, encoded body for it to send verbatim.
      auth_body: buildTokenRequest(values).body,
      sync_limit: parseSyncLimit(values.syncLimit)
    };
  }
  function buildTokenRequest(values) {
    const body = new URLSearchParams({
      grant_type: "password",
      client_id: values.clientId,
      client_secret: values.clientSecret,
      username: values.username,
      password: values.password
    });
    return {
      method: "POST",
      url: `${withoutTrailingSlashes(values.serverUrl)}/oauth/v2/token`,
      body: body.toString()
    };
  }
  function buildTestRequest(serverUrl, token) {
    return {
      method: "GET",
      url: `${withoutTrailingSlashes(serverUrl)}/api/entries?perPage=1`,
      headers: { Authorization: `Bearer ${token}` }
    };
  }
  function readValues(inputs) {
    return {
      serverUrl: inputs.serverUrl.value,
      clientId: inputs.clientId.value,
      clientSecret: inputs.clientSecret.value,
      username: inputs.username.value,
      password: inputs.password.value,
      syncLimit: inputs.syncLimit.value
    };
  }
  function describeError(error) {
    return error instanceof Error ? error.message : String(error);
  }
  function isOk(status) {
    return status >= 200 && status < 300;
  }
  function parseAccessToken(body) {
    try {
      const parsed = JSON.parse(body);
      if (typeof parsed !== "object" || parsed === null) {
        return void 0;
      }
      const token = parsed.access_token;
      return typeof token === "string" && token !== "" ? token : void 0;
    } catch {
      return void 0;
    }
  }
  function describeHttpFailure(status, body) {
    const parsed = parseJsonBody(body);
    if (isRecord(parsed)) {
      const code = typeof parsed.error === "string" ? parsed.error : void 0;
      const description = typeof parsed.error_description === "string" ? parsed.error_description : void 0;
      if (code !== void 0 && description !== void 0 && description !== "") {
        return `${code}: ${description} (HTTP ${status})`;
      }
      if (code !== void 0 && code !== "") {
        return `${code} (HTTP ${status})`;
      }
    }
    return `HTTP ${status}`;
  }
  function setAlert(alert, message) {
    alert.textContent = message;
  }
  function setStatus(status, message) {
    status.textContent = message;
  }
  async function testConnection(inputs, api, alert) {
    const values = readValues(inputs);
    const tokenRequest = buildTokenRequest(values);
    try {
      const tokenResponse = await api.relay(
        tokenRequest.method,
        tokenRequest.url,
        { "Content-Type": "application/x-www-form-urlencoded" },
        tokenRequest.body
      );
      if (!isOk(tokenResponse.status)) {
        setAlert(
          alert,
          `Connection failed: ${describeHttpFailure(
            tokenResponse.status,
            tokenResponse.body
          )}.`
        );
        return;
      }
      const token = parseAccessToken(tokenResponse.body);
      if (token === void 0) {
        setAlert(alert, "Connection failed: no access token in the response.");
        return;
      }
      const request = buildTestRequest(values.serverUrl, token);
      const response = await api.relay(
        request.method,
        request.url,
        request.headers
      );
      if (!isOk(response.status)) {
        setAlert(
          alert,
          `Connection failed: ${describeHttpFailure(
            response.status,
            response.body
          )}.`
        );
        return;
      }
      setAlert(alert, "Connection works.");
    } catch (error) {
      setAlert(alert, `Connection failed: ${describeError(error)}`);
    }
  }
  async function saveConfig(inputs, api, alert) {
    const config = buildConfig(readValues(inputs));
    const payload = encodeBase64Utf8(JSON.stringify(config));
    try {
      await api.writeFile("config.json", payload);
      setAlert(
        alert,
        "Credentials saved. Switch to your device to browse articles."
      );
    } catch (error) {
      setAlert(alert, `Could not save credentials: ${describeError(error)}`);
    }
  }
  function addButton(form, label, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", onClick);
    form.append(button);
    return button;
  }
  function asSyncApi(api) {
    const candidate = api;
    return typeof candidate.fetchToSd === "function" ? api : void 0;
  }
  function summarize(result) {
    let summary = `${result.pulled} pulled \xB7 ${result.failed} failed (retries next sync) \xB7 ${result.skipped} skipped (deleted server-side)`;
    if (result.limitHit) {
      summary += " \u2014 more unread articles remain.";
    }
    if (result.interrupted) {
      summary += " \u2014 the sync did not reach the end of the list.";
    }
    return summary;
  }
  async function syncArticles(api, status, fetchImpl, button) {
    if (button.disabled) {
      return;
    }
    const syncApi = asSyncApi(api);
    if (syncApi === void 0) {
      setStatus(status, "Sync is unavailable: the device API has no file download.");
      return;
    }
    button.disabled = true;
    setStatus(status, "Syncing\u2026");
    try {
      const deps = buildSyncDeps(syncApi, fetchImpl);
      const config = await loadSavedConfig(deps);
      const result = await runSync(deps, config, (attempted, total) => {
        setStatus(status, `${attempted}/${total}`);
      });
      setStatus(status, summarize(result));
    } catch (error) {
      setStatus(status, describeError(error));
    } finally {
      button.disabled = false;
    }
  }
  function renderForm(container, api, fetchImpl = globalThis.fetch) {
    const form = document.createElement("form");
    const inputs = {};
    for (const field of FIELDS) {
      const label = document.createElement("label");
      label.textContent = field.label;
      const input = document.createElement("input");
      input.type = field.type;
      input.name = field.name;
      input.value = field.value;
      if (field.min !== void 0) {
        input.min = field.min;
      }
      if (field.max !== void 0) {
        input.max = field.max;
      }
      label.append(input);
      form.append(label);
      inputs[field.name] = input;
    }
    const alert = document.createElement("p");
    alert.setAttribute("role", "alert");
    const status = document.createElement("p");
    status.setAttribute("data-sync-status", "");
    addButton(form, "Test Connection", () => {
      void testConnection(inputs, api, alert);
    });
    addButton(form, "Save", () => {
      void saveConfig(inputs, api, alert);
    });
    const syncButton = addButton(form, "Sync", () => {
      void syncArticles(api, status, fetchImpl, syncButton);
    });
    form.append(status);
    form.append(alert);
    container.append(form);
  }
  var ILLEGAL_FILENAME_CHARS = /[\\/:*?"<>|\u0000-\u001f\u007f]/g;
  function sanitizeFilenamePart(raw) {
    const cleaned = raw.replace(ILLEGAL_FILENAME_CHARS, " ").replace(/\s+/g, " ").replace(/^[.\s]+|[.\s]+$/g, "");
    return cleaned.length > 0 ? cleaned : "untitled";
  }
  function basename(path) {
    const parts = path.split("/");
    return parts[parts.length - 1] ?? path;
  }
  function chooseFilename(title, id, existing) {
    const base = sanitizeFilenamePart(title);
    const taken = new Set([...existing].map((name) => name.toLowerCase()));
    const isTaken = (candidate) => taken.has(candidate.toLowerCase());
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
  var SYNC_STATUS_VALUES = ["pulled", "skipped", "failed"];
  function isSyncStatus(value) {
    return typeof value === "string" && SYNC_STATUS_VALUES.includes(value);
  }
  function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  function readSyncStateArticle(value) {
    if (!isRecord(value) || typeof value.filename !== "string") {
      return void 0;
    }
    const status = value.status === void 0 ? "pulled" : value.status;
    if (!isSyncStatus(status)) {
      return void 0;
    }
    return { filename: value.filename, status };
  }
  function readSyncState(raw) {
    const empty = { articles: {} };
    if (!isRecord(raw) || !isRecord(raw.articles)) {
      return empty;
    }
    const articles = {};
    for (const [id, value] of Object.entries(raw.articles)) {
      if (!/^\d+$/.test(id)) {
        continue;
      }
      const article = readSyncStateArticle(value);
      if (article !== void 0) {
        articles[id] = article;
      }
    }
    return { articles };
  }
  var EPUB_SUFFIX = ".epub";
  var SIDECAR_SUFFIX = ".meta.json";
  function sidecarEpub(name) {
    if (!name.endsWith(SIDECAR_SUFFIX)) {
      return void 0;
    }
    const epub = name.slice(0, -SIDECAR_SUFFIX.length);
    return epub.endsWith(EPUB_SUFFIX) ? epub : void 0;
  }
  function computePulledIds(state, files, sidecarIds) {
    const present = new Set(files.map((name) => basename(name)));
    const pulled = /* @__PURE__ */ new Set();
    for (const [id, entry] of Object.entries(state.articles)) {
      const articleId = Number(id);
      if (!Number.isInteger(articleId)) {
        continue;
      }
      if (entry.status === "failed") {
        continue;
      }
      if (entry.status === "skipped") {
        pulled.add(articleId);
        continue;
      }
      const saved = basename(entry.filename);
      if (saved.endsWith(EPUB_SUFFIX) && present.has(saved)) {
        pulled.add(articleId);
      }
    }
    for (const [name, id] of Object.entries(sidecarIds)) {
      const epub = sidecarEpub(basename(name));
      if (epub !== void 0 && present.has(epub)) {
        pulled.add(id);
      }
    }
    return pulled;
  }
  function fileNamesFromListing(payload) {
    if (!Array.isArray(payload)) {
      throw new Error("Invalid /api/files response: expected a list.");
    }
    const names = [];
    for (const entry of payload) {
      if (typeof entry !== "object" || entry === null) {
        throw new Error("Invalid /api/files response: expected file objects.");
      }
      const { name, isDirectory } = entry;
      if (typeof name !== "string") {
        throw new Error("Invalid /api/files response: file has no name.");
      }
      if (isDirectory !== true) {
        names.push(name);
      }
    }
    return names;
  }
  function buildSyncDeps(api, fetchImpl) {
    return {
      relay: async (method, url, headers, body) => {
        return await api.relay(method, url, headers, body);
      },
      fetchToSd: (url, dest, headers) => api.fetchToSd(url, dest, headers),
      writeFile: async (path, dataB64) => {
        await api.writeFile(path, dataB64);
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
        const url = `/download?path=${encodeURIComponent(path)}`;
        const response = await fetchImpl(url);
        if (!response.ok) {
          throw new Error(`Could not read ${path} (HTTP ${response.status}).`);
        }
        return await response.text();
      }
    };
  }
  var WALLABAG_DIR = "/Wallabag";
  var SYNC_STATE_PATH = "sync-state.json";
  var CONFIG_PATH = "config.json";
  var ENTRIES_PER_PAGE = 16;
  function configValues(config) {
    return {
      serverUrl: config.server_url,
      clientId: config.client_id,
      clientSecret: config.client_secret,
      username: config.username,
      password: config.password,
      syncLimit: String(config.sync_limit ?? SYNC_LIMIT_DEFAULT)
    };
  }
  function syncLimitOf(config) {
    const raw = config.sync_limit;
    if (raw === void 0 || !Number.isFinite(raw)) {
      return SYNC_LIMIT_DEFAULT;
    }
    return clampSyncLimit(raw);
  }
  async function obtainToken(deps, config) {
    const request = buildTokenRequest(configValues(config));
    let response;
    try {
      response = await deps.relay(
        request.method,
        request.url,
        { "Content-Type": "application/x-www-form-urlencoded" },
        request.body
      );
    } catch (error) {
      throw new Error(
        `Could not reach the wallabag server: ${describeError(error)}`,
        { cause: error }
      );
    }
    if (!isOk(response.status)) {
      throw new Error(
        `Authentication failed: ${describeHttpFailure(
          response.status,
          response.body
        )}.`
      );
    }
    const token = parseAccessToken(response.body);
    if (token === void 0) {
      throw new Error("Authentication failed: no access token in the response.");
    }
    return token;
  }
  function buildEntriesUrl(serverUrl, page) {
    const params = new URLSearchParams({
      archive: "0",
      detail: "metadata",
      sort: "created",
      order: "desc",
      page: String(page),
      perPage: String(ENTRIES_PER_PAGE)
    });
    return `${withoutTrailingSlashes(serverUrl)}/api/entries?${params.toString()}`;
  }
  function parseEntriesPage(body) {
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      return void 0;
    }
    if (!isRecord(parsed) || !isRecord(parsed._embedded)) {
      return void 0;
    }
    const rawItems = parsed._embedded.items;
    if (!Array.isArray(rawItems)) {
      return void 0;
    }
    const items = [];
    for (const item of rawItems) {
      if (!isRecord(item)) {
        return void 0;
      }
      const { id, title } = item;
      if (typeof id !== "number" || !Number.isInteger(id)) {
        return void 0;
      }
      items.push({ id, title: typeof title === "string" ? title : "" });
    }
    return {
      items,
      page: typeof parsed.page === "number" ? parsed.page : 1,
      pages: typeof parsed.pages === "number" ? parsed.pages : 1
    };
  }
  function parseJsonBody(body) {
    try {
      return JSON.parse(body);
    } catch {
      try {
        return JSON.parse(atob(body));
      } catch {
        return void 0;
      }
    }
  }
  function isWallabagConfig(value) {
    if (!isRecord(value)) {
      return false;
    }
    const textFields = [
      "server_url",
      "client_id",
      "client_secret",
      "username",
      "password"
    ];
    for (const field of textFields) {
      if (typeof value[field] !== "string") {
        return false;
      }
    }
    const limit = value.sync_limit;
    return limit === void 0 || typeof limit === "number";
  }
  async function loadSavedConfig(deps) {
    let raw;
    try {
      raw = await deps.readFile(CONFIG_PATH);
    } catch (error) {
      throw new Error(
        "Could not load config.json. Save your credentials first.",
        { cause: error }
      );
    }
    const parsed = parseJsonBody(raw);
    if (!isWallabagConfig(parsed)) {
      throw new Error(
        "Could not read config.json. Save your credentials first."
      );
    }
    return parsed;
  }
  function parseSidecarId(body) {
    const parsed = parseJsonBody(body);
    if (!isRecord(parsed)) {
      return void 0;
    }
    const raw = parsed.book_id;
    const id = typeof raw === "string" ? Number(raw) : raw;
    return typeof id === "number" && Number.isInteger(id) ? id : void 0;
  }
  async function readSidecarIds(deps, files) {
    const names = files.map((name) => basename(name));
    const present = new Set(names);
    const sidecars = names.filter((name) => {
      const epub = sidecarEpub(name);
      return epub !== void 0 && present.has(epub);
    });
    const reads = await Promise.all(
      sidecars.map(async (name) => {
        try {
          const raw = await deps.readFile(`${WALLABAG_DIR}/${name}`);
          const id = parseSidecarId(raw);
          return id === void 0 ? void 0 : [name, id];
        } catch {
          return void 0;
        }
      })
    );
    const ids = {};
    for (const entry of reads) {
      if (entry !== void 0) {
        ids[entry[0]] = entry[1];
      }
    }
    return ids;
  }
  async function loadSyncState(deps) {
    try {
      return readSyncState(parseJsonBody(await deps.readFile(SYNC_STATE_PATH)));
    } catch {
      return { articles: {} };
    }
  }
  function classifyOutcome(outcome) {
    if (outcome.status === 404 || outcome.status === 410) {
      return "skipped";
    }
    if (!isOk(outcome.status) || !outcome.complete) {
      return "failed";
    }
    return "pulled";
  }
  async function runSync(deps, config, onProgress) {
    const token = await obtainToken(deps, config);
    const authHeaders = { Authorization: `Bearer ${token}` };
    let files;
    try {
      files = await deps.listFiles(WALLABAG_DIR);
    } catch (error) {
      throw new Error(`Could not list ${WALLABAG_DIR}: ${describeError(error)}`, {
        cause: error
      });
    }
    const state = await loadSyncState(deps);
    const sidecarIds = await readSidecarIds(deps, files);
    const pulledIds = computePulledIds(state, files, sidecarIds);
    const names = new Set(files.map((name) => basename(name)));
    const nextState = { articles: { ...state.articles } };
    const candidates = /* @__PURE__ */ new Set();
    const limit = syncLimitOf(config);
    let pulled = 0;
    let failed = 0;
    let skipped = 0;
    let page = 1;
    let reachedEnd = false;
    let limitHit = false;
    let interrupted = false;
    const record = (article, filename, status) => {
      nextState.articles[String(article.id)] = { filename, status };
    };
    const reportProgress = () => {
      if (onProgress !== void 0 && candidates.size > 0) {
        onProgress(
          pulled + failed + skipped,
          Math.min(limit, candidates.size)
        );
      }
    };
    try {
      while (true) {
        if (pulled >= limit) {
          limitHit = true;
          break;
        }
        const url = buildEntriesUrl(config.server_url, page);
        let response;
        try {
          response = await deps.relay("GET", url, authHeaders);
        } catch {
          interrupted = true;
          break;
        }
        if (!isOk(response.status)) {
          interrupted = true;
          break;
        }
        const listing = parseEntriesPage(response.body);
        if (listing === void 0) {
          interrupted = true;
          break;
        }
        if (listing.items.length === 0) {
          reachedEnd = true;
          break;
        }
        for (const article of listing.items) {
          if (!pulledIds.has(article.id)) {
            candidates.add(article.id);
          }
        }
        reportProgress();
        for (const article of listing.items) {
          if (pulled >= limit) {
            limitHit = true;
            break;
          }
          if (pulledIds.has(article.id)) {
            continue;
          }
          const filename = chooseFilename(article.title, article.id, names);
          names.add(filename);
          const dest = `${WALLABAG_DIR}/${filename}`;
          const exportUrl = `${withoutTrailingSlashes(config.server_url)}/api/entries/${article.id}/export.epub`;
          try {
            const outcome = await deps.fetchToSd(exportUrl, dest, authHeaders);
            const verdict = classifyOutcome(outcome);
            if (verdict === "skipped") {
              skipped += 1;
            } else if (verdict === "failed") {
              failed += 1;
            } else {
              pulled += 1;
            }
            record(article, filename, verdict);
          } catch {
            failed += 1;
            record(article, filename, "failed");
          }
          reportProgress();
        }
        if (limitHit) {
          break;
        }
        if (page >= listing.pages) {
          reachedEnd = true;
          break;
        }
        page += 1;
      }
    } finally {
      await deps.writeFile(
        SYNC_STATE_PATH,
        encodeBase64Utf8(JSON.stringify(nextState))
      );
    }
    return { pulled, failed, skipped, reachedEnd, limitHit, interrupted };
  }
  function main() {
    const crossPoint = globalThis.CrossPoint;
    if (crossPoint === void 0) {
      return;
    }
    crossPoint.registerPlugin((container, api) => {
      renderForm(container, api);
    });
  }
  main();
})();
