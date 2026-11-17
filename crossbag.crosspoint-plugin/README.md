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

Licence: MIT. Source: github.com/willthong/crossbag
