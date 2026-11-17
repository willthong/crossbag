# Ticket 5 — Integration validation and final wiring

**Depends on**: Ticket 4 (all source code exists)

**Seam**: `pnpm run check && pnpm run build` passes end-to-end.
The full test suite covers every interface.

## What

Tie everything together and validate the complete plugin is publishable.

### Build integration

- Ensure `pnpm run build` produces `plugin.js` in the payload directory
- Add a CI check that verifies the built `plugin.js` is up to date with
  source (build + `git diff --exit-code`)
- Add `pnpm run check` as a prebuild step so you can't build dirty code

### Additional tests

- `tests/integration.test.ts` — end-to-end validation:
  - Read the full payload directory
  - Validate manifest.json + device.json against schemas
  - Verify plugin.js exists and is non-empty
  - Verify all `manifest.json → files` entries exist on disk
  - Verify no undeclared files exist in the payload directory
  - Check directory stem matches `manifest.json → name`

### Wallabag API mock tests

- `tests/wallabag-api.test.ts` — validate that the device.json browse and
  download URL templates would produce correct wallabag API calls:
  - Browse URL resolves with `{cfg.server_url}`, `{page}`, `{limit}`
  - Download URL resolves with `{cfg.server_url}`, `{id}`
  - Auth request body contains all required OAuth2 fields

### README.md (repository root)

- What crossbag is
- How to install (via Plugin Hub)
- How to set up (run the wizard once)
- How to use (browse and download from the device)
- How to develop (clone, pnpm install, pnpm test, pnpm build)
- Link to SPEC.md for full design

### .gitignore

- `node_modules/`
- `dist/`
- `*.log`

## Done when

- `pnpm run check` (typecheck + lint + test) passes clean
- `pnpm run build` produces up-to-date plugin.js
- CI workflow passes all three jobs
- Payload directory is structurally valid per Plugin Hub contract