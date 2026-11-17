# The on-reader token body is pre-encoded in config.json

The firmware substitutes `{cfg.KEY}` values into `device.json` templates
verbatim; it only percent-encodes characters that appear in a request *URL*,
never in a request body. Wallabag's password grant is a form-urlencoded body,
so a password or client secret containing `&` or `+` would be split or
misread if `device.json` assembled the body from individual `{cfg.*}` values.

The setup wizard therefore stores the finished token request body as
`auth_body` in `config.json`, and `device.json` sends `{cfg.auth_body}`
verbatim. The wizard is the only writer and regenerates `auth_body` on every
Save, so the encoded body cannot drift from the stored credentials.

Do not reintroduce per-field substitution into the auth body. If a future
firmware adds an encoding filter for `{cfg.*}` values, this ADR can be
revisited; until then `{cfg.*}` values are inserted unencoded.
