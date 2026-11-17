# Dual-interface plugin: device.json for daily use, plugin.js for one-time auth setup

A CrossPoint plugin can use `device.json` (on-reader declarative catalog)
or `plugin.js` (browser WebUI), or both. We chose both, with a strict split:
`plugin.js` is a one-time setup wizard for OAuth credentials; `device.json`
handles day-to-day browsing and downloading.

The alternative was `device.json`-only, which would require the user to
manually edit a JSON config file on the SD card to enter wallabag server
URL, client ID, client secret, username, and password. On an e-ink device
with no keyboard, that is painful and error-prone.

The browser wizard (`plugin.js`) gives the user a form on their phone or
computer. It validates the credentials with a test API call before saving,
and the user never touches raw JSON. After setup, they use the on-reader
catalog exclusively.

This adds a build step (TypeScript → bundled JS) but the wizard is small
(~100 lines) and the UX payoff justifies it.