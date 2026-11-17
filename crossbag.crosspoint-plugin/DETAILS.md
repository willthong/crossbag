# Crossbag

Pull your unread [wallabag](https://wallabag.org) articles onto your e-reader
as EPUBs, then read them offline.

## How it works

Crossbag talks to your own wallabag server over its REST API:

- **Auth**: OAuth2 password grant against `/oauth/v2/token`, using the API
  client credentials you create in wallabag.
- **Browse**: `GET /api/entries?archive=0&sort=created&order=desc` lists your
  unread articles, newest first, eight per page on the on-reader catalog.
- **Download**: `GET /api/entries/{id}/export.epub` exports an article and
  saves it to `/Wallabag` as `{title}.epub`.

The on-reader catalog needs no browser: once configured, you browse and
download entirely from the device.

## Setup

Run the Crossbag setup wizard once from the device web UI (on your phone or
computer). Enter:

- your wallabag server URL
- the API client ID and client secret
- your wallabag username and password

The wizard checks the connection and saves the values to `config.json` on the
SD card. You never edit raw JSON by hand.

## Requirements

- A wallabag server reachable from your device
- A wallabag API client (create one under *Developer → API clients* in
  wallabag settings) to get a client ID and secret

## Caveat

Article listing expects wallabag to return its items under `_embedded.items`,
which is wallabag's standard API response shape. If your server or a proxy
rewrites that structure, the catalog may show no articles.
