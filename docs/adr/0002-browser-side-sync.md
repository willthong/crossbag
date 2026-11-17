# Browser-side Sync for bulk pulls

Bulk "pull all unread" runs as a `plugin.js` browser action (Sync), not a
declarative `device.json` feature, because the firmware's catalog download
loop fetches exactly one item per selection and wallabag has no bulk export
endpoint. The alternatives — a hosted index/bundle service or a merged-EPUB
server — were rejected because they move wallabag credentials off the device
and add always-on infrastructure. Consequence: the browser page must stay open
while Sync runs, which is acceptable for an on-demand pull with no clock.