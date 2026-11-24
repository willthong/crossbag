"use strict";
(() => {
  // src/plugin.ts
  var PLUGIN_NAME = "crossbag", SYNC_LIMIT_DEFAULT = 50, SYNC_LIMIT_MIN = 1, SYNC_LIMIT_MAX = 500, DEFAULT_WALLABAG_DIR = "/Wallabag", FIELDS = [
    { name: "serverUrl", label: "Server URL", type: "text", value: "https://" },
    { name: "clientId", label: "Client ID", type: "text", value: "" },
    { name: "clientSecret", label: "Client Secret", type: "password", value: "" },
    { name: "username", label: "Username", type: "text", value: "" },
    { name: "password", label: "Password", type: "password", value: "" },
    {
      name: "wallabagDir",
      label: "Article folder",
      type: "text",
      value: DEFAULT_WALLABAG_DIR
    },
    {
      name: "syncLimit",
      label: "Articles per sync",
      type: "number",
      value: String(50),
      min: String(1),
      max: String(500)
    },
    {
      name: "datePrefixedFilenames",
      label: "Date-prefixed filenames",
      type: "checkbox",
      value: "false"
    },
    {
      name: "pruneOnSync",
      label: "Prune archived articles",
      type: "checkbox",
      value: "true"
    },
    {
      name: "syncFavourites",
      label: "Sync favourite articles",
      type: "checkbox",
      value: "false"
    }
  ];
  function clampSyncLimit(value) {
    let whole = Math.trunc(value);
    return Math.min(500, Math.max(1, whole));
  }
  function parseSyncLimit(raw) {
    let trimmed = raw.trim();
    if (trimmed === "")
      return 50;
    let parsed = Number(trimmed);
    return Number.isInteger(parsed) ? clampSyncLimit(parsed) : 50;
  }
  function normalizeWallabagDir(raw) {
    if (typeof raw != "string")
      return DEFAULT_WALLABAG_DIR;
    let trimmed = raw.trim();
    if (trimmed === "" || !trimmed.startsWith("/"))
      return DEFAULT_WALLABAG_DIR;
    for (let char of trimmed) {
      let code = char.codePointAt(0) ?? 0;
      if (code < 32 || code === 127)
        return DEFAULT_WALLABAG_DIR;
    }
    let collapsed = trimmed.replace(/\/+$/, "").replace(/\/{2,}/g, "/");
    return collapsed === "" || collapsed === "/" || collapsed.split("/").some((segment) => segment === "." || segment === "..") ? DEFAULT_WALLABAG_DIR : collapsed;
  }
  function normalizeServerUrl(serverUrl) {
    return serverUrl.trim().replace(/\/+$/, "");
  }
  function serverUrlProblem(serverUrl) {
    let url = normalizeServerUrl(serverUrl);
    if (url === "")
      return "Enter the server URL.";
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return "The server URL must be a full address, like https://wallabag.example.com.";
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      return "The server URL must start with http:// or https://.";
    if (parsed.hostname === "")
      return "The server URL needs a host name, like https://wallabag.example.com.";
  }
  function encodeBase64Utf8(text) {
    let bytes = new TextEncoder().encode(text), binary = "";
    for (let byte of bytes)
      binary += String.fromCharCode(byte);
    return btoa(binary);
  }
  function buildConfig(values) {
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
      wallabag_dir: normalizeWallabagDir(values.wallabagDir),
      date_prefixed_filenames: values.datePrefixedFilenames === "true",
      // A form rendered before the checkbox existed omits the key; pruning is
      // the intended default, so only an explicit "off" turns it off.
      prune_on_sync: values.pruneOnSync !== "false",
      // Off unless the checkbox was explicitly ticked, which also keeps configs
      // written before the flag existed on the unread-only mirror.
      sync_favourites: values.syncFavourites === "true"
    };
  }
  function buildTokenRequest(values) {
    let body = new URLSearchParams({
      grant_type: "password",
      client_id: values.clientId,
      client_secret: values.clientSecret,
      username: values.username,
      password: values.password
    });
    return {
      method: "POST",
      url: `${normalizeServerUrl(values.serverUrl)}/oauth/v2/token`,
      body: body.toString()
    };
  }
  function buildTestRequest(serverUrl, token) {
    return {
      method: "GET",
      url: `${normalizeServerUrl(serverUrl)}/api/entries?detail=metadata&perPage=1`,
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
      wallabagDir: inputs.wallabagDir.value,
      syncLimit: inputs.syncLimit.value,
      datePrefixedFilenames: inputs.datePrefixedFilenames.checked ? "true" : "false",
      pruneOnSync: inputs.pruneOnSync.checked ? "true" : "false",
      syncFavourites: inputs.syncFavourites.checked ? "true" : "false"
    };
  }
  function describeError(error) {
    return error instanceof Error ? error.message : String(error);
  }
  function describeRelayFailure(error) {
    let message = describeError(error);
    return message.includes("/api/relay") ? message.includes("large bodies") ? `the reply was too large for the device relay \u2014 the server may be ignoring the metadata request (the device said: ${message})` : `the device could not reach the server \u2014 check the server URL and that the reader is online (the device said: ${message})` : message;
  }
  function isOk(status) {
    return status >= 200 && status < 300;
  }
  function parseAccessToken(body) {
    try {
      let parsed = JSON.parse(body);
      if (typeof parsed != "object" || parsed === null)
        return;
      let token = parsed.access_token;
      return typeof token == "string" && token !== "" ? token : void 0;
    } catch {
      return;
    }
  }
  function describeHttpFailure(status, body) {
    let parsed = parseJsonBody(body);
    if (isRecord(parsed)) {
      let code = typeof parsed.error == "string" ? parsed.error : void 0, description = typeof parsed.error_description == "string" ? parsed.error_description : void 0;
      if (code !== void 0 && description !== void 0 && description !== "")
        return `${code}: ${description} (HTTP ${status})`;
      if (code !== void 0 && code !== "")
        return `${code} (HTTP ${status})`;
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
    let values = readValues(inputs), problem = serverUrlProblem(values.serverUrl);
    if (problem !== void 0) {
      setAlert(alert, problem);
      return;
    }
    let tokenRequest = buildTokenRequest(values);
    try {
      let tokenResponse = await api.relay(
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
      let token = parseAccessToken(tokenResponse.body);
      if (token === void 0) {
        setAlert(alert, "Connection failed: no access token in the response.");
        return;
      }
      let request = buildTestRequest(values.serverUrl, token), response = await api.relay(
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
      setAlert(alert, `Connection failed: ${describeRelayFailure(error)}`);
    }
  }
  async function saveConfig(inputs, api, alert) {
    let values = readValues(inputs), problem = serverUrlProblem(values.serverUrl);
    if (problem !== void 0) {
      setAlert(alert, problem);
      return;
    }
    let config = buildConfig(values), payload = encodeBase64Utf8(JSON.stringify(config));
    try {
      await api.writeFile(pluginFilePath(api.dir, CONFIG_PATH), payload), setAlert(
        alert,
        "Credentials saved. Switch to your device to browse articles."
      );
    } catch (error) {
      setAlert(alert, `Could not save credentials: ${describeError(error)}`);
    }
  }
  var BUTTON_STYLES = `
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
  function ensureButtonStyles(container) {
    if (container.querySelector("style[data-cbag-styles]") !== null)
      return;
    let style = document.createElement("style");
    style.setAttribute("data-cbag-styles", ""), style.textContent = BUTTON_STYLES, container.append(style);
  }
  function addButton(parent, label, variant, onClick) {
    let button = document.createElement("button");
    return button.type = "button", button.className = `cbag-btn cbag-btn-${variant}`, button.textContent = label, button.addEventListener("click", onClick), parent.append(button), button;
  }
  function asSyncApi(api) {
    return typeof api.fetchToSd == "function" ? api : void 0;
  }
  function summarize(result, lastLine) {
    let summary = `${result.pulled} pulled \xB7 ${result.failed} failed (retries next sync) \xB7 ${result.skipped} skipped (deleted server-side)`;
    return result.pruned !== void 0 && (summary += ` \xB7 ${result.pruned} pruned`), result.limitHit && (summary += " \u2014 more unread articles remain."), result.interrupted && (summary += " \u2014 the sync did not reach the end of the list.", result.stopReason !== void 0 && (summary += ` Reason: ${result.stopReason}`), lastLine !== void 0 && (summary = `${lastLine} \u2014 ${summary}`)), summary;
  }
  async function syncArticles(api, status, fetchImpl, button) {
    if (button.disabled)
      return;
    let syncApi = asSyncApi(api);
    if (syncApi === void 0) {
      setStatus(status, "Sync is unavailable: the device API has no file download.");
      return;
    }
    button.disabled = !0, setStatus(status, "Syncing\u2026");
    let lastStatusLine;
    try {
      let deps = buildSyncDeps(syncApi, fetchImpl), config = await loadSavedConfig(deps), result = await runSync(deps, config, (p) => {
        p.phase === "reading" ? lastStatusLine = `Reading unread list: page ${p.page}/${p.pages}` : p.phase === "pruning" ? lastStatusLine = `Pruning ${p.index}/${p.total}` : lastStatusLine = `Downloading ${p.index}/${p.total}${p.title ? `: ${p.title}` : ""}`, setStatus(status, lastStatusLine);
      });
      setStatus(status, summarize(result, lastStatusLine));
    } catch (error) {
      let why = describeError(error);
      setStatus(status, `${lastStatusLine ? `${lastStatusLine} \u2014 ` : ""}${why}`);
    } finally {
      button.disabled = !1;
    }
  }
  function applyPrefill(inputs, values) {
    for (let field of FIELDS) {
      let input = inputs[field.name];
      if (field.type === "checkbox") {
        input.checked === (field.value === "true") && (input.checked = values[field.name] === "true");
        continue;
      }
      input.value === field.value && (input.value = values[field.name]);
    }
  }
  async function loadPrefillValues(api, fetchImpl) {
    if (!(api.dir === void 0 || api.dir === "") && !(asSyncApi(api) === void 0 && fetchImpl === globalThis.fetch))
      try {
        let deps = buildSyncDeps(api, fetchImpl);
        return configValues(await loadSavedConfig(deps));
      } catch {
        return;
      }
  }
  function renderForm(container, api, fetchImpl = globalThis.fetch) {
    let form = document.createElement("form"), inputs = {};
    for (let field of FIELDS) {
      let label = document.createElement("label");
      label.textContent = field.label;
      let input = document.createElement("input");
      input.type = field.type, input.name = field.name, field.type === "checkbox" ? input.checked = field.value === "true" : input.value = field.value, field.min !== void 0 && (input.min = field.min), field.max !== void 0 && (input.max = field.max), label.append(input), form.append(label), inputs[field.name] = input;
    }
    loadPrefillValues(api, fetchImpl).then((values) => {
      values !== void 0 && applyPrefill(inputs, values);
    });
    let alert = document.createElement("p");
    alert.setAttribute("role", "alert");
    let status = document.createElement("p");
    status.setAttribute("data-sync-status", "");
    let actions = document.createElement("div");
    actions.className = "cbag-actions", addButton(actions, "Test Connection", "secondary", () => {
      testConnection(inputs, api, alert);
    }), addButton(actions, "Save", "primary", () => {
      saveConfig(inputs, api, alert);
    });
    let syncButton = addButton(actions, "Sync", "accent", () => {
      syncArticles(api, status, fetchImpl, syncButton);
    });
    form.append(actions), form.append(status), form.append(alert), ensureButtonStyles(container), container.append(form);
  }
  var ILLEGAL_FILENAME_CHARS = /[\\/:*?"<>|\u0000-\u001f\u007f]/g;
  function sanitizeFilenamePart(raw) {
    let cleaned = raw.replace(ILLEGAL_FILENAME_CHARS, " ").replace(/\s+/g, " ").replace(/^[.\s]+|[.\s]+$/g, "");
    return cleaned.length > 0 ? cleaned : "untitled";
  }
  function basename(path) {
    let parts = path.split("/");
    return parts[parts.length - 1] ?? path;
  }
  function chooseFilename(title, id, existing, datePrefix) {
    let sanitized = sanitizeFilenamePart(title), base = datePrefix ? `${datePrefix}-${sanitized}` : sanitized, taken = new Set([...existing].map((name) => name.toLowerCase())), isTaken = (candidate) => taken.has(candidate.toLowerCase()), preferred = `${base}.epub`;
    if (!isTaken(preferred))
      return preferred;
    let qualified = `${base}-${id}.epub`;
    if (!isTaken(qualified))
      return qualified;
    for (let suffix = 2; ; suffix += 1) {
      let candidate = `${base}-${id}-${suffix}.epub`;
      if (!isTaken(candidate))
        return candidate;
    }
  }
  var SYNC_STATUS_VALUES = ["pulled", "skipped", "failed"];
  function isSyncStatus(value) {
    return typeof value == "string" && SYNC_STATUS_VALUES.includes(value);
  }
  function isRecord(value) {
    return typeof value == "object" && value !== null && !Array.isArray(value);
  }
  function readSyncStateArticle(value) {
    if (!isRecord(value) || typeof value.filename != "string")
      return;
    let status = value.status === void 0 ? "pulled" : value.status;
    if (isSyncStatus(status))
      return { filename: value.filename, status };
  }
  function readSyncState(raw) {
    let empty = { articles: {} };
    if (!isRecord(raw) || !isRecord(raw.articles))
      return empty;
    let articles = {};
    for (let [id, value] of Object.entries(raw.articles)) {
      if (!/^\d+$/.test(id))
        continue;
      let article = readSyncStateArticle(value);
      article !== void 0 && (articles[id] = article);
    }
    return { articles };
  }
  var EPUB_SUFFIX = ".epub", SIDECAR_SUFFIX = ".meta.json";
  function sidecarEpub(name) {
    let lower = name.toLowerCase();
    if (!lower.endsWith(SIDECAR_SUFFIX))
      return;
    let epub = name.slice(0, -SIDECAR_SUFFIX.length);
    return lower.slice(0, -SIDECAR_SUFFIX.length).endsWith(EPUB_SUFFIX) ? epub : void 0;
  }
  function computePulledIds(state, files, sidecarIds) {
    let present = new Set(
      files.map((name) => basename(name).toLowerCase())
    ), pulled = /* @__PURE__ */ new Set();
    for (let [id, entry] of Object.entries(state.articles)) {
      let articleId = Number(id);
      if (!Number.isInteger(articleId) || entry.status === "failed")
        continue;
      if (entry.status === "skipped") {
        pulled.add(articleId);
        continue;
      }
      let saved = basename(entry.filename);
      saved.toLowerCase().endsWith(EPUB_SUFFIX) && present.has(saved.toLowerCase()) && pulled.add(articleId);
    }
    for (let [name, id] of Object.entries(sidecarIds)) {
      let epub = sidecarEpub(basename(name));
      epub !== void 0 && present.has(epub.toLowerCase()) && pulled.add(id);
    }
    return pulled;
  }
  function fileNamesFromListing(payload) {
    if (!Array.isArray(payload))
      throw new Error("Invalid /api/files response: expected a list.");
    let names = [];
    for (let entry of payload) {
      if (typeof entry != "object" || entry === null)
        throw new Error("Invalid /api/files response: expected file objects.");
      let { name, isDirectory } = entry;
      if (typeof name != "string")
        throw new Error("Invalid /api/files response: file has no name.");
      isDirectory !== !0 && names.push(name);
    }
    return names;
  }
  function pluginFilePath(pluginDir, name) {
    if (name.startsWith("/"))
      return name;
    if (pluginDir === void 0 || pluginDir === "")
      throw new Error(
        "The device API did not provide a plugin directory (api.dir); update the firmware to 2.0.0rc or newer."
      );
    return `${pluginDir}/${name}`;
  }
  function buildSyncDeps(api, fetchImpl) {
    return {
      relay: async (method, url, headers, body) => await api.relay(method, url, headers, body),
      fetchToSd: async (url, dest, headers) => {
        if (typeof api.fetchToSd != "function")
          throw new Error(
            "Sync is unavailable: the device API has no file download."
          );
        return await api.fetchToSd(url, dest, headers);
      },
      writeFile: async (path, dataB64) => (await api.writeFile(pluginFilePath(api.dir, path), dataB64), { ok: !0 }),
      listFiles: async (path) => {
        let url = `/api/files?path=${encodeURIComponent(path)}`, response = await fetchImpl(url);
        if (!response.ok)
          throw new Error(`Could not list ${path} (HTTP ${response.status}).`);
        return fileNamesFromListing(await response.json());
      },
      readFile: async (path) => {
        let url = `/download?path=${encodeURIComponent(pluginFilePath(api.dir, path))}`, response = await fetchImpl(url);
        if (!response.ok)
          throw new Error(`Could not read ${path} (HTTP ${response.status}).`);
        return await response.text();
      },
      deleteFile: async (path) => ({ status: (await fetchImpl("/delete", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ path }).toString()
      })).status })
    };
  }
  var SYNC_STATE_PATH = "sync-state.json", CONFIG_PATH = "config.json", ENTRIES_PER_PAGE = 8, MIN_ENTRIES_PER_PAGE = 1;
  function formatDatePrefix(createdAt) {
    return !/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/.test(
      createdAt
    ) || Number.isNaN(Date.parse(createdAt)) ? "" : `${createdAt.slice(2, 4)}${createdAt.slice(5, 7)}${createdAt.slice(8, 10)}`;
  }
  function configValues(config) {
    return {
      serverUrl: config.server_url,
      clientId: config.client_id,
      clientSecret: config.client_secret,
      username: config.username,
      password: config.password,
      wallabagDir: normalizeWallabagDir(config.wallabag_dir),
      syncLimit: String(config.sync_limit ?? 50),
      datePrefixedFilenames: config.date_prefixed_filenames === !0 ? "true" : "false",
      pruneOnSync: config.prune_on_sync === !1 ? "false" : "true",
      syncFavourites: config.sync_favourites === !0 ? "true" : "false"
    };
  }
  function syncLimitOf(config) {
    let raw = config.sync_limit;
    return raw === void 0 || !Number.isFinite(raw) ? 50 : clampSyncLimit(raw);
  }
  async function obtainToken(deps, config) {
    let request = buildTokenRequest(configValues(config)), response;
    try {
      response = await deps.relay(
        request.method,
        request.url,
        { "Content-Type": "application/x-www-form-urlencoded" },
        request.body
      );
    } catch (error) {
      throw new Error(
        `Could not reach the wallabag server: ${describeRelayFailure(error)}`,
        { cause: error }
      );
    }
    if (!isOk(response.status))
      throw new Error(
        `Authentication failed: ${describeHttpFailure(
          response.status,
          response.body
        )}.`
      );
    let token = parseAccessToken(response.body);
    if (token === void 0)
      throw new Error("Authentication failed: no access token in the response.");
    return token;
  }
  function buildEntriesUrl(serverUrl, page, filter, perPage = ENTRIES_PER_PAGE) {
    let params = new URLSearchParams({
      ...filter,
      detail: "metadata",
      sort: "created",
      order: "desc",
      page: String(page),
      perPage: String(perPage)
    });
    return `${normalizeServerUrl(serverUrl)}/api/entries?${params.toString()}`;
  }
  function parseEntriesPage(body) {
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      return;
    }
    if (!isRecord(parsed) || !isRecord(parsed._embedded))
      return;
    let rawItems = parsed._embedded.items;
    if (!Array.isArray(rawItems))
      return;
    let items = [];
    for (let item of rawItems) {
      if (!isRecord(item))
        return;
      let { id, title, created_at } = item;
      if (typeof id != "number" || !Number.isInteger(id))
        return;
      items.push({
        id,
        title: typeof title == "string" ? title : "",
        created_at: typeof created_at == "string" ? created_at : ""
      });
    }
    return {
      items,
      page: typeof parsed.page == "number" ? parsed.page : 1,
      pages: typeof parsed.pages == "number" ? parsed.pages : 1
    };
  }
  async function walkEntries(deps, config, authHeaders, filter, onProgress) {
    let items = [], seen = /* @__PURE__ */ new Set(), page = 1, pageSize = ENTRIES_PER_PAGE;
    for (; ; ) {
      let url = buildEntriesUrl(config.server_url, page, filter, pageSize), response;
      try {
        response = await deps.relay("GET", url, authHeaders);
      } catch (error) {
        if (pageSize > MIN_ENTRIES_PER_PAGE && describeError(error).includes("large bodies")) {
          pageSize = Math.max(MIN_ENTRIES_PER_PAGE, Math.floor(pageSize / 2)), page = 1, items.length = 0, seen.clear();
          continue;
        }
        return {
          items,
          reachedEnd: !1,
          interrupted: !0,
          stopReason: describeRelayFailure(error)
        };
      }
      if (!isOk(response.status))
        return {
          items,
          reachedEnd: !1,
          interrupted: !0,
          stopReason: `page ${page}: ` + describeHttpFailure(response.status, response.body)
        };
      let listing = parseEntriesPage(response.body);
      if (listing === void 0)
        return {
          items,
          reachedEnd: !1,
          interrupted: !0,
          stopReason: `page ${page}: the entries listing could not be read`
        };
      if (!listing.items.length)
        return { items, reachedEnd: !0, interrupted: !1 };
      onProgress?.({
        phase: "reading",
        page: listing.page,
        pages: Math.max(1, listing.pages)
      });
      for (let article of listing.items)
        seen.has(article.id) || (seen.add(article.id), items.push(article));
      if (page >= listing.pages)
        return { items, reachedEnd: !0, interrupted: !1 };
      page += 1;
    }
  }
  function parseJsonBody(body) {
    try {
      return JSON.parse(body);
    } catch {
      try {
        return JSON.parse(atob(body));
      } catch {
        return;
      }
    }
  }
  function isWallabagConfig(value) {
    if (!isRecord(value))
      return !1;
    let textFields = [
      "server_url",
      "client_id",
      "client_secret",
      "username",
      "password"
    ];
    for (let field of textFields)
      if (typeof value[field] != "string")
        return !1;
    let limit = value.sync_limit;
    return limit !== void 0 && typeof limit != "number" ? !1 : value.wallabag_dir === void 0 || typeof value.wallabag_dir == "string";
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
    let parsed = parseJsonBody(raw);
    if (!isWallabagConfig(parsed))
      throw new Error(
        "Could not read config.json. Save your credentials first."
      );
    return parsed;
  }
  function parseSidecarId(body) {
    let parsed = parseJsonBody(body);
    if (!isRecord(parsed))
      return;
    let raw = parsed.book_id, id = typeof raw == "string" ? Number(raw) : raw;
    return typeof id == "number" && Number.isInteger(id) ? id : void 0;
  }
  async function readSidecarIds(deps, dir, files) {
    let names = files.map((name) => basename(name)), present = new Set(names), sidecars = names.filter((name) => {
      let epub = sidecarEpub(name);
      return epub !== void 0 && present.has(epub);
    }), reads = await Promise.all(
      sidecars.map(async (name) => {
        try {
          let raw = await deps.readFile(`${dir}/${name}`), id = parseSidecarId(raw);
          return id === void 0 ? void 0 : [name, id];
        } catch {
          return;
        }
      })
    ), ids = {};
    for (let entry of reads)
      entry !== void 0 && (ids[entry[0]] = entry[1]);
    return ids;
  }
  async function loadSyncState(deps) {
    try {
      return readSyncState(parseJsonBody(await deps.readFile(SYNC_STATE_PATH)));
    } catch {
      return { articles: {} };
    }
  }
  function pruneEnabled(config) {
    return config.prune_on_sync !== !1;
  }
  function syncFavouritesEnabled(config) {
    return config.sync_favourites === !0;
  }
  function trackedFiles(state, files, sidecarIds) {
    let present = new Set(
      files.map((name) => basename(name).toLowerCase())
    ), tracked = /* @__PURE__ */ new Map(), entryFor = (id) => {
      let existing = tracked.get(id);
      if (existing !== void 0)
        return existing;
      let created = { epubs: [], sidecars: [] };
      return tracked.set(id, created), created;
    }, add = (list, name) => {
      present.has(name.toLowerCase()) && !list.includes(name) && list.push(name);
    };
    for (let [rawId, entry] of Object.entries(state.articles)) {
      let id = Number(rawId);
      if (!Number.isInteger(id))
        continue;
      let recorded = entryFor(id), name = basename(entry.filename);
      name.toLowerCase().endsWith(EPUB_SUFFIX) && (add(recorded.epubs, name), add(recorded.sidecars, `${name}${SIDECAR_SUFFIX}`));
    }
    for (let [rawName, id] of Object.entries(sidecarIds)) {
      let epub = sidecarEpub(basename(rawName));
      if (epub === void 0)
        continue;
      let recorded = entryFor(id);
      add(recorded.sidecars, basename(rawName)), add(recorded.epubs, epub);
    }
    return tracked;
  }
  async function reconcileArticle(deps, config, authHeaders, id) {
    let response;
    try {
      response = await deps.relay(
        "GET",
        `${normalizeServerUrl(config.server_url)}/api/entries/${id}`,
        authHeaders
      );
    } catch {
      return "keep";
    }
    if (response.status === 404)
      return "prune";
    if (!isOk(response.status))
      return "keep";
    let parsed = parseJsonBody(response.body);
    return !isRecord(parsed) || !("is_archived" in parsed) || !parsed.is_archived || syncFavouritesEnabled(config) && parsed.is_starred ? "keep" : "prune";
  }
  async function pruneArticles(deps, config, authHeaders, dir, state, files, sidecarIds, nextState, onProgress) {
    let tracked = trackedFiles(state, files, sidecarIds), present = new Map(
      files.map((name) => [basename(name).toLowerCase(), basename(name)])
    ), pruned = 0, index = 0;
    for (let [id, recorded] of tracked) {
      if (index += 1, onProgress?.({ phase: "pruning", index, total: tracked.size }), await reconcileArticle(deps, config, authHeaders, id) !== "prune")
        continue;
      let removedAll = !0;
      for (let name of [...recorded.epubs, ...recorded.sidecars]) {
        let actual = present.get(name.toLowerCase());
        if (actual === void 0)
          continue;
        let status;
        try {
          ({ status } = await deps.deleteFile(`${dir}/${actual}`));
        } catch {
          status = 0;
        }
        if (!isOk(status)) {
          removedAll = !1;
          continue;
        }
        present.delete(name.toLowerCase());
      }
      removedAll && (delete nextState.articles[String(id)], pruned += 1);
    }
    return { pruned, files: [...present.values()] };
  }
  function classifyOutcome(outcome) {
    return outcome.status === 404 || outcome.status === 410 ? "skipped" : !isOk(outcome.status) || !outcome.complete ? "failed" : "pulled";
  }
  async function runSync(deps, config, onProgress) {
    let authHeaders = { Authorization: `Bearer ${await obtainToken(deps, config)}` }, dir = normalizeWallabagDir(config.wallabag_dir), files;
    try {
      files = await deps.listFiles(dir);
    } catch (error) {
      throw new Error(
        `Could not list ${dir}: ${describeError(error)}. Check that the article folder exists on the SD card.`,
        { cause: error }
      );
    }
    let state = await loadSyncState(deps), sidecarIds = await readSidecarIds(deps, dir, files), nextState = { articles: { ...state.articles } }, limit = syncLimitOf(config), pulled = 0, failed = 0, skipped = 0, pruned, listingReachedEnd, limitHit = !1, interrupted, stopReason, record = (article, filename, status) => {
      nextState.articles[String(article.id)] = { filename, status };
    };
    try {
      if (pruneEnabled(config)) {
        let outcome = await pruneArticles(
          deps,
          config,
          authHeaders,
          dir,
          state,
          files,
          sidecarIds,
          nextState,
          onProgress
        );
        pruned = outcome.pruned, files = outcome.files;
      }
      let pulledIds = computePulledIds(nextState, files, sidecarIds), names = new Set(files.map((name) => basename(name))), candidates = [], candidateIds = /* @__PURE__ */ new Set(), addWalk = (walk) => {
        for (let article of walk.items)
          !pulledIds.has(article.id) && !candidateIds.has(article.id) && (candidateIds.add(article.id), candidates.push(article));
      }, unread = await walkEntries(
        deps,
        config,
        authHeaders,
        { archive: "0" },
        onProgress
      );
      if (addWalk(unread), listingReachedEnd = unread.reachedEnd, interrupted = unread.interrupted, stopReason = unread.stopReason, syncFavouritesEnabled(config) && !interrupted) {
        let starred = await walkEntries(
          deps,
          config,
          authHeaders,
          { starred: "1" },
          onProgress
        );
        addWalk(starred), listingReachedEnd = listingReachedEnd && starred.reachedEnd, interrupted = starred.interrupted, stopReason = starred.stopReason;
      }
      for (let [i, article] of candidates.entries()) {
        if (pulled >= limit) {
          limitHit = !0;
          break;
        }
        onProgress?.({
          phase: "downloading",
          index: i + 1,
          total: candidates.length,
          title: article.title
        });
        let datePrefix = config.date_prefixed_filenames ? formatDatePrefix(article.created_at) : void 0, filename = chooseFilename(
          article.title,
          article.id,
          names,
          datePrefix
        );
        names.add(filename);
        let dest = `${dir}/${filename}`, exportUrl = `${normalizeServerUrl(config.server_url)}/api/entries/${article.id}/export.epub`;
        try {
          let outcome = await deps.fetchToSd(exportUrl, dest, authHeaders), verdict = classifyOutcome(outcome);
          verdict === "skipped" ? skipped += 1 : verdict === "failed" ? failed += 1 : pulled += 1, record(article, filename, verdict);
        } catch {
          failed += 1, record(article, filename, "failed");
        }
        pulledIds.add(article.id);
      }
    } finally {
      await deps.writeFile(
        SYNC_STATE_PATH,
        encodeBase64Utf8(JSON.stringify(nextState))
      );
    }
    return {
      pulled,
      failed,
      skipped,
      reachedEnd: listingReachedEnd && !interrupted && !limitHit,
      limitHit,
      interrupted,
      stopReason,
      pruned
    };
  }
  function main() {
    let crossPoint = globalThis.CrossPoint;
    crossPoint !== void 0 && crossPoint.registerPlugin((container, api) => {
      renderForm(container, api);
    });
  }
  main();
})();
