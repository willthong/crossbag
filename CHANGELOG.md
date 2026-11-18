# Changelog

## 0.1.0

- Initial release: setup wizard, on-reader catalog, and EPUB download.
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
