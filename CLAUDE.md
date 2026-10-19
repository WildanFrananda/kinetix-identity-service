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
because nothing calls them. Since 2026-10-18 order is also granted `geo.v1.GeocodingService/GeocodeAddress`,
to place a checkout's address; nobody is granted the batch `GeocodeAddresses`. A listed caller keeps
reflection, which the mesh probes use; a bare name still means every method, so the old list parses.

Release order: identity first (the new parser reads the old list), then the infra list, then identity
again at its live digest so the container picks the list up.

## A rotated signing key keeps verifying what it signed

`KINETIX_IDENTITY_JWT_PREVIOUS_PUBLIC_KEYS_B64`, optional, is the base64 of one or more PEM public keys that
signed before the current one. `JwtKeyProvider` lists them in the JWKS after the signing key and
`verificationKey` hands one out by `kid`; nothing signs with them. `verifySignature` picks the key the token's
`kid` names and refuses a token that names none or names one identity does not hold. Until 2026-10-19 identity
held one key, so replacing it refused every refresh token the old key had signed and signed everyone out.

A previous key stays for `JWT_REFRESH_TTL_SECONDS` (thirty days) after the rotation, until the last refresh
token it signed has expired. Kong verifies with one static key, so an access token the old key signed is
refused at the gateway from the rotation on; the refresh route is public there, and identity answers that
token's refresh with a pair the new key signed. A leaked key is never kept as a previous one. The procedure is
docs-internal's `operations/signing-key-rotation`.

## The merchant feed reads in commit-safe order

`MerchantsChangedSince` used to page by `(updatedAt, id)`. `updatedAt` is written before the transaction
commits, so a merchant saved in a transaction that committed after a later one's could be behind the cursor by
the time it became visible, and search never saw that change. Since 2026-10-19 `merchant_change_feed` holds,
per merchant, the transaction that last changed it, written by the `merchants_record_change_transaction`
trigger on every insert and update. A cursor that carries `transaction_id` is served by `findChangedAfter`:
merchants ordered by `(change_transaction_id, id)`, only below `pg_snapshot_xmin(pg_current_snapshot())`, so an
open transaction holds the feed back and never makes it skip. Any transaction left open in the cluster holds it
back too.

The transaction lives in its own table because the drift gate would read a column TypeORM cannot map (`xid8`) as
one to drop. A cursor without `transaction_id` is still served the old way until search speaks the new one in
production; then `findChangedSince` goes. The specs that prove the order need a real Postgres and run one file at
a time (`--runInBand`), because they share one database.

`kinetix-contracts` is at 1.5.0, the first version with the transaction cursor; `bun.lock` was resolved against
the published package, never a locally built one.

## The drift gate fails unless it really compared

The `migrations` job's gate passes only when `migration:generate` answers "No changes in database schema were
found". Until 2026-10-19 it passed on any failure of the command, and it had nothing to compare honestly
against: the entities did not declare the three `CK_*_on_earth` checks, the named foreign keys
`FK_principal_aliases_principal` and `FK_refresh_tokens_principal` (refresh tokens had no relation at all),
`ix_profiles_created`, or `UQ_geocoded_addresses_query`, all of which migrations had made. A generate run against
a migrated database proposed dropping every one. The entities now carry them by name, and a constraint added in a
migration is declared on its entity in the same change.

The gate runs the CLI as `bunx --bun typeorm`. GitHub's runner has Node, `bunx` follows the CLI's `node` shebang,
and Node cannot load `src/data-source.ts` (its migration imports carry no extension), so without `--bun` the
command fails before it compares anything. That failure is what the old gate reported as "no drift" on every run;
the first run of the hardened gate (39192414868) showed it. GitLab's job runs in `oven/bun`, which has no Node.
