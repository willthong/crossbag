# Crossbag

[![CI](https://github.com/willthong/crossbag/actions/workflows/ci.yml/badge.svg)](https://github.com/willthong/crossbag/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/badge/coverage-88%25-brightgreen)](https://github.com/willthong/crossbag/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A522-339933)](package.json)
[![Plugin Hub](https://img.shields.io/badge/Plugin%20Hub-compatible-blueviolet)](https://github.com/crosspoint-reader/crosspoint-plugin-hub)

Crossbag pulls your unread [wallabag](https://wallabag.org) articles onto a
CrossPoint e-reader as EPUBs, so you can read them offline.

It has two parts:

- **Setup wizard** — a browser UI that runs once to configure your wallabag
  server and account.
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

Your `config.json` is stored unencrypted on the SD card, including the client
secret and your wallabag password. Treat the card as sensitive.

### 6. Back to the reader

Exit **File Transfer** and open **Home → Plugins → Crossbag**.

## Use on the device

Open the Crossbag catalog on the reader to browse your unread articles,
newest first. Pick one to download it to `/Wallabag` as `{title}.epub`. The
on-reader catalog works without a browser.

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
