# Crossbag

Plugin for CrossPoint e-reader firmware that fetches articles from a wallabag
server and downloads them as EPUBs onto the device.

## Language

**Article**:
A saved web page in wallabag. Each article has a title, URL, domain, tags,
and archived/starred status. The plugin downloads articles as EPUBs.
_Avoid_: Story, entry (wallabag's API name — use "article" in our domain).

**Plugin Hub**:
The CrossPoint SD-card plugin that discovers, installs, updates, and removes
other plugins. Crossbag is published through Plugin Hub's Community Plugins
catalog.
_Avoid_: App store, marketplace.

**Setup wizard**:
The browser-based `plugin.js` UI that runs once to configure wallabag
credentials (server URL, OAuth client, username, password). After setup,
day-to-day browsing happens on-device via `device.json`.
_Avoid_: Login screen, auth flow.

**On-reader catalog**:
The `device.json`-driven firmware screen that browses wallabag articles and
downloads them as EPUBs. Works entirely on the e-reader without a browser.
_Avoid_: Device UI, native UI.

**Wallabag**:
The open-source read-it-later server. Crossbag uses its REST API (OAuth2
password grant) to list articles and export them as EPUBs.
_Avoid_: Server, backend.