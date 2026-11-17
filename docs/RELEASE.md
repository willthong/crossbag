# Releasing crossbag

Plugin Hub discovers new versions from the git tag and the payload directory
`crossbag.crosspoint-plugin/`. A release is therefore just: bump, verify,
commit, push the tag, let the workflow publish a non-draft GitHub Release.

## Pre-release checklist

Work through these in order.

1. Bump the `version` field in `crossbag.crosspoint-plugin/manifest.json`.
2. Bump the `version` field in `package.json` so it matches.
3. Add the new version's section to `CHANGELOG.md`.
4. Run `pnpm run check` (typecheck, lint, tests) and fix any failures.
5. Run `pnpm run build` and confirm `crossbag.crosspoint-plugin/plugin.js`
   was regenerated.
6. Commit the changes and push the branch.
7. Tag the commit and push it: `git tag v0.1.0 && git push origin v0.1.0`.
8. Wait for the release workflow to finish; check the GitHub Release exists
   and is marked latest.
9. Wait up to 4 hours for the Plugin Hub catalog refresh.
10. Verify crossbag appears in Community Plugins on the device.

## What the workflow does

`.github/workflows/release.yml` runs on any `v*` tag push:

1. **validate** — `pnpm run check`.
2. **build** — `pnpm run build`, then asserts `plugin.js` exists.
3. **release** — checks that the tag (minus an optional leading `v`) equals
   the manifest version, then creates a non-draft, non-prerelease GitHub
   Release marked latest.

No release assets are uploaded: Plugin Hub installs from the git tag.
