# Changelog

## 0.1.0

- Initial release: setup wizard, on-reader catalog, and EPUB download.
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
- Fix: ask wallabag for `detail=metadata` in the Test Connection request so a
  full article body no longer overflows the ~32 KB relay cap and fails with a
  misleading 502. The size-cap message is now reported as a too-large reply
  rather than blamed on the server URL.
