import { describe, expect, it } from 'vitest';
import {
  computePulledIds,
  readSyncState,
  type SyncState,
  type SyncStatus,
} from '../src/plugin';

/** Build a sync-state ledger from id -> filename pairs. */
function ledger(
  entries: Record<string, string>,
  statuses: Record<string, SyncStatus> = {},
): SyncState {
  return {
    articles: Object.fromEntries(
      Object.entries(entries).map(([id, filename]) => [
        id,
        { filename, status: statuses[id] ?? 'pulled' },
      ]),
    ),
  };
}

const EMPTY_STATE: SyncState = { articles: {} };

describe('readSyncState', () => {
  it('accepts an empty state file', () => {
    expect(readSyncState({})).toEqual(EMPTY_STATE);
  });

  it('reads a recorded article id and its saved filename', () => {
    const raw = { articles: { '42': { filename: 'Weekly digest.epub' } } };

    expect(readSyncState(raw)).toEqual(ledger({ '42': 'Weekly digest.epub' }));
  });

  it('tolerates extra fields such as status and a version marker', () => {
    const raw = {
      version: 2,
      articles: { '42': { filename: 'Weekly digest.epub', status: 'pulled' } },
    };

    expect(readSyncState(raw)).toEqual(ledger({ '42': 'Weekly digest.epub' }));
  });

  it('keeps skipped and failed statuses', () => {
    const raw = {
      articles: {
        '42': { filename: 'Weekly digest.epub', status: 'skipped' },
        '43': { filename: 'Retry me.epub', status: 'failed' },
      },
    };

    expect(readSyncState(raw)).toEqual(
      ledger(
        { '42': 'Weekly digest.epub', '43': 'Retry me.epub' },
        { '42': 'skipped', '43': 'failed' },
      ),
    );
  });

  it('defaults a legacy entry without a status to pulled', () => {
    const raw = { articles: { '42': { filename: 'Weekly digest.epub' } } };

    expect(readSyncState(raw)).toEqual(ledger({ '42': 'Weekly digest.epub' }));
  });

  it('returns the empty state for garbage instead of throwing', () => {
    const garbage: unknown[] = [
      null,
      undefined,
      'not json at all',
      42,
      [1, 2, 3],
      { articles: 'nope' },
      { articles: [] },
      { articles: { '42': null } },
      { articles: { '42': { filename: 7 } } },
      { articles: { '42': 'Weekly digest.epub' } },
      { articles: { '42': { filename: 'x.epub', status: 'unknown' } } },
    ];

    for (const raw of garbage) {
      expect(() => readSyncState(raw), `threw for ${String(raw)}`).not.toThrow();
      expect(readSyncState(raw), `accepted ${String(raw)}`).toEqual(EMPTY_STATE);
    }
  });
});

describe('computePulledIds', () => {
  it('includes an id whose recorded filename is on the SD card', () => {
    const state = ledger({ '42': 'Weekly digest.epub' });

    const pulled = computePulledIds(state, ['Weekly digest.epub'], {});

    expect(pulled.has(42)).toBe(true);
  });

  it('excludes an id whose recorded EPUB was deleted', () => {
    const state = ledger({ '42': 'Weekly digest.epub' });

    const pulled = computePulledIds(state, ['Something else.epub'], {});

    expect(pulled.has(42)).toBe(false);
    expect(pulled.size).toBe(0);
  });

  it('matches a recorded filename against a listing path basename', () => {
    const state = ledger({ '42': 'Weekly digest.epub' });

    const pulled = computePulledIds(
      state,
      ['/Wallabag/Weekly digest.epub'],
      {},
    );

    expect(pulled.has(42)).toBe(true);
  });

  it('treats skipped as done even though no EPUB was saved', () => {
    const state = ledger(
      { '42': 'Weekly digest.epub' },
      { '42': 'skipped' },
    );

    const pulled = computePulledIds(state, [], {});

    expect(pulled.has(42)).toBe(true);
  });

  it('retries failed entries even when their filename is present', () => {
    const state = ledger(
      { '42': 'Weekly digest.epub' },
      { '42': 'failed' },
    );

    const pulled = computePulledIds(state, ['Weekly digest.epub'], {});

    expect(pulled.has(42)).toBe(false);
    expect(pulled.size).toBe(0);
  });

  it('includes catalog-pulled ids found in a .meta.json sidecar', () => {
    const state = EMPTY_STATE;
    const files = ['On the beach.epub', 'On the beach.epub.meta.json'];
    const sidecars = { 'On the beach.epub.meta.json': 99 };

    const pulled = computePulledIds(state, files, sidecars);

    expect(pulled.has(99)).toBe(true);
  });

  it('compares sidecars by basename when the listing returns paths', () => {
    const state = EMPTY_STATE;
    const files = [
      '/Wallabag/On the beach.epub',
      '/Wallabag/On the beach.epub.meta.json',
    ];
    const sidecars = { '/Wallabag/On the beach.epub.meta.json': 99 };

    const pulled = computePulledIds(state, files, sidecars);

    expect(pulled.has(99)).toBe(true);
  });

  it('excludes a sidecar id whose EPUB is missing', () => {
    const state = EMPTY_STATE;
    const files = ['On the beach.epub.meta.json'];
    const sidecars = { 'On the beach.epub.meta.json': 99 };

    const pulled = computePulledIds(state, files, sidecars);

    expect(pulled.has(99)).toBe(false);
    expect(pulled.size).toBe(0);
  });

  it('ignores listing entries that are not .epub files', () => {
    const state = ledger({ '1': 'Weekly digest.epub', '2': 'notes.txt' });
    const files = ['Weekly digest.epub', 'notes.txt', 'Wallabag'];
    const sidecars = { 'notes.txt': 3, Wallabag: 4 };

    const pulled = computePulledIds(state, files, sidecars);

    expect([...pulled]).toEqual([1]);
  });

  it('matches pulled filenames case-insensitively, as FAT does', () => {
    const state = ledger({ '42': 'Weekly digest.epub' });
    const files = ['WEEKLY DIGEST.EPUB'];

    const pulled = computePulledIds(state, files, {});

    expect(pulled.has(42)).toBe(true);
  });

  it('matches catalog sidecars case-insensitively too', () => {
    const state = EMPTY_STATE;
    const files = ['on the beach.epub', 'On The Beach.EPUB.meta.json'];
    const sidecars = { 'On The Beach.EPUB.meta.json': 99 };

    const pulled = computePulledIds(state, files, sidecars);

    expect(pulled.has(99)).toBe(true);
  });

  it('returns a de-duplicated set when state and sidecar disagree', () => {
    const state = ledger({ '42': 'Weekly digest.epub' });
    const files = ['Weekly digest.epub', 'Weekly digest-42.epub'];
    const sidecars = { 'Weekly digest-42.epub': 42 };

    const pulled = computePulledIds(state, files, sidecars);

    expect(pulled).toEqual(new Set([42]));
  });
});
