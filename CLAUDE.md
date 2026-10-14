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

## The image carries production dependencies only

The runtime stage copies `node_modules` from a `deps` stage that runs `bun install --frozen-lockfile
--production`, not from the builder. It used to copy the builder's, so jest, ts-jest, eslint, the Nest
CLI and TypeScript shipped to production; on 2026-10-11 the image scan failed on two critical handlebars
CVEs that reached the image only through ts-jest. Every module `dist/` requires is in `dependencies`; a
package the running service needs belongs there, not in `devDependencies`.

## Each caller reaches only the RPCs it makes

`GRPC_ALLOWED_CALLERS` takes `peer`, `peer@package.Service` or `peer@package.Service/Method`
(`src/infrastructure/mesh/peer_allow_list.ts`). Until 2026-10-14 it took service names only, so every
service on the list could call every RPC: search, which only walks `MerchantsChangedSince`, could read
any user's email, phone and street address through `GetUserProfile`, a merchant's tax id through
`GetMerchantInfo`, and enumerate principals through `ResolvePrincipal`. Order had the same gap and was
fixed the day before.

Infra grants each caller what its code calls: order `ResolvePrincipal` (the principal backfill),
`GetMerchantInfo` and `GetUserProfile`; warehouse, catalog and pricing `GetMerchantInfo`; notification
`GetUserProfile`; search `MerchantsChangedSince`. Nobody is granted `ValidateToken` or `GetPrincipal`,
because nothing calls them, and nobody reaches `geo.v1.GeocodingService`. A listed caller keeps
reflection, which the mesh probes use; a bare name still means every method, so the old list parses.

Release order: identity first (the new parser reads the old list), then the infra list, then identity
again at its live digest so the container picks the list up.
