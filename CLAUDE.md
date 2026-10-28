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
the first run of the hardened gate (39192414868) showed it. GitLab's jobs add Node to the pinned `oven/bun` image,
so they need `--bun` too.

## Rate limits count per client, behind exactly one hop

`createFastifyAdapter` passes `isGatewayHop` as Fastify's `trustProxy`: the immediate peer is trusted to name the
client only when it is on a loopback or private network (the gateway on the Docker network), and no further hop is
ever trusted. `req.ip`, which `@nestjs/throttler` keys every bucket on, is then the address Kong appended to
`X-Forwarded-For`; a client's own `X-Forwarded-For` entries sit in front of it and are never read. Until 2026-10-21
there was no `trustProxy`, so `req.ip` was Kong for every request and all clients together shared five logins a
minute. A hop count (`trustProxy: 1`) does not work: Fastify 5.12 fails a numeric `trustProxy` closed and trusts
nothing. Kong itself sees client addresses (nothing sits in front of it; `api.` is a grey-cloud A record and Docker's
DNAT keeps the source), and it must not set `trusted_ips` while that is so. A proxy added in front of Kong, or the
edge service placed between Kong and identity, is a second hop, and this function changes with it.

## No CORS here

Identity sends no CORS headers. `app.enableCors()` answered `Access-Control-Allow-Origin: *` while production left
Kong's CORS off on purpose. CORS belongs at the gateway, with explicit origins, when the first web client exists.

## A second factor is spent once

A challenge token's `jti` is written to `revoked_access_tokens` (reason `mfa_challenge_used`) when it is answered, so
it mints one session, not one per request for 300 s; a wrong code does not spend it. `users.twoFactorLastStep` is the
last TOTP time step accepted for the account, moved forward only by a conditional `UPDATE`, so a code is good once.
Enabling or disabling the second factor ends every other session of the account (the user's ruling, 2026-10-21): the
access token carries `fam`, its session's refresh family, and every other family is revoked. A token minted before
`fam` existed names no session, so all of them end. Disabling writes the secret as `NULL`; it used to keep it, so
`enable` re-armed the old secret without a new setup.

## An admin signs in with a second factor

Two-factor is required for `admin` (the user's ruling, 2026-10-22). An admin without it who gives the right password
gets a restricted session, not tokens: `{ mfaEnrolmentRequired, enrolmentToken, tokenType, expiresIn, userId }`. The
token lives 600 s, `token_use` is `mfa_enrolment`, and it carries `sub`, `jti`, `iss`, `aud`, `iat`, `exp` and `uid`
only, with `azp` when the client named itself: no `role`, no `email`, no `fam`, and no refresh token is issued. `JwtAuthGuard` lets it through only on routes
marked `@AcceptsEnrolment()`, which are `2fa/setup` and `2fa/enable`; every other route answers 403
`TWO_FACTOR_ENROLMENT_ONLY`, and `ValidateToken` answers `valid: false` because it uses `verifyAccess`. Kong checks only
signature and expiry, so the token reaches other services' handlers, and each refuses it there: every verifier in the
estate requires `token_use` to be `access` (order's `OnTokenValidated`, catalog's `_as_access_claims`, and warehouse,
matching, pricing, payment, review, notary and notification alike); communication asks `ValidateToken`, and chat's
planned EMQX authenticator requires `access` too.

Enabling with the enrolment token revokes every refresh family of the account and the enrolment token's `jti`, so the
admin signs in again, this time through the challenge. A refresh by an admin without a second factor (a session minted
before the rule, or an account `promote_account` made admin) is refused 401 `TWO_FACTOR_REQUIRED` and its family is
revoked; enabling would otherwise make such a session refreshable again. An admin who disables the factor loses every
session, the current access token included, and next signs in to a restricted session. `startSession` refuses to mint a
pair for an admin without the factor, so no other path can. The bootstrap admin needs nothing: its first sign-in is the
restricted session. An access token minted before the rule lives out its 15 minutes.

## Attempts are counted per account and per challenge

`sign_in_attempt_policy.ts` holds the numbers. Each account has a counter keyed by the SHA-256 of its lower-cased email,
whether or not the email exists, so a delay never tells an unknown email from a wrong password (an unknown email still
pays the dummy bcrypt and is logged and counted as a failure the same way). An attempt is counted when it starts, in a
transaction that locks the account's row, so twenty simultaneous attempts let exactly five through; the count is cleared
when a sign-in completes (a pair, or an admin's restricted session), not when a password is right and a code is still
owed. From the fifth attempt the next one waits 1 s, then 2, 4 … up to 60 s and never longer: an attacker can slow an
account, never lock it out, though at the cap the owner shares each minute's attempt with the attacker. A request that
arrives while the delay runs is answered 429 `SIGN_IN_DELAYED` with `Retry-After` before any password or code is read,
and is not itself counted. An hour without attempts forgets the counter. The codes checked inside a session (`enable`,
`disable`) go through the same counter, so a stolen access token cannot strip the factor at the per-address rate.

A claim is judged by `clock_timestamp()` read after the account's row is locked, the moment it is decided (2026-10-27).
It used `now()`, the time its transaction began: a claim that waited behind one decided meanwhile found that one's
`delayedUntil` (its decision time, below five attempts) in its future, and near-simultaneous sign-ins got 429 before the
fifth attempt.

A challenge takes five attempts (`two_factor_challenge_attempts`, keyed by its `jti`, claimed with a conditional upsert);
the sixth is refused even with the right code and from a new address, and a new challenge needs the password again.
Since 2026-10-27 a request on a challenge that is spent, exhausted or invalid is refused without counting on the account,
because it cannot be a guess at the code: `verify` checks the challenge's revocation first, and `claimChallengeAttempt`
locks the account's row, reads the challenge's count before it decides the delay and writes both counts in one
transaction, so simultaneous requests on an exhausted challenge count nothing, and an exhausted challenge is answered as
exhausted even while the account is delayed.

Every `2fa/verify` refusal is 401 `{error, message, traceId}` (2026-10-27): `WRONG_CODE` (the challenge stays open),
`CHALLENGE_EXHAUSTED`, `CHALLENGE_SPENT` (also a code another sign-in already used, since answering spent the challenge)
or `CHALLENGE_INVALID` (also an account that is gone or no longer has the factor). The messages did not change: the
courier app tells refusals apart by them. The edge keeps its pending sign-in only on `WRONG_CODE`.

`WINDOW_STEPS = 1` keeps three codes valid at a time, so a guess hits with probability 3 in 10⁶. Before these limits it
was five guesses a minute per address, and with 1,000 addresses a factor fell in about 67 minutes. At the cap it is one
attempt a minute per account, five codes for every sign-in: about 1,200 guesses a day, 0.36 % a day, 10 % over thirty
days of uninterrupted attack. That residual is what the alert on `kinetix_identity_sign_in_failures_total` is for.

Every wrong password, wrong code or reused code logs `sign_in_failure` at warn (stage, role, reason, account key, attempt
count, user id when known, request id; never the email, password or code) and counts in
`kinetix_identity_sign_in_failures_total{stage,role}`, an unknown email under `other`. `ExpiredRecordSweeperService`
deletes, every ten minutes, counters idle for an hour, challenge counters past expiry, and revocations past expiry;
nothing swept `revoked_access_tokens` before 2026-10-23.

## Admin actions are audited

`@AdminAudit(action, param)` marks every admin-only route and every mixed route an admin may use (a profile read or
write, a seller application read or filing). After the handler decides, `AdminAuditInterceptor` logs `admin_action`
(`actor` = `sub`, `action`, `target` = the path id or `*` for a list, `outcome`, request id) and counts
`kinetix_admin_actions_total{action,outcome}`, every series published at zero. It records only a caller whose access
token has role `admin`, own resources included. Guards run before it, so a non-admin refused by `RolesGuard` is not an
admin action; pipes run inside it, so an admin's malformed request is `refused`. An HTTP refusal below 500, a conflict
or a missing reference is `refused`, anything else `failed`.

## The request id reaches the use cases as an argument

`@RequestContext()` hands each sign-in path a `CallContext` (`src/types/call_context.type.ts`); the failure log takes its
request id from there. It is an argument, not async-local storage, because Fastify parses a body in the socket's async
context, which would lose the store on every POST. The client the request proved it is travels on the same type.

## Only Kinetix's own apps start a session

Every route that starts or renews a session (login, `2fa/verify`, `auth/register`, `couriers/register`, refresh) carries
`ClientProofGuard`; logout and the signed-in routes do not. The client names itself in `X-Kinetix-Client`, a public
name, never a secret: a key compiled into an app is extracted in minutes, so only a platform's attestation proves a
client (docs-internal PLAN.md, "Only Kinetix's own applications", the user's ruling of 2026-10-22). `IDENTITY_CLIENTS`
gives each name its proof, `app_check` or `none`; `none` is a stated choice for the lab and for a rollout.
`IDENTITY_UNNAMED_CLIENTS` decides a request without the header: `allow` while installed apps predate the header, then
`refuse`. Every value is read at start; an unknown proof kind, a malformed name, `unnamed`/`unknown` as a name (they are
metric labels), or an app id of another Firebase project stops the service. The courier app's contract names courier
registration; `auth/register` takes the guard as well because it mints a session, and a route that mints one unguarded
would be the way around `refuse`.

The guard runs before pipes and the handler, so a refused client costs no password check, no attempt on the account's
counter and no failure metric. Answers: an unknown name 400 `UNKNOWN_CLIENT`, no name under `refuse` 400
`CLIENT_REQUIRED`, no proof 401 `CLIENT_PROOF_REQUIRED`, a proof that fails any check 401 `CLIENT_PROOF_INVALID` with one
fixed message whatever failed, and keys that cannot be read 503 `CLIENT_PROOF_UNAVAILABLE`, never 401: the courier app
retries a fresh proof once on `CLIENT_PROOF_*` and treats the 503 as "later", never as a sign-out.

`FirebaseAppCheckVerifier` checks the header (`alg` RS256, `typ` JWT, a `kid`) before any key is fetched, then the
signature, `iss` (`https://firebaseappcheck.googleapis.com/<FIREBASE_PROJECT_NUMBER>`), `aud` containing
`projects/<number>`, `exp` with no leeway, `iat` and `nbf` with 60 s, and `sub` in `IDENTITY_APP_CHECK_APP_IDS_<NAME>`.
It uses `jsonwebtoken`, already the service's JOSE library, with `ignoreExpiration` so the times are judged against the
injected clock. `AppCheckKeySet` fetches Google's JWKS (the URL is a constant of the protocol, not configuration; tests
hand the key set a local server's URL and a clock, as the other specs hand in their fakes) and trusts it for six hours. A
`kid` it does not hold refetches at most every ten seconds with one fetch in flight. A failed fetch (no answer, not 200,
not a key set, an RSA key that does not parse or is under 2048 bits) is remembered: until a fetch succeeds, a token whose
key is not in a fresh set is unverifiable (503), and an unknown `kid` is invalid only when the latest fetch succeeded.
Keys older than six hours are dropped even when Google cannot be reached, so an outage longer than that is 503 for every
proof. Nothing is fetched at start, so identity starts while Google is unreachable.

Each refusal logs `client_proof_refused` at warn (client name, or `unnamed`/`unknown`; reason `missing`, `malformed`,
`invalid_signature`, `expired`, `not_yet_valid`, `wrong_project`, `wrong_app_id`, `keys_unavailable`, `unknown_client`,
`client_required` or `client_mismatch`; request id; an unknown name truncated to 64 characters) and counts
`kinetix_identity_client_proof_refusals_total{client,reason}`, every reachable series published at zero; a key-set
failure also logs `app_check_keys_unavailable` at error with its cause. The proof itself is never logged.

## A session belongs to the client that started it

Access, refresh and enrolment tokens carry `azp`, the client's name, when the client named itself; an unnamed client's
tokens have none, and the challenge token never does (verify is itself guarded, and the session takes verify's client).
`refresh_tokens.client` (migration `RefreshTokenClient1789650000000`) stores it per token. A renewal from another name,
or an unnamed renewal of a named session, is 401 `CLIENT_MISMATCH` and spends nothing: `refresh` compares the token's
`azp` before the account is read, so it also comes before the admin rule that revokes a family, and `rotate` compares the
stored row again under its lock (`ClientMismatchError`). A session that names no client (every session minted before
2026-10-23, and an unnamed client's under `allow`) is bound by the first named renewal with a good proof: the replacement
token and row carry the name, `client_session_bound` is logged at info, and the rules above hold from then on. That is
the coordinator's decision of 2026-10-23, so couriers are not all signed out when they install the app that sends the
headers; an unnamed renewal of an unnamed session stays unnamed. The replay of the spent unnamed token is still reuse
and ends the family.

## Changing the second factor in a session needs the password

`2fa/setup` and `2fa/enable` with an access token, and `2fa/disable` (access only), need the account's current password
in the body (the coordinator's decision, 2026-10-23): a stolen access token alone could otherwise set up a factor the
owner does not hold, and lock them out. A missing password is 400 `PASSWORD_REQUIRED` before anything is counted; a
wrong one is refused exactly as sign-in refuses it (401, same body), logged and counted as a `password` failure on the
account's counter, so `SIGN_IN_DELAYED` applies. One request admits one attempt, password and code together; the
password is checked first, so a wrong password never tests the code. With an admin's `mfa_enrolment` token setup and
enable do not ask again: the password was given at most ten minutes earlier to obtain it. `2fa/setup` is limited to five a
minute per address like the others.

## A cleared value is written as NULL

TypeORM's `save` skips a property that is `undefined`. The adapters therefore write `?? null` for every nullable
column the domain clears: the profile's and merchant's point and `geocodedAt`, the merchant's description, the
second-factor secret. Until 2026-10-21 a failed re-geocode kept the old point in the database while the response
omitted it, and `GetMerchantInfo` sent couriers to the previous store address.

## Emails match without case

Register and login lower-case the email, `findByEmail` compares `lower(email)`, and `UQ_users_email_lower` makes
two accounts that differ only by case impossible. Accounts made before 2026-10-21 keep the case they were written
in. TypeORM does not read expression indexes, so the entity declares the index with `synchronize: false` for the
reader, not for the drift gate.

## An approval decides a pending application once

`verify` and `reject` act on a `pending` seller application only, and an approval never touches a merchant that is
`active` or `suspended`. Suspension waits on infra `docs/MERCHANT-SUSPENSION.md`. A courier application is recorded
in `courier_applications` when the vehicle is filed and marked approved by `approve`, which is what an admin lists;
the migration recorded existing couriers as approved, and a courier who registered before 2026-10-21 and was never
approved appears once it submits the registration again. Approval refuses an account with no vehicle
(`NO_DRIVER_RECORD`, 409) and any other definite refusal from the fleet (502), and returns a promoted account to
customer, because the fleet did nothing; an unknown outcome keeps the role and asks for a retry.

`reject` (2026-10-28, the backoffice's F3, the mirror of seller reject) acts on a `pending` courier application only,
sets `rejected` and `rejectedAt` with a conditional `UPDATE`, and never asks the fleet: the driver row stays inactive, as
it was. It refuses an account that is already a courier (409): that is an approval which began and did not finish (the
503 above), and a rejection would leave the role in place, so the admin approves again instead. A rejected courier files
again by registering again (the same email and password resume the account); the filing reopens the application as
`pending` with a new `filedAt`, while an approved one stays approved. An approval refuses a rejected application (409)
for the same reason seller approval refuses one that is not pending; an approval and a rejection racing each other end
approved, because the approval's upsert wins. Neither takes a reason: there is no column for one, for sellers or
couriers, and adding it is a product decision (infra `docs/BACKOFFICE.md` §7.2).

Seller applications name the applicant's principal (`principalId`, `null` when the account never signed in) in the list,
the read and the rejection, and an approval returns the merchant with it, so an admin has the id other services key on.
Courier applications and approvals already carried it. Courier
registration resumes only a customer's or a courier's account: a seller's or admin's credentials would have filed a
vehicle under that principal.

gRPC maps `active` to `MERCHANT_STATUS_UNSPECIFIED` because `identity.v1.MerchantStatus` has no value for it; nothing
sets `active` yet.

## Account ids are read from the raw path

`@AccountIdParam` reads `request.params` itself. The global `ValidationPipe` (`transform: true`) converts a route
parameter whose type is `number` with `+value` before any parameter pipe runs, so `ParseIntPipe` saw `0x10` as 16,
`1e3` as 1000, and `-1`, `0` and ids beyond int4 passed to Postgres.

## A write that loses a race is 409 or 404

The adapters turn Postgres' unique violation into `RecordConflictError` and a foreign-key violation into
`MissingReferenceError`, and the exception filter answers them 409 and 404. A 500 no longer claims that nothing
changed: register, seller approval and courier registration write in steps, and one can fail after another.

## A role change reaches tokens at the next refresh

The role is a claim in the access token, so a promotion or demotion is seen by other services only when the client
refreshes, up to `JWT_ACCESS_TTL_SECONDS` later. That is a design limit, not a defect.

## A database that cannot be reached is 503

`isDatabaseUnavailable` (`src/infrastructure/persistence/database_unavailable.ts`) recognises a socket that would not
connect or was cut (`ECONNREFUSED`, `ETIMEDOUT`, `Connection terminated…`), Postgres refusing or shutting down
(SQLSTATE class `08`, `53300`, `57P01`–`57P03`) and the pool's wait running out (`timeout exceeded when trying to
connect`), also inside a `QueryFailedError` or an `AggregateError`. The exception filter answers those 503
`DATABASE_UNAVAILABLE` on every HTTP route, the token guard's revocation lookup included; it used to be 500, and a
constraint violation is still what the adapters make of it. `connectTimeoutMS` (5 s) bounds both a new connection and
the wait for a pooled one, so a database that does not answer becomes a 503 rather than a request that hangs until
Kong gives up.

## A fault on identity's side is not the courier's error

`FleetFailure.kind` is `refused` only for the fleet's own `success: false`, which courier registration answers 400 with
the fleet's code. gRPC `INVALID_ARGUMENT`, `PERMISSION_DENIED`, `UNAUTHENTICATED`, `UNIMPLEMENTED`, `FLEET_METHOD_MISSING`
and `FLEET_CONTRACT_MISSING` are `fault`: the fleet certainly did nothing, but because of identity's contract, mesh
identity or allow list, so registration answers 502 `FLEET_FAULT` (approval 502 with the code) with a fixed message and
the cause in the log. Until 2026-10-23 they were `refused`, and registration told the courier to correct the vehicle.
Every other outcome is `unknown`, 503. `accountExists: true` is in all three answers. The cause has to go under
`fields`: `JsonLogger` writes only `message`, `requestId` and `fields`, so the keys these log calls used to set beside
`message` (the gRPC code and details among them) never reached the log.

## Null is not "leave unchanged"

`@IsOptional()` skips validation for `null` as well as for a missing key, so `PUT /users/{id}/profile` copied a `null`
into a NOT NULL column (500) and `logout` passed a `null` refresh token on to the token check (401). Those fields take
`@ValidateIf(isSent)` and refuse `null` with 400; `avatarUrl` keeps `@IsOptional()`, because `null` clears it. No other
path writes `null` into a NOT NULL column (a new profile maps a missing value to `""`), so Postgres' 23502 is not mapped:
reaching it would be a bug, and 500 says so.

## A refresh resolves the principal before it rotates

`refresh` resolves (or mints) the principal before `rotate`, so a failure there leaves the presented refresh token
unspent. It used to rotate first; a resolver failure then answered 500 or 503 after the token was spent, and the
client's retry was read as reuse and revoked the whole family.

## Every peer address is read at start

`FleetRegistryGrpcAdapter` reads `MATCHING_GRPC_HOST` in its constructor, so identity refuses to start without it. It
used to be read at the first courier registration, which then answered 400 after the account had been created.
Matching is identity's only outbound gRPC peer.

## Jest runs on Node

Every job installs with Bun and runs jest on Node: jest cannot set up its environment under Bun. GitHub's runner has
Node, and `bunx jest` follows jest's shebang; GitLab's jobs add Node to the pinned Bun image with `apk`.
