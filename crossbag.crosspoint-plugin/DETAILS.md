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

## Sync (bulk pull)

Sync runs as a button in the browser setup page. It reads the saved
`config.json`, lists `/Wallabag`, pages through unread articles newest
first, and downloads up to `sync_limit` new EPUBs (default 50). With the
`sync_favourites` flag on, it also walks wallabag's starred list and fills
any remaining budget with those articles, including archived favourites;
the two lists are unioned by article id so nothing downloads twice. It
skips articles already on the card, including catalog pulls recorded in
their `.meta.json` sidecars, and re-downloads an article whose EPUB was
deleted.

Before pulling, Sync prunes: it checks each article it previously recorded
and deletes the EPUB and sidecar when wallabag says the article is archived
or gone. An archived favourite is kept while `sync_favourites` is on. Only a
definite answer deletes; a network error, a server error, or an unreadable
reply keeps the files, and files crossbag did not create are never touched.
The `prune_on_sync` config flag (on by default) controls the phase.

`sync-state.json` records every attempt as pulled, skipped, or failed.
Skipped articles (deleted server-side) are not retried; failed ones are.
The summary reports each count and warns when the list was not exhausted.

The browser page must stay open while Sync runs: the loop runs in the page,
not on the device. If `config.json` is missing, save your credentials first.

## Setup

Run the Crossbag setup wizard once from the device web UI (on your phone or
computer). Enter:

- your wallabag server URL
- the API client ID and client secret
- your wallabag username and password

The wizard checks the connection and saves the values to `config.json` on the
SD card. You never edit raw JSON by hand. The same page also has **Sync**
for pulling a batch of unread articles.

## Requirements

- A wallabag server reachable from your device
- A wallabag API client (create one under *Developer → API clients* in
  wallabag settings) to get a client ID and secret

## Caveat

Article listing expects wallabag to return its items under `_embedded.items`,
which is wallabag's standard API response shape. If your server or a proxy
rewrites that structure, the catalog may show no articles.

## License

MIT. Crossbag is free software; you may redistribute and modify it under the
terms of the MIT licence. Source: https://github.com/willthong/crossbag
