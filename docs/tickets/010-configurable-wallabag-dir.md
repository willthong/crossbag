# Ticket 10 — Configurable Wallabag directory

**Depends on**: Ticket 7 (bulk Sync). Interacts with Ticket 8 (Prune) and
Ticket 9 (favourites) — see "Interactions" below.

**Seam**: `WallabagConfigSchema` in `src/wallabag.ts`; the setup wizard
`FIELDS`/`buildConfig`/`renderForm` in `src/plugin.ts`; the exported pure
helpers plus `runSync` driven through mocked `SyncDeps`; and
`crossbag.crosspoint-plugin/device.json` validated by `DeviceSchema`.

## Goal

Let the user choose where pulled EPUBs land on the SD card instead of the
hardcoded `/Wallabag`, so the library can sit beside an existing folder
(e.g. `/Books`, `/Articles`) and match the device's own library layout.

## Non-goals

- Moving or migrating EPUBs already in `/Wallabag` when the folder changes
  (see "Changing the folder" below — there is no move API).
- Per-article destination overrides or subfolders by tag/author.
- Changing where runtime files live: `config.json` and `sync-state.json`
  stay in the plugin directory (`api.dir`), never in the article folder.
- Multiple simultaneous article folders.

## Mechanism

The folder is a config value read by both interfaces:

- **Sync** (`plugin.js`) currently hardcodes `const WALLABAG_DIR = '/Wallabag'`
  in three places: the `listFiles` call, the `readFile` path for sidecars,
  and the `fetchToSd` destination. All three become the configured folder.
- **The on-reader catalog** (`device.json`) sets `download.dest_dir` to the
  same folder via `{cfg.wallabag_dir}`, so a catalog download lands in the
  same place Sync reads from.

The two interfaces must agree or the mirror silently splits in two.

## Behavior spec

### Config

- Add `wallabag_dir` to `WallabagConfigSchema`, **optional**, default
  `/Wallabag`, so configs written before the field existed keep working.
- Add a text input to the setup wizard (`FIELDS`), label "Article folder",
  default `/Wallabag`. Persist in `config.json` via `buildConfig`.
- Normalize on save and on load through one exported helper, e.g.
  `normalizeWallabagDir(raw): string`:
  - trim whitespace;
  - default to `/Wallabag` when empty;
  - require an absolute device path (leading `/`);
  - collapse duplicate slashes and strip a trailing `/`;
  - reject `.` / `..` segments and NUL/control characters;
  - reject the SD root `/` itself (a plugin must not own the whole card).
- Invalid input falls back to the default rather than failing Save, matching
  how `parseSyncLimit` tolerates bad input.

### `device.json`

- `download.dest_dir` becomes `"{cfg.wallabag_dir}"`.
- `download.sidecar.path` already uses `{dest}.meta.json`, so it follows the
  folder automatically.
- `DeviceSchema.download.dest_dir` is currently `z.string()`, not
  `TemplateStringSchema`. If the firmware substitutes `{cfg.*}` in
  `dest_dir`, widen it to `TemplateStringSchema`; if not, this ticket is
  blocked on firmware support (see "Firmware facts to verify").

### Sync

- Replace the `WALLABAG_DIR` constant with the configured value resolved once
  at the top of `runSync`, after `obtainToken`:
  `const dir = normalizeWallabagDir(config.wallabag_dir);`
- Use `dir` for the listing, the sidecar reads, and the `fetchToSd`
  destination. Nothing else in the algorithm changes: dedupe stays
  presence-aware against that folder's listing, and `sync-state.json` keeps
  recording basenames only (no path), so a folder change needs no ledger
  migration.
- Error messages name the configured folder rather than the literal
  `/Wallabag`.
- The folder must exist before the first pull. If the firmware's
  `fetchToSd` does not create missing directories, create it or surface a
  clear "folder does not exist" error instead of a per-article failure storm.

### Interactions

- **Prune (Ticket 8)** deletes recorded paths; it must use the configured
  folder for both its `POST /delete` paths and its tracked-file scan. A
  misconfigured folder must never widen the set of files Prune may delete.
- **Favourites (Ticket 9)** is unaffected except that its walks write into the
  configured folder.
- **ADR 0004** (mirror = unread ∪ starred) still holds; only the location of
  the mirror changes. Update its wording if it names `/Wallabag` literally.

### Changing the folder

There is no move/rename API. Changing the folder after a sync leaves the old
folder's EPUBs in place and untracked:

- `sync-state.json` still records the old basenames, but the new folder's
  listing does not contain them, so presence-aware dedupe treats every article
  as not-pulled and re-downloads the batch into the new folder.
- The old folder is **not** cleaned up. Document this in the wizard/README:
  "Changing the folder re-downloads your articles; delete the old folder
  yourself."
- Because the ledger stores basenames only, the same article can exist in both
  folders without the ledger noticing. That is acceptable and out of scope to
  reconcile.

## Firmware facts to verify

- Whether `{cfg.*}` substitution works in `download.dest_dir` (and in
  `download.filename`). The catalog already substitutes in URLs, headers and
  bodies; `dest_dir` is untested.
- Whether `api.fetchToSd` creates a missing destination directory, or requires
  it to exist.
- Whether `GET /api/files?path=<dir>` works for any absolute directory, not
  only `/Wallabag`.
- Whether `POST /delete` accepts paths outside `/Wallabag` (Prune's safety
  depends on this being scoped to the configured folder).

## Done when

- `WallabagConfigSchema` accepts an optional `wallabag_dir`, default
  `/Wallabag`, and `normalizeWallabagDir` enforces the rules above.
- The wizard has an "Article folder" text input, default `/Wallabag`, and
  `buildConfig` persists it.
- `runSync` lists, reads sidecars from, and downloads into the configured
  folder; no `/Wallabag` literal remains in the Sync path.
- `device.json`'s `download.dest_dir` is templated to the same config value,
  with `DeviceSchema` widened only if the firmware supports it.
- Prune uses the configured folder and cannot delete outside it.
- Tests cover: default when absent; normalization (empty, trailing slash,
  relative, `..`, root); a sync into a non-default folder; sidecar reads and
  dedupe against that folder; prune scoped to it; config written by the
  wizard round-trips.
- Full `pnpm run check` green; `plugin.js` rebuilt and drift-gated.
