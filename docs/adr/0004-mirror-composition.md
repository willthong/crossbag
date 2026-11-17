# The mirror is unread plus favourites when enabled

The device folder reflects `unread ∪ starred (when sync_favourites is on)`,
not merely "unread". This resolves the collision between Prune (Ticket 8,
which deletes archived articles) and the favourites toggle (Ticket 9, which
wants starred-but-archived articles kept): Prune's decision table now takes
both flags, pruning an archived article only when it is not a starred
favourite while the toggle is on. Any future feature that changes what
"belongs on the device" must update the mirror definition and Prune's table
together, never one without the other.