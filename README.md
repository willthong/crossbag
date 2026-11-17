# Crossbag

[![CI][ci-badge]][ci]
[![Coverage][coverage-badge]][ci]
[![License: MIT][license-badge]][license]
[![Node][node-badge]][package]
[![Plugin Hub][hub-badge]][hub]

[ci]: https://github.com/willthong/crossbag/actions/workflows/ci.yml
[ci-badge]:
  https://github.com/willthong/crossbag/actions/workflows/ci.yml/badge.svg
[coverage-badge]:
  https://img.shields.io/badge/coverage-88%25-brightgreen
[license-badge]: https://img.shields.io/badge/license-MIT-blue.svg
[license]: LICENSE
[node-badge]: https://img.shields.io/badge/node-%E2%89%A522-339933
[package]: package.json
[hub-badge]: https://img.shields.io/badge/Plugin%20Hub-compatible-blueviolet
[hub]: https://github.com/crosspoint-reader/crosspoint-plugin-hub

Crossbag pulls your unread [wallabag](https://wallabag.org) articles onto a
CrossPoint e-reader as EPUBs, so you can read them offline.

It has two parts:

- **Setup wizard and Sync** — a browser UI that configures your wallabag
  server and account, and can pull a bounded batch of unread articles on
  demand.
- **On-reader catalog** — a firmware screen that browses unread articles and
  downloads them as EPUBs, with no browser involved.

The payload is model-agnostic: it works the same on an Xteink X3, X4, X4Pro,
or any other CrossPoint device. Crossbag downloads EPUBs, not images, so it
needs no per-resolution variants.

See [docs/SPEC.md](docs/SPEC.md) for the full design.

## Install

Crossbag is published through **Plugin Hub**, the CrossPoint SD-card plugin.
On your device, open Plugin Hub and install Crossbag from the Community
Plugins catalog. Plugin Hub handles updates too.

### Install locally (testing before publication)

While crossbag is not yet in Plugin Hub, sideload it from source. No release or
tag is needed — firmware loads any plugin folder on the SD card.

**1. Build the bundle.** The committed `plugin.js` is current, but build if
you have changed anything:

```sh
pnpm install
pnpm run build
```

**2. Copy the payload to the card.** Power the reader off, eject the SD card,
and mount it on your computer. The folder must end up at `plugins/crossbag/`:

```sh
# macOS: the card is usually /Volumes/<name>
# Linux:  usually /media/$USER/<name>
mkdir -p /Volumes/<card>/plugins
cp -R crossbag.crosspoint-plugin /Volumes/<card>/plugins/crossbag
```

Two things trip people up here:

- the folder must be named **`crossbag`** (the plugin ID from
  `manifest.json`), **not** `crossbag.crosspoint-plugin`. Copy the *contents*
  of the payload directory into it, which is what `cp -R src dst` does when
  `dst` does not exist yet.
- create `plugins/` yourself if it is missing.

CrossPoint scans `/.crosspoint/plugins`, `/plugins`, and `/.plugins` on every
boot, earlier roots winning. `/plugins` is the dot-free option, which is why
it is the easiest to create from a card reader — the web UI rejects some
dot-prefixed path operations.

**3. Enable and open.** Back on the reader:

1. **Settings → Connectivity → Plugins** → **Enabled**
2. **Home → Plugins → Crossbag**

If Crossbag does not appear, the folder name, the nesting depth, or the
Plugins setting is wrong — the payload files must sit directly in
`plugins/crossbag/`, not one level deeper.

**Sideloading over Wi-Fi instead.** With **File Transfer** running, use the web
UI File Manager (or WebDAV, or `POST /upload`) to create `plugins/crossbag` on
the card and upload the five payload files. `POST /mkdir` takes `name` and
`path` if you prefer the API. This avoids pulling the card, at the cost of
uploading files one at a time.

**Updating a sideloaded copy.** Overwrite the files in `plugins/crossbag/` with
the new payload, then reboot or re-enter **Home → Plugins**. Delete the folder
to uninstall, or hold **Confirm** on its row for one second (long-press on
touch devices) to use the on-device uninstall.

### Local test checklist

Before publishing, confirm on hardware:

- [ ] **Home → Plugins** lists Crossbag with its title and description
- [ ] the wizard card appears on the web UI **Plugins** page (`/plugins`)
- [ ] **Test Connection** succeeds against your wallabag server
- [ ] `config.json` is written to `plugins/crossbag/` after **Save**
- [ ] the catalog lists your unread articles, newest first, 8 per page
- [ ] downloading one produces an EPUB in `/Wallabag`
- [ ] the EPUB opens and renders in the reader
- [ ] `Sync` pulls a batch into `/Wallabag` and reports its summary
- [ ] `/api/entries/{id}/export.epub` returns an EPUB directly, not a redirect
      (`api.fetchToSd` does not follow redirects)

If the catalog lists nothing, check the `_embedded.items` assumption noted in
`DETAILS.md`: run `curl -H "Authorization: Bearer <token>" \
'<server>/api/entries?archive=0'` and confirm the articles really are nested
there.

## Set up once

Credentials are configured in a browser, once. You never edit configuration by
hand.

### 1. Enable the plugin system

On the device, go to **Settings → Connectivity → Plugins** and set it to
**Enabled**. Clean installs ship with plugins disabled, and nothing below is
reachable until this is on. Enabling it also adds **Plugins** to the Home
screen.

Plugin support requires a CrossPoint build that ships the plugin system
(2.0.0 release candidate or newer). If **Home → Plugins** never appears, your
firmware predates it.

### 2. Start the web server

From the Home screen, open **File Transfer**, then pick one of the modes below.
The web server only runs while the device is in **File Transfer** or
**Calibre Wireless** mode, so the browser page will not load otherwise.

| Mode | Use when |
|------|----------|
| **Join Network** | The device and your phone/computer share a Wi-Fi network |
| **Create Hotspot** | You have no shared network; the device hosts its own |

**Join Network** connects to a 2.4 GHz network. When it connects, the screen
shows the SSID, a QR code for the URL, the direct IP URL (for example
`http://192.168.1.102/`), and the mDNS fallback `http://crosspoint.local/`.

**Create Hotspot** publishes an open network called `CrossPoint-Reader`.
Join it from your phone or computer, then open the URL shown on the reader —
`http://crosspoint.local/` where supported, otherwise `http://192.168.4.1/`.

Scanning the QR code with your phone is the quickest route in either mode.

### 3. Create a wallabag API client

In your wallabag web interface, open *Developer → API clients* and create a
client. Note the **client ID** and **client secret**. Crossbag authenticates
with the password grant, so your wallabag username and password are also
needed.

### 4. Open the wizard

In the browser, open the device URL and go to the **Plugins** page
(`http://<device-ip>/plugins`). Crossbag appears there because `manifest.json`
declares `"mount": "settings"`. Select it to open the setup wizard.

> The device web server has no authentication. Use it only on a network you
trust, and prefer **Create Hotspot** on public Wi-Fi.

### 5. Fill in and save

Enter your wallabag **server URL**, the **client ID** and **secret**, and your
**wallabag username and password**. Choose **Test Connection** — the wizard
requests an OAuth2 token and then fetches one article page to prove the
credentials work — then choose **Save**. The wizard writes `config.json` into
the plugin folder on the SD card.

**Articles per sync** sets `sync_limit` (default 50, range 1–500). Sync always
reads the saved `config.json`; if it is missing, save your credentials first.

Your `config.json` is stored unencrypted on the SD card, including the client
secret and your wallabag password. Treat the card as sensitive.

### 6. Back to the reader

Exit **File Transfer** and open **Home → Plugins → Crossbag**.

## Use on the device

Open the Crossbag catalog on the reader to browse your unread articles,
newest first. Pick one to download it to `/Wallabag` as `{title}.epub`. The
on-reader catalog works without a browser.

## Pull a batch with Sync

Sync pulls up to `sync_limit` unread articles in one go, newest first. It
skips articles already on the card, including ones pulled through the
catalog, and re-downloads an article if its EPUB was deleted. Per-article
failures do not stop the batch; retryable failures are tried again next sync,
while articles deleted server-side are recorded as skipped forever.

1. On the reader, open **File Transfer** so the web server is running.
2. In the browser, open the **Plugins** page and select Crossbag.
3. Make sure `config.json` is saved, then choose **Sync**.

The browser page **must stay open** while Sync runs: the loop runs in the
page, not on the device. The status line shows progress, then a summary such
as:

`42 pulled · 1 failed (retries next sync) · 1 skipped (deleted server-side)`.

If the batch hit `sync_limit` while unread articles remained, it says so;
run Sync again for the next batch. If the page lost its connection or a page
request failed, the summary warns that the sync did not reach the end of
the list.

Sync writes its ledger to `sync-state.json` in the plugin folder on the SD
card. It is a runtime file, so it is not listed in `manifest.json`.

## Develop

```sh
pnpm install        # install dependencies (Node >= 22)
pnpm run check      # typecheck + lint + tests
pnpm run test:coverage  # tests with coverage (thresholds enforced)
pnpm run build      # bundle src/plugin.ts into the payload's plugin.js
```

The publishable payload lives in `crossbag.crosspoint-plugin/`. Run
`pnpm run check && pnpm run build` before committing so `plugin.js` stays in
sync with source; CI rebuilds and fails on any drift.

### Coverage

CI enforces floors of 85% statements/lines/functions and 70% branches; the
badge above shows the current measured figure. Raising coverage raises the
number, and the floors stop it regressing silently.

## License

[MIT](LICENSE) © 2026 Will Thong
