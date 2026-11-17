# Ticket 7 — Pull all unread (bulk Sync)

**Depends on**: Tickets 1–6 (scaffold, schemas, payload, wizard, integration, release)

**Seam**: the exported pure helpers of the Sync logic in `src/plugin.ts`
plus `api` mocks, tested through `api.fetchToSd` call sequences; the
`device.json` sidecar validated by `DeviceSchema`.

## Goal

Let the user pull a bounded batch of unread wallabag articles onto the device
as EPUBs with one **Sync** action, instead of downloading them one at a time
from the on-reader catalog.

## Non-goals

- Marking articles as read/archived in wallabag (separate decision, deferred).
- Re-fetching articles whose wallabag *content* changed (presence-aware dedupe
  handles deletion, not content refresh).
- Automatic scheduling — Sync is on-demand, matching the no-clock constraint.
- A hosted index/bundle service or merged-EPUB companion (rejected; see
  ADR 0002).

## Mechanism

The firmware's `device.json` download loop fetches exactly one item per
selection and wallabag has no bulk endpoint, so the loop runs in `plugin.js`
as a browser action. It uses the same page as the setup wizard.

## Behavior spec

### Config

- Add a `sync_limit` field to the setup wizard (a new number input), default
  **50**, bounds **1–500**. Persist in `config.json`.
- Extend `WallabagConfigSchema` with an optional `sync_limit`.

### Sync algorithm

1. **List `/Wallabag` once** via `GET /api/files?path=/Wallabag`.
   - If the listing call fails, **abort** with a clear error. Never treat a
     failed listing as "everything deleted" — that would mass re-download.
2. **Read existing sidecars** (`*.meta.json` in the listing) to learn ids of
   articles pulled through the on-reader catalog (their ids are absent from
   `sync-state`).
3. **Load `sync-state`** (see below).
4. Build the "already pulled" set as `id → saved filename` from both sources.
   An id counts as pulled **only if its saved filename is still present** in
   the listing (presence-aware dedupe — a deleted EPUB re-downloads).
5. **Page** through `GET /api/entries?archive=0&detail=metadata&sort=created
   &order=desc&page={n}&perPage=16` with the bearer token, newest first.
   `detail=metadata` keeps each page under the ~32 KB `relay` cap.
6. For each unread article not already pulled, **download** via
   `api.fetchToSd` from `/api/entries/{id}/export.epub` into `/Wallabag/`, with
   the bearer header.
7. Stop when `sync_limit` **new** articles have downloaded, or the list is
   exhausted.

Skip-and-fill: paging walks progressively older articles, skipping ones already
pulled, until N new articles land. Over successive syncs this reaches the whole
unread set, `sync_limit` at a time.

### Filenames

- Sanitize the title (strip/replace filesystem-illegal chars such as `/`, `:`,
  and control chars; trim trailing dots/spaces).
- On collision (name already in the listing or earlier in the same batch),
  append `-{id}` before `.epub`, e.g. `Weekly digest.epub`,
  `Weekly digest-4242.epub`.

### `sync-state`

- A `sync-state.json` in the plugin directory, written via `api.writeFile`.
  Runtime file, **not** in `manifest.json → files`.
- Records per pulled article: `id` and its saved `filename` (and status).
- Keep it compact (ids + filenames); note the `writeFile` size cap as a future
  pruning concern, not handled here.

### Failure handling

- Continue on per-article errors.
- **`404`/`410`** → record as *skipped* ("deleted server-side"); never retry.
- **Anything else** (network, timeout, 5xx) → record as *retry*; attempt next
  sync.
- A whole-connection drop keeps every already-pulled id recorded, so progress
  is never lost and the next Sync resumes.

### Result summary

End each Sync with a line like:

```
42 pulled · 1 failed (retries next sync) · 1 skipped (deleted server-side)
```

If the batch stopped because it hit `sync_limit` before exhausting the list,
append a warning: **`— more unread articles remain.`**

### device.json sidecar (cross-interface identity)

Add to the catalog `download` section so one-at-a-time catalog pulls write
their article id next to the EPUB:

```json
"sidecar": { "path": "{dest}.meta.json", "body": "{\"book_id\":{id}}" }
```

Model `download.sidecar` in `DeviceSchema`.

## Firmware constraints (verified)

- `GET /api/files?path=...` returns `[{name,size,isDirectory,isEpub}]`;
  hidden dotfiles are omitted.
- `detail=metadata` in wallabag entry listing keeps pages within the relay cap.
- `api.fetchToSd` does **not** follow redirects — confirm `/export.epub`
  returns the EPUB directly (hardware-test item).
- The browser page must stay open while Sync runs (documented firmware limit).

## Done when

- Wizard has a `sync_limit` input (default 50, bounds enforced).
- Sync paginates, dedupes presence-aware, downloads, classifies failures, and
  reports the summary + remaining warning.
- `device.json` and `DeviceSchema` carry the sidecar.
- Full `pnpm run check` green, `plugin.js` rebuilt and drift-gated.