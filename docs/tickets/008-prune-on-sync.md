# Ticket 8 — Prune local EPUBs when articles leave unread upstream

**Depends on**: Ticket 7 (bulk Sync)

**Seam**: the exported pure helpers and `runSync` in `src/plugin.ts` driven
through mocked `SyncDeps`, plus the setup wizard `renderForm`/`buildConfig`.

## Goal

When an article is archived or deleted in wallabag, remove its EPUB (and
sidecar) from `/Wallabag` during the next Sync, so the folder mirrors what is
unread upstream, in both directions.

## Non-goals

- Marking articles read/archived in wallabag (unchanged — still out of scope).
- Deleting files crossbag did not create.
- Scheduled or background pruning; it rides on the on-demand Sync only.

## Mechanism

Deletion is a same-origin `POST /delete` (form field `path`, or `paths` as a
JSON array) available to browser plugins. It clears the EPUB cache for deleted
files automatically. Prune runs inside the existing Sync action as a distinct
phase before the pull phase.

## Behavior spec

### Config

- `prune_on_sync` boolean, **default true**, exposed as a checkbox in the
  setup wizard.
- Optional in `WallabagConfigSchema` with a `true` default, so configs written
  before the field existed still prune.

### Tracked set

An article is *tracked* if crossbag has previously recorded it in one of two
ways:

1. an entry in `sync-state` (any status), or
2. a `.meta.json` sidecar on `/Wallabag` whose `book_id` resolves and whose
   EPUB is present.

Only tracked ids may ever be pruned. Anything else in `/Wallabag` (a
hand-placed EPUB, an unrelated file, any directory) is never touched.

### Per-id reconciliation

For each tracked id, `relay GET {cfg.server_url}/api/entries/{id}` with the
bearer token, then decide:

| Response | Decision |
|----------|----------|
| `404` | article deleted upstream → **prune** |
| `200` with truthy `is_archived` | archived → **prune** |
| `200` with falsy `is_archived` | still unread → **keep** |
| any other non-2xx, network error, malformed body | **keep** (delete nothing) |

The fail-safe is absolute: prune is only ever reached from an authoritative,
successful, parseable wallabag response. A broken or flaky wallabag can cost
you a sync, never your library.

### Deletion

- Per file: `POST /delete` with `path=<...>`, one call at a time, so every
  success is individually known. `2xx` = deleted.
- Delete the EPUB, then its `.meta.json` sidecar if present.
- Record the removal in `sync-state` **only after** the delete succeeds, so a
  failed delete retries next sync and can never leak a `-{id}` renamed
  duplicate.
- Only delete files inside `/Wallabag` whose paths crossbag itself recorded.

### Full mirror

Un-archiving a pruned article later re-pulls it: the file is absent, so the
existing presence-aware dedupe already treats it as not-pulled. No tombstone
exists, and none is needed.

### Summary

Append the prune result to the Sync summary: `N pruned`. Skip the phase
entirely when `prune_on_sync` is false.

## Firmware facts (verified)

- `POST /delete` rejects non-empty folders, so prune deletes files only.
- Hidden dotfiles *are* deletable, which is why the path must be one crossbag
  recorded rather than a glob.

## Done when

- The wizard has a `prune_on_sync` checkbox, default checked.
- `runSync` prunes archived and deleted tracked articles, keeps unread ones,
  and deletes nothing on any ambiguous/failed check.
- The sidecar is deleted alongside the EPUB, and `sync-state` updates only
  after a successful delete.
- Tests cover: archived → pruned; `404` → pruned; unread → kept; network
  error/malformed body → kept; unrecognized `/Wallabag` files untouched;
  `prune_on_sync: false` skips the phase.
- Full `pnpm run check` green; `plugin.js` rebuilt and drift-gated.