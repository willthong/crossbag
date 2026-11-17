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
