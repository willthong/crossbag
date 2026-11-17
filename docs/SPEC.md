# Crossbag — Specification

CrossPoint plugin to pull wallabag articles onto a Xteink device as EPUBs.

## Architecture

Two interfaces with a strict split:

```
plugin.js   →  one-time setup wizard (browser on phone/computer)
               - Form: server URL, client ID, client secret, username, password
               - "Test Connection" button → api.relay()
               - "Save" button → api.writeFile() writes config.json

device.json →  daily on-reader catalog
               - Reads config.json via {cfg.*} templates
               - Auth: OAuth2 password grant → Bearer token
               - Browse: GET /api/entries (unread, newest first, 8 per page)
               - Download: GET /api/entries/{id}/export.epub → /Wallabag/
```

## Payload files

```
crossbag.crosspoint-plugin/
├── manifest.json    # Plugin Hub metadata
├── device.json      # On-reader catalog definition
├── plugin.js        # Setup wizard (compiled from src/plugin.ts)
├── README.md        # On-device readme (plain text)
└── DETAILS.md       # Richer catalog details (Markdown)
```

## Wallabag API integration

- **Auth**: `POST /oauth/v2/token` (password grant)
- **Browse**: `GET /api/entries?archive=0&sort=created&order=desc&page={page}&perPage={limit}`
- **Download**: `GET /api/entries/{id}/export.epub`
- **Response format**: JSON, items under `_embedded.items`

## Plugin Hub publishing

- Repository topic: `crosspoint-plugin`
- Payload directory: `crossbag.crosspoint-plugin/`
- Version: `MAJOR.MINOR.PATCH` in manifest, matching tag (with optional `v` prefix)
- Release: non-draft, non-prerelease GitHub Release
- Discovery: automatic via Plugin Hub's 4-hour catalog refresh

## Engineering

- **Language**: TypeScript (for plugin.ts wizard + tests)
- **Build**: esbuild bundles `src/plugin.ts` → `plugin.js`
- **Type checking**: `tsc --noEmit`
- **Linting**: ESLint (max 90 char lines)
- **Testing**: Vitest + Zod schema validation
- **CI/CD**: GitHub Actions — PR checks (lint, typecheck, test) + release workflow (tag → build → Release)
- **Node**: ≥ 22