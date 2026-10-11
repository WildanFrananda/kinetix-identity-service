# CLAUDE.md — kinetix-identity-service

The workspace `AGENTS.md` holds the stack and the verification commands. This file holds decisions
that the code states but cannot explain.

## Unknown is not "not found"

`GetUserProfile`, `GetMerchantInfo` and `ValidateToken` answer `found: false` / `valid: false` only for
a principal, merchant or token that really is absent or invalid. When identity cannot read its own
database they fail with `UNAVAILABLE`. Until 2026-10-11 the two lookups caught every error and answered
`found: false`, which every caller reads as a definite answer: order refused a checkout with `409`
(the merchant may not sell) instead of `503`, notification dropped a message for good as
`RECIPIENT_UNKNOWN` instead of retrying, and pricing and catalog told a seller it had no merchant. All
of those callers already treat a gRPC error as "identity could not say"; identity was the one erasing
the difference. A user with an account and no profile is still `found: true` with empty fields — that
is an answer, not a failure.

`withTimeout` clears its timer when the query settles; it used to leave one running for five seconds
after every lookup.

## A role is not overwritten by an approval

A seller application is refused, at filing and at approval, for an account that is a courier or an
admin: approving it used to set the role to `seller`, which revoked the courier role while matching kept
the driver active, and would demote an admin. Courier approval already refused the reverse. One account
holds one role; a person who wants both uses two accounts.

## A second factor belongs to its owner

The two-factor routes take `OwnerParam`, not `SelfParam`: an admin may act on another account's profile
and seller application, but not on its second factor. Setting one up hands back the secret, so an admin
who set up and enabled it on someone else's account held that person's second factor and locked them
out — and could not undo it, because disabling needs a code from the owner.
