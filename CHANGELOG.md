# Changelog

## 0.1.0

- Initial release: setup wizard, on-reader catalog, and EPUB download.
- Fix: form-encode the on-reader token request so `&` and `+` in a wallabag
  password or client secret no longer break sign-in.
- Fix: surface wallabag's OAuth2 error (`invalid_client`, `invalid_grant`) in
  the setup wizard and Sync instead of a bare HTTP status.
