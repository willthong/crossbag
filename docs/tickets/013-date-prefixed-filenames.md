# Ticket 13 — Optionally prefix Sync-downloaded EPUB filenames with the added date

**Issue**: [#12](https://github.com/willthong/crossbag/issues/12)

**Depends on**: Ticket 7 (bulk Sync). Interacts with Ticket 10 (configurable
Wallabag directory).

**Seam**: the exported `chooseFilename` and `runSync` helpers in `src/plugin.ts`,
the wizard `renderForm`/`buildConfig`/`configValues`, and
`WallabagConfigSchema` in `src/wallabag.ts`, driven through the existing test
layout: `tests/filenames.test.ts`, `tests/sync.test.ts`, `tests/plugin.test.ts`
and `tests/wallabag.test.ts`. `formatDatePrefix` stays internal to
`src/plugin.ts` and is exercised through `runSync`.

## Goal

Let the user opt in to date-ordered filenames in the article folder. With the
flag on, Sync names each newly-downloaded EPUB `YYMMDD-{title}.epub`, where
`YYMMDD` comes from the article's wallabag `created_at` (its added date), so a
plain lexical sort of `/Wallabag` equals chronological order, oldest first.

## Non-goals & limitations

- **No backfill**: files downloaded before the flag was on are never renamed or
  re-downloaded to gain the prefix.
- **No catalog prefixing**: the on-reader catalog writes `{title}.epub` via the
  firmware's raw template substitution, which has no date variable and cannot
  format one. Blocked on firmware support; out of scope.
- Newest-first ordering in the file listing (a filename prefix cannot express
  it; oldest-first is what a sort yields).

## Behaviour

### Format

- "Added date" is wallabag `created_at`, **not** `published_at`/`updated_at`.
- An internal `formatDatePrefix(createdAt: string): string` parses the ISO
  timestamp and returns `YYMMDD` (`2024-01-01T00:00:00+0000` → `240101`).
  Two-digit year, most-significant-first, so lexicographic order is
  chronological. Exercised through `runSync`.
- A timestamp that cannot be parsed yields **no prefix** (the filename falls
  back to today's unprefixed form) rather than throwing and failing the pull.

### Filename

- `chooseFilename(title, id, existing, datePrefix?)`:
  - with a prefix: `YYMMDD-{title}.epub`, then `YYMMDD-{title}-{id}.epub`, then
    `YYMMDD-{title}-{id}-{suffix}.epub` for further collisions.
  - without a prefix (omitted/undefined): exactly today's behaviour.
  - The `-{id}` disambiguation applies **after** the `YYMMDD-title` base.

### Config

- Add `date_prefixed_filenames` to `WallabagConfigSchema`: **optional**,
  default `false`, so configs written before the field existed keep today's
  behaviour.
- Expose a `date_prefixed_filenames` checkbox in the setup wizard, default
  unchecked, persisted to `config.json` via `buildConfig` and read back by
  `configValues` for prefill.

### Sync

- `SyncArticle`/`parseEntriesPage` must carry `created_at` alongside `id` and
  `title`.
- `runSync` passes a `YYMMDD` prefix to `chooseFilename` only when
  `date_prefixed_filenames` is true; otherwise it passes none.

## Acceptance criteria

- [ ] With the flag on, an article saved to wallabag on 2024-01-01 is written
      as `240101-{title}.epub`.
- [ ] Same-day, same-title collisions disambiguate as `240101-{title}-{id}.epub`.
- [ ] With the flag off (or an old config without it), filenames are exactly as
      today.
- [ ] `YYMMDD` comes from `created_at`, not `published_at`/`updated_at`.
- [ ] `formatDatePrefix` returns no prefix (never throws) for an unparseable
      timestamp.
- [ ] The wizard shows a `date_prefixed_filenames` checkbox, default unchecked,
      saved to `config.json` and prefilled when present.

## Out of scope

- Renaming/backfilling existing files.
- Prefixing on-reader-catalog downloads (requires firmware support).
- Newest-first ordering in the file listing.
