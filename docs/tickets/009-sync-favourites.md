# Ticket 9 — Sync favourite articles in addition to unread

**Depends on**: Ticket 7 (bulk Sync), Ticket 8 (Prune)

**Seam**: `runSync` and its pure helpers through mocked `SyncDeps`; the setup
wizard `renderForm`/`buildConfig`; `WallabagConfigSchema`.

## Goal

An optional `sync_favourites` toggle that makes Sync also pull wallabag
**starred** articles — including starred-but-archived ones — in addition to
the unread set, and makes Prune keep archived favourites while the toggle is
on.

## Non-goals

- Browsing favourites from the on-reader catalog (separate follow-up).
- Starring/un-starring articles in wallabag from the device.

## What a "favourite" is

Wallabag's `is_starred` flag, independent of archive state. A favourite may be
unread or archived. Unread favourites are already pulled by the unread walk;
the toggle's only *additional* effect is to pull archived favourites.

## Behavior spec

### Config

- `sync_favourites` boolean, **default false**, exposed as a checkbox in the
  setup wizard.
- Optional in `WallabagConfigSchema` with a `false` default, so configs written
  before the field existed keep unread-only behaviour.

### Source walks

- The unread walk is unchanged (`archive=0`).
- When `sync_favourites` is on, add a second walk:
  `starred=1&sort=created&order=desc&detail=metadata&page={n}&perPage=8`,
  with the bearer token.
- **Union by article id** and dedupe through the existing presence-aware
  ledger — a starred unread article must download once, not twice.

### Budget

`sync_limit` counts **new** articles across both walks combined. Unread fills
first; favourites fill the remainder. Turning the toggle on never bypasses the
per-sync cap.

### Prune reconciliation

The Prune decision table from Ticket 8 is extended. For a tracked article:

| Response | Decision |
|----------|----------|
| `404` | prune (deleted upstream) — always |
| `200`, `is_archived` truthy, `is_starred` truthy, `sync_favourites` on | **keep** |
| `200`, `is_archived` truthy, otherwise | prune |
| `200`, `is_archived` falsy | keep (unread) |
| any non-2xx / error / malformed body | keep (fail-safe unchanged) |

In words: prune an archived article **only if it is not a favourite while the
toggle is on**. The toggle and Prune must agree, otherwise the toggle would
pull an archived favourite and Prune would delete it on the same sync.

### Round-trips

- Un-starring an archived favourite → it is archived and unstarred → pruned
  next sync.
- Re-starring → presence-aware dedupe sees the file gone → re-pulled.
- Enabling the toggle later self-heals: an archived favourite pruned while the
  toggle was off re-pulls once the toggle is on.

No tombstones anywhere; the mirror is recomputed fresh each sync as
`unread ∪ starred (if enabled)`.

## Firmware/wallabag facts (verified)

- wallabag has no "unread OR starred" query, hence two walks.
- `/api/entries` accepts `starred=1` and returns `is_starred`/`is_archived`
  per entry, which the per-id prune check already fetches.

## Done when

- The wizard has a `sync_favourites` checkbox, default unchecked.
- Sync pulls starred articles (including archived) when on, honours the
  combined budget unread-first, and never double-downloads.
- Prune keeps archived favourites when on, prunes them when off or un-starred,
  and the ambiguity fail-safe is unchanged.
- Tests cover each row of the extended decision table, the combined budget,
  and id-dedupe across the two walks.
- Full `pnpm run check` green; `plugin.js` rebuilt and drift-gated.