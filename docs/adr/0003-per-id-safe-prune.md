# Prune reconciles per-id and never deletes on uncertainty

Prune learns that an article left the unread list by making one
`GET /api/entries/{id}` per tracked article and acting only on a `404` or a
truthy `is_archived`. The alternative — enumerate the full unread list and
delete anything missing from it — is fewer round-trips but must page to the
very end, and a mid-walk failure is indistinguishable from "everything
vanished," turning one broken sync into a mass deletion. Deleting files is the
first destructive thing crossbag does, so the asymmetric rule is deliberate:
a failure must be able to skip a deletion, never cause one. Reject any future
"optimization" to a bulk diff unless it re-establishes that asymmetry.