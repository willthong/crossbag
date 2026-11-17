# Ticket 1 — Repository scaffold and CI lint gate

**Depends on**: nothing

**Seam**: `pnpm run lint`, `pnpm run typecheck`, and `pnpm test` all pass on an
empty codebase.

## What

Create the repository skeleton with all dev tooling configured. No plugin code
yet — just the scaffold that subsequent tickets build on.

### package.json

- Name: `crossbag`, version `0.1.0`, private, `"type": "module"`
- Scripts: `build`, `typecheck`, `lint`, `test`, `test:watch`, `check`
  (runs typecheck + lint + test)
- Dev dependencies: typescript, eslint, @eslint/js, typescript-eslint,
  esbuild, vitest, zod

### tsconfig.json

- Target ES2022, module ES2022, moduleResolution bundler
- Strict with noUncheckedIndexedAccess, noUnusedLocals, noUnusedParameters
- Include `src/`, `tests/`; exclude `crossbag.crosspoint-plugin/`

### eslint.config.mjs

- Extends @eslint/js recommended + typescript-eslint strict + stylistic
- Rule: `max-len` at 90 chars (`ignoreStrings: true`)
- Rule: `no-non-null-assertion: error`
- Ignore: `crossbag.crosspoint-plugin/plugin.js`, `dist/`, `node_modules/`

### esbuild.config.mjs

- Entry: `src/plugin.ts`, output: `crossbag.crosspoint-plugin/plugin.js`
- Format: `iife`, target: `es2022`, bundle: true
- Not invoked yet (no source), but must be present and syntactically valid

### .github/workflows/ci.yml

- Trigger: push to main, PRs to main
- Jobs: lint, typecheck, test (run in parallel)
- Uses Node 22, pnpm, installs deps, runs the corresponding script

### Placeholder files

- `src/plugin.ts` — empty or a single trivial export so `tsc --noEmit` passes
- `tests/` — at least one trivial test so `vitest run` passes
  (e.g. `expect(true).toBe(true)`)

## Done when

- `pnpm install` succeeds
- `pnpm run typecheck` passes (0 errors)
- `pnpm run lint` passes (0 errors, 0 warnings)
- `pnpm test` passes (at least one green test)