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

**Sync**:
The browser action that pulls a bounded batch of unread wallabag articles as
EPUBs and records each as pulled. Runs on demand from the `plugin.js` page.
_Avoid_: Bulk pull, refresh, download-all.

**Batch**:
The bounded number of articles one Sync fetches, capped by `sync_limit`
(default 50).
_Avoid_: Chunk, page.

**sync-state**:
The plugin's on-SD ledger recording each pulled article's id and the filename
it was saved under, so Sync can skip and re-pull deleted articles.
_Avoid_: Pull history, cache, index.

**Sidecar**:
The `.meta.json` file the firmware writes next to a downloaded EPUB holding
the article id, letting Sync and the on-reader catalog share one "pulled"
identity.
_Avoid_: Meta file, tag file.

**Skip-and-fill**:
Sync's walk: page through unread newest-first, skipping already-pulled
articles, until `sync_limit` new articles land or the list ends.
_Avoid_: Backfill, catch-up (both imply a schedule this feature lacks).

**Prune**:
Removing a downloaded EPUB (and its sidecar) from `/Wallabag` when its
article leaves the unread list upstream — archived or deleted.
_Avoid_: Clean, purge, reconcile, sync-delete.

**Mirror**:
The invariant that `/Wallabag` reflects wallabag's unread list in both
directions: Sync pulls what is newly unread, Prune removes what is no
longer unread.
_Avoid_: Sync (overloaded), synchronise.

**Tracked article**:
An article crossbag has previously recorded — in `sync-state` or a sidecar —
and therefore the only kind Prune is permitted to delete.
_Avoid_: Known file, managed file (implies more ownership than the
presence-aware ledger grants).