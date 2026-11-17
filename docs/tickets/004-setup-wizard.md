# Ticket 4 — Setup wizard: plugin.ts

**Depends on**: Ticket 3 (manifest.json + device.json define config shape)

**Seam**: `src/plugin.ts` compiles, bundles to `plugin.js`, and the bundled
script registers with `CrossPoint.registerPlugin` and renders a form.

## What

Write the browser-based setup wizard in TypeScript. This is a small script
(~100 lines) that provides the one-time credential configuration UI.

### `src/plugin.ts`

The module must:

1. Call `CrossPoint.registerPlugin(async (container, api) => { ... })`
2. Render a form into `container` with fields:
   - Server URL (text input, default `https://`)
   - Client ID (text input)
   - Client Secret (password input)
   - Username (text input)
   - Password (password input)
3. "Test Connection" button:
   - Calls `api.relay("GET", serverUrl + "/api/entries?perPage=1", {...})`
   - Shows success/failure inline
4. "Save" button:
   - Builds a `config.json` object from form fields
   - Encodes as UTF-8 base64 (via `TextEncoder` → binary string → `btoa`)
   - Calls `api.writeFile("config.json", base64data)`
   - Shows success message: "Credentials saved. Switch to your device to
     browse articles."

### Type declarations

Create `src/crosspoint.d.ts` with the `CrossPoint.registerPlugin` and `api`
types so the TypeScript compiles. The actual `CrossPoint` global is injected
by firmware at runtime.

### Constraints

- No external runtime dependencies — the bundled `plugin.js` runs in the
  device's browser WebUI
- No secrets in source — only form inputs, nothing hardcoded
- Use only `api.relay`, `api.writeFile`, and `api.name` (minimum API surface)
- Handle errors gracefully: show user-friendly messages for network failures,
  auth errors, and write failures

### Tests

- `tests/plugin.test.ts` — exercise the wizard logic:
  - Form rendering produces expected DOM structure
  - Config object is correctly constructed from form values
  - Base64 encoding is UTF-8 safe
  - Error states render error messages
  - Mock `api.relay` and `api.writeFile` via vitest mocks
  - Use `happy-dom` or `jsdom` for DOM environment if needed, but prefer
    testing the logic directly with minimal DOM stubs

### Build verification

- `pnpm run build` must produce `crossbag.crosspoint-plugin/plugin.js`
  as a valid IIFE bundle
- The bundled output must not contain any import/export statements

## Done when

- `pnpm run typecheck` passes with plugin.ts
- `pnpm run lint` passes (max 90 chars)
- `pnpm test` passes (plugin tests green)
- `pnpm run build` produces `crossbag.crosspoint-plugin/plugin.js`
- The built plugin.js is a single IIFE with no external imports