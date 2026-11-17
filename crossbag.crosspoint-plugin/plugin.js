"use strict";
(() => {
  // src/plugin.ts
  var PLUGIN_NAME = "crossbag";
  var FIELDS = [
    { name: "serverUrl", label: "Server URL", type: "text", value: "https://" },
    { name: "clientId", label: "Client ID", type: "text", value: "" },
    { name: "clientSecret", label: "Client Secret", type: "password", value: "" },
    { name: "username", label: "Username", type: "text", value: "" },
    { name: "password", label: "Password", type: "password", value: "" }
  ];
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
      password: values.password
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
      password: inputs.password.value
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
  function setAlert(alert, message) {
    alert.textContent = message;
  }
  async function testConnection(inputs, api, alert) {
    const values = readValues(inputs);
    const tokenRequest = buildTokenRequest(values);
    try {
      const tokenResponse = await api.relay(tokenRequest.method, tokenRequest.url, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: tokenRequest.body
      });
      if (!isOk(tokenResponse.status)) {
        setAlert(alert, `Connection failed (HTTP ${tokenResponse.status}).`);
        return;
      }
      const token = parseAccessToken(tokenResponse.body);
      if (token === void 0) {
        setAlert(alert, "Connection failed: no access token in the response.");
        return;
      }
      const request = buildTestRequest(values.serverUrl, token);
      const response = await api.relay(request.method, request.url, {
        headers: request.headers
      });
      if (!isOk(response.status)) {
        setAlert(alert, `Connection failed (HTTP ${response.status}).`);
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
  }
  function renderForm(container, api) {
    const form = document.createElement("form");
    const inputs = {};
    for (const field of FIELDS) {
      const label = document.createElement("label");
      label.textContent = field.label;
      const input = document.createElement("input");
      input.type = field.type;
      input.name = field.name;
      input.value = field.value;
      label.append(input);
      form.append(label);
      inputs[field.name] = input;
    }
    const alert = document.createElement("p");
    alert.setAttribute("role", "alert");
    addButton(form, "Test Connection", () => {
      void testConnection(inputs, api, alert);
    });
    addButton(form, "Save", () => {
      void saveConfig(inputs, api, alert);
    });
    form.append(alert);
    container.append(form);
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
