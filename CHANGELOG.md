# Changelog

## 0.1.0

- Initial release: setup wizard, on-reader catalog, and EPUB download.
- Feature: configurable **Article folder** (`wallabag_dir`, default
  `/Wallabag`). The wizard accepts an absolute device path, normalizing
  duplicate/trailing slashes and rejecting relative paths, `.`/`..`
  segments, control characters, and the SD root before falling back to
  `/Wallabag`. Sync lists, reads sidecars from, downloads into, and prunes
  inside that folder; `device.json` uses the same `{cfg.wallabag_dir}` for
  catalog downloads. Changing the folder re-downloads articles into the new
  location and leaves the old folder for you to remove.
- Feature: optional **Sync favourite articles** (`sync_favourites`, off by
  default). When on, Sync also walks wallabag's starred list and pulls those
  articles, including starred-but-archived ones, after the unread batch. The
  two lists are unioned by article id so a starred unread article downloads
  once, and `sync_limit` still caps the combined batch unread-first. Prune
  agrees with the toggle: it keeps an archived favourite while the flag is on
  and prunes it when the flag is off or the article is un-starred.
- Feature: **Prune** (`prune_on_sync`, on by default). Before pulling, Sync
  now checks each article it previously downloaded and deletes the EPUB and
  sidecar of any that wallabag reports archived or gone, so `/Wallabag`
  mirrors the unread list in both directions. Checks are per-id and fail
  safe: only a `404` or a truthy `is_archived` deletes, while a network
  error, another status, or an unreadable body keeps the file. Files crossbag
  did not record are never touched, the ledger entry is removed only after a
  successful delete, and the summary gains an `N pruned` count.
- Feature: the wizard's **Test Connection**, **Save** and **Sync** buttons are
  now coloured (neutral, blue, green) instead of looking like bare browser
  buttons. The styling ships in the plugin's own `<style>` block, namespaced
  under `.cbag-*`, because the plugin API exposes no firmware component CSS.
  Includes hover/active/focus states, a dimmed disabled Sync while it runs, and
  a `prefers-color-scheme: dark` variant.
- Feature: opt-in **Date-prefixed filenames** (`date_prefixed_filenames`).
  With it on, Sync names each newly-downloaded EPUB `YYMMDD-title.epub`
  using the article's wallabag added date (`created_at`), so a sorted
  `/Wallabag` is chronological (oldest first). Off by default. Existing
  files are not renamed, and catalog downloads stay `{title}.epub`.
- Fix: reopening the setup wizard now prefills the saved server URL, client
  ID, client secret, username, password, and sync limit from `config.json`.
  A missing or malformed config still shows the first-time defaults.
- Fix: Sync asked wallabag for 16 metadata entries per page, but a page can
  exceed the device relay's ~32 KB cap (wallabag includes each article's URLs,
  tags, annotations and original HTTP headers even with `detail=metadata`).
  The relay then answered 502 and Sync reported `0 pulled · 0 failed ·
  0 skipped` with no cause. Pages are now 8 entries, matching the on-reader
  catalog, and a rejected page retries at half the size. If paging still
  stops, the summary names the reason instead of only saying the list was
  not exhausted.
- Fix: form-encode the on-reader token request so `&` and `+` in a wallabag
  password or client secret no longer break sign-in.
- Fix: surface wallabag's OAuth2 error (`invalid_client`, `invalid_grant`) in
  the setup wizard and Sync instead of a bare HTTP status.
- Fix: call `api.relay` positionally (`method, url, headers, body`) so the
  wizard's token request actually sends its body. Previously the body was
  nested inside the headers argument and wallabag answered `invalid_request:
  Invalid grant_type parameter or parameter missing`.
- Fix: trim pasted whitespace from the server URL and refuse to test or save
  an address that is not a full `http(s)://host` URL. A URL pasted with a
  trailing newline made the device's relay fail with an opaque 502.
- Fix: when the device's relay cannot reach the server, say so in words
  ("the device could not reach the server — check the server URL and that the
  reader is online") instead of passing on the device's "large bodies need
  /api/fetch" message.
- Fix: write `config.json` and `sync-state.json` under the plugin's own folder
  (`api.dir`) instead of a bare relative name. The device's `/api/plugin-fs`
  accepts only absolute paths and rejected Save with `400 bad path`.
- Fix: ask wallabag for `detail=metadata` in the Test Connection request so a
  full article body no longer overflows the ~32 KB relay cap and fails with a
  misleading 502. The size-cap message is now reported as a too-large reply
  rather than blamed on the server URL.
