# Ticket 12 — Prefill the setup wizard from config.json

**Depends on**: Ticket 4 — Setup wizard; Ticket 7 — Pull all unread

**Seam**: `renderForm` in `src/plugin.ts`, reusing the same `config.json`
reader as Sync (`buildSyncDeps(...).readFile` → `loadSavedConfig` →
`parseJsonBody`). Tested from `tests/plugin.test.ts`.

## Goal

Opening the wizard after configuration should look configured. Load the saved
`config.json` and prefill the form instead of showing first-install defaults.

## Behaviour

- Map saved keys directly onto the form:
  - `server_url` → `serverUrl`
  - `client_id` → `clientId`
  - `client_secret` → `clientSecret`
  - `username` → `username`
  - `password` → `password`
  - `sync_limit` → `syncLimit`
- Prefill the password too. It is already stored in plaintext in
  `config.json`; leaving it blank makes the form look unconfigured. The input
  remains `type="password"`, so it is obscured on screen.
- A missing, unreadable, or malformed config falls back silently to the
  existing defaults. It must not block the form or show an error.
- If `api.dir` is absent, skip the read and keep the defaults.
- The read is asynchronous. Buttons stay usable, and only inputs still at
  their defaults are filled, so an edit made while the read runs is not
  overwritten.
- Test Connection and Save keep working from both a prefilled and blank form.

## Acceptance criteria

- [ ] A saved config shows its server URL, client ID, client secret, username,
      password, and sync limit.
- [ ] No config keeps today's defaults without an error.
- [ ] A malformed or unreadable config falls back to defaults.
- [ ] An edit made before the read completes is preserved.
- [ ] Test Connection and Save behave as before.

## Non-goals

- Changing the config file format.
- Encrypting `config.json`, or leaving the password blank.
- Surface-level "saved" hints or notices.
