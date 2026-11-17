# Crossbag

Crossbag pulls your unread [wallabag](https://wallabag.org) articles onto a
CrossPoint e-reader as EPUBs, so you can read them offline.

It has two parts:

- **Setup wizard** — a browser UI that runs once to configure your wallabag
  server and account.
- **On-reader catalog** — a firmware screen that browses unread articles and
  downloads them as EPUBs, with no browser involved.

See [docs/SPEC.md](docs/SPEC.md) for the full design.

## Install

Crossbag is published through **Plugin Hub**, the CrossPoint SD-card plugin.
On your device, open Plugin Hub and install Crossbag from the Community
Plugins catalog. Plugin Hub handles updates too.

## Set up once

1. Create a wallabag API client under *Developer → API clients* in your
   wallabag settings. Note the client ID and client secret.
2. Open the device web UI on your phone or computer and run the **Crossbag**
   setup wizard.
3. Enter your wallabag server URL, the client ID and secret, and your
   wallabag username and password.
4. Choose **Test Connection**, then **Save**. The wizard writes `config.json`
   to the SD card.

You never edit configuration by hand.

## Use on the device

Open the Crossbag catalog on the reader to browse your unread articles,
newest first. Pick one to download it to `/Wallabag` as `{title}.epub`. The
on-reader catalog works without a browser.

## Develop

```sh
pnpm install   # install dependencies (Node >= 22)
pnpm run check # typecheck + lint + tests
pnpm run build # bundle src/plugin.ts into the payload's plugin.js
```

The publishable payload lives in `crossbag.crosspoint-plugin/`. Run
`pnpm run check && pnpm run build` before committing so `plugin.js` stays in
sync with source.
