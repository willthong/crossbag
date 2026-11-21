# Ticket 11 — Sync phase progress

**Depends on**: Ticket 7 — Pull all unread (bulk Sync)

**Seam**: `runSync`'s `onProgress` callback in `src/plugin.ts`, tested from
`tests/sync.test.ts`; the setup wizard status element `[data-sync-status]`,
tested from `tests/plugin.test.ts`.

## Goal

Replace the bare `X/Y articles to sync` counter with phase-aware status, so
the page says what Sync is doing. When a fatal error happens, keep the last
phase line visible instead of replacing it with the error.

## Progress events

`runSync` takes a structured progress callback:

```ts
export type SyncProgress =
  | { phase: 'reading'; page: number; pages: number }
  | { phase: 'downloading'; index: number; total: number; title: string };

export async function runSync(
  deps: SyncDeps,
  config: WallabagConfig,
  onProgress?: (progress: SyncProgress) => void,
): Promise<SyncResult>;
```

- **reading** — emitted after each successfully parsed metadata page in
  phase 1. `page` and `pages` come from the listing response.
- **downloading** — emitted immediately before each `fetchToSd` attempt.
  `index` is the 1-based position in the candidate list, `total` is
  `candidates.length`, and `title` is the article title (which may be empty).
- Emit no progress for the local inventory or auth calls. Emit no
  `downloading` events when there are no candidates.
- `SyncResult` and the download/page-size/limit semantics are unchanged.

## Wizard status

- Remove `X/Y articles to sync` entirely.
- Initial status stays `Syncing…`.
- `reading` → `Reading unread list: page {page}/{pages}`
- `downloading` → `Downloading {index}/{total}: {title}`
- Empty title → `Downloading {index}/{total}` (no trailing colon or space)
- Success → the existing summary, unchanged.
- **Fatal error after progress** → keep the last phase line and append the
  reason: `{lastPhase} — {error}`. Never replace the phase line with a bare
  error message.
- **Fatal error before any progress** → show the error alone, as today.
- "Last phase" means the most recent reading or downloading line.

## Acceptance criteria

- [ ] `runSync` emits one reading event per metadata page with `page` and
      `pages`.
- [ ] `runSync` emits a downloading event before each attempt with a 1-based
      `index`, the candidate `total`, and the article title.
- [ ] Status shows `Reading unread list: page 1/2`, then
      `Downloading 1/2: Article 1`, and so on.
- [ ] An empty title renders `Downloading 1/2` with no trailing colon/space.
- [ ] An error after progress leaves `{lastPhase} — {error}` visible.
- [ ] An error before progress shows only the error.
- [ ] The summary, `sync_limit`, interruption, and skip/failure behaviour are
      unchanged.

## Non-goals

- Console logging, log panels, or persistent sync logs.
- Per-article failure details in the summary.
- Changing what Sync downloads, pages, or records in `sync-state`.
