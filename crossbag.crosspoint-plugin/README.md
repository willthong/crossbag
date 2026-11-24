Crossbag

Crossbag pulls your unread wallabag articles onto this device as EPUBs.

Setup (once)

1. Settings > Connectivity > Plugins: set to Enabled.
2. Home > File Transfer: choose Join Network or Create Hotspot.
3. On your phone or computer, open the URL shown on this screen
   (for example http://crosspoint.local/ or the IP shown).
4. In the web UI, open the Plugins page and select Crossbag.
5. Enter your wallabag server URL plus the API client ID, client secret,
   username, and password. Choose Test Connection, then Save.

The wizard writes config.json on the SD card. It is not encrypted, so treat
the card as sensitive. The web server has no login: use a trusted network, or
Create Hotspot on public Wi-Fi.

Daily use

Open the Crossbag catalog on the reader, browse your unread articles newest
first, and pick one. It downloads to /Wallabag as an EPUB.

Bulk pull (Sync)

With File Transfer running, open the web UI Plugins page, select Crossbag,
and choose Sync. Sync loads config.json, pulls up to your sync_limit
(default 50) unread articles, and saves them to /Wallabag. Run it again for
the next batch.

Tick Sync favourite articles to pull starred articles too, including ones
you archived; a starred unread article is pulled only once. Sync also
prunes: articles you archived or deleted in wallabag have their EPUB and
sidecar removed from /Wallabag, except archived favourites while that
checkbox is on. A failed check never deletes anything. Turn pruning off
with the Prune archived articles checkbox.

The browser page must stay open while Sync runs. If config.json is missing,
choose Save in the wizard first.

Licence: MIT. Source: github.com/willthong/crossbag
