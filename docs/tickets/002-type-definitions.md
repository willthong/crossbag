# Ticket 2 — Type definitions and Zod validation schemas

**Depends on**: Ticket 1 (scaffold)

**Seam**: `pnpm run typecheck` + `pnpm test` pass with type definitions and
schema tests.

## What

Define the TypeScript types and Zod schemas for every external interface
crossbag touches. This creates the type-level contract before any plugin
code is written.

### Wallabag API types (`src/wallabag.ts`)

- `WallabagEntry` — the shape of a single article from `GET /api/entries`
  (id, title, url, domain_name, created_at, updated_at, tags, etc.)
- `WallabagEntriesResponse` — the paginated response wrapper
  (page, pages, total, `_embedded: { items: WallabagEntry[] }`)
- `WallabagTokenResponse` — OAuth2 password grant response
  (access_token, expires_in, refresh_token, token_type)
- `WallabagConfig` — the user-facing config shape
  (server_url, client_id, client_secret, username, password)

Use Zod for runtime validation, inferred types for compile-time safety:
`export type WallabagEntry = z.infer<typeof WallabagEntrySchema>`

### Manifest schema (`src/manifest.ts`)

- Zod schema for `manifest.json` fields required by Plugin Hub:
  name, title, description, author, version, files, compatibility (optional)
- Validate name is lowercase letters/digits/hyphens
- Validate version is MAJOR.MINOR.PATCH

### Device.json schema (`src/device.ts`)

- Zod schema for the `device.json` structure as consumed by CrossPoint firmware
- Cover: title, config, auth (request + token), browse (format, url, items,
  page_size, fields), download (url, dest_dir, filename)
- Validate template variables are well-formed (`{cfg.KEY}`, `{token}`, etc.)

### Tests

- `tests/wallabag.test.ts` — validate real-looking wallabag API responses
  against the schemas
- `tests/manifest.test.ts` — validate a valid manifest and reject invalid ones
  (bad name, bad version format, missing required fields)
- `tests/device.test.ts` — validate a valid device.json and reject invalid ones

## Done when

- All types and schemas compile without errors
- Schema tests pass: valid payloads accepted, invalid ones rejected with
  specific errors