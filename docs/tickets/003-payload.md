# Ticket 3 — Plugin payload: manifest.json and device.json

**Depends on**: Ticket 2 (schemas exist for validation tests)

**Seam**: `crossbag.crosspoint-plugin/manifest.json` and `device.json` pass
schema validation in tests, and the payload directory is structurally valid
per Plugin Hub contract.

## What

Create the installable plugin payload directory with working `manifest.json`
and `device.json`. This is the declarative heart of the plugin — the on-reader
catalog that browses and downloads wallabag articles.

### `crossbag.crosspoint-plugin/manifest.json`

```json
{
  "name": "crossbag",
  "title": "Crossbag",
  "description": "Pull wallabag articles onto your device as EPUBs",
  "author": "...",          ← use placeholder, will fill later
  "version": "0.1.0",
  "compatibility": {
    "firmware_family": ["crosspoint"],
    "plugin_api_min": 1
  },
  "files": [
    "manifest.json",
    "device.json",
    "plugin.js",
    "README.md",
    "DETAILS.md"
  ]
}
```

### `crossbag.crosspoint-plugin/device.json`

Use the generic firmware catalog system. Key sections:

- **config.file**: `"config.json"` — written by the setup wizard
- **auth**: OAuth2 password grant to `{cfg.server_url}/oauth/v2/token`,
  extract `access_token` via `token.path`
- **browse**: `GET {cfg.server_url}/api/entries` with
  `archive=0&sort=created&order=desc`, page_size 8, items path
  `_embedded.items`, fields mapping title/author(id from domain_name)/id/url
- **download**: `GET {cfg.server_url}/api/entries/{id}/export.epub`,
  dest_dir `/Wallabag`, filename `{title}.epub`
- Browse and download requests use header `Authorization: Bearer {token}`

### `crossbag.crosspoint-plugin/README.md`

Plain-text readme for the on-device plugin. Explain what crossbag does,
how to run the setup wizard once, and that the catalog works offline after.
Keep it short — the device screen is small.

### `crossbag.crosspoint-plugin/DETAILS.md`

Richer Markdown details for Plugin Hub's catalog item-details view. Describe
the wallabag integration, setup flow, and requirements (wallabag server URL,
API client credentials).

### Tests

- `tests/payload.test.ts` — read the actual `manifest.json` and `device.json`
  from disk, validate against the schemas from Ticket 2
- Validate the payload directory structure matches Plugin Hub contract
  (files exist, no extra undeclared files, paths safe)

## Done when

- Manifest and device.json pass schema validation
- Payload directory contains exactly the declared files
- `pnpm test` passes for payload tests