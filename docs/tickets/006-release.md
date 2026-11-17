# Ticket 6 — Release workflow

**Depends on**: Ticket 5 (project is buildable and tested)

**Seam**: Pushing a `v*` tag triggers a GitHub Actions workflow that builds
the plugin, validates the payload, and creates a GitHub Release.

## What

Create the automated release pipeline that produces Plugin Hub-compatible
releases.

### .github/workflows/release.yml

Trigger: push of tags matching `v*`

Jobs (sequential):

1. **validate** — same as CI (lint, typecheck, test)
2. **build** — runs `pnpm run build`, verifies output
3. **release** — creates a GitHub Release:
   - Uses `softprops/action-gh-release`
   - Release name: tag name (e.g. `v0.1.0`)
   - Body: extract from CHANGELOG.md or auto-generate from commits
   - Attach the `crossbag.crosspoint-plugin/` directory as a release asset?
     NO — Plugin Hub reads from the git tag, not release assets.
     The release just needs to exist as non-draft, non-prerelease.
   - Mark as latest release (non-prerelease, non-draft)

### CHANGELOG.md

- Keep a simple changelog at the repo root
- Initial entry: `## 0.1.0 — First release`
- Brief: "Initial release of crossbag. Browse wallabag articles on-device
  and download as EPUBs. Browser-based setup wizard for credentials."

### Pre-release checklist (documentation, not automation)

In `docs/RELEASE.md`:
1. Update `manifest.json` version
2. Update `package.json` version to match
3. Update CHANGELOG.md
4. Run `pnpm run check`
5. Run `pnpm run build`
6. Commit and push
7. Tag: `git tag v0.1.0 && git push origin v0.1.0`
8. Wait for release workflow
9. Wait up to 4 hours for Plugin Hub catalog refresh
10. Verify crossbag appears in Community Plugins

## Done when

- Release workflow exists and is syntactically valid
- CHANGELOG.md exists with 0.1.0 entry
- docs/RELEASE.md exists with the checklist