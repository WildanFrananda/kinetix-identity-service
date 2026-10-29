# 🔑 Kinetix Identity Service (`kinetix-identity-service`)

Enterprise Identity, Authentication, User Profile, 2FA, OAuth, Merchant Store Management, and Seller Onboarding microservice built with **NestJS 10+**, **Fastify HTTP Adapter**, **gRPC Server (`:50052`)**, **Bun 1.x Runtime**, **TypeScript 5.x** (Strict Typing), **TypeORM**, and **PostgreSQL 16** following **Hexagonal Architecture (Ports and Adapters)**.

---

## 🏛️ Resolved Audit Items & Hardening Fixes

1. **Dependency CVE Patches**:
   - Upgraded all runtime dependencies (`@fastify/middie`, `@nestjs/microservices`, `@nestjs/platform-fastify`, `fastify`). `bun audit` reduced vulnerabilities from 48 down to 0 Critical / 0 High runtime advisories.
2. **Fail-Fast Secret Validation**:
   - Removed insecure hardcoded fallbacks in `src/app.module.ts`. Requires explicit `JWT_SECRET` and `DB_PASSWORD` in production environments.
3. **Auth Rate Limiting Protection**:
   - Configured `@nestjs/throttler` (`ThrottlerGuard` & `@Throttle`) on `POST /api/auth/login` and `POST /api/auth/register` (5 requests per minute) to prevent brute-force attacks.
4. **Production Database Safety (`synchronize: false`)**:
   - Disabled automatic schema synchronization in `src/app.module.ts` (`synchronize: false`) to safeguard production PostgreSQL columns.
5. **Multi-Stage Production Docker Packaging**:
   - Upgraded `Dockerfile` to a 2-stage build compiling TypeScript (`bun run build`) and running `dist/main.js` under non-root container user (`bun`).
6. **gRPC Execution Timeout Guard**:
   - Wrapped async DB calls in `src/adapters/controllers/identity_grpc.controller.ts` with a 5-second `withTimeout` execution guard to prevent cascading failures.
7. **Jest Test Suite**:
   - Executed `npx jest --config jest.config.cjs` ➔ **2 test suites passed, 4 test cases passed (100% Pass)**.

---

## 📡 API Endpoints Matrix

### 1. HTTP REST Endpoints (Fastify on `PORT`, reached through the gateway)

Rate limits are per client address: identity trusts exactly one internal hop, the gateway, to name the client.

"Client proof" routes read `X-Kinetix-Client` (the app's name) and, for a client whose proof is `app_check`, a Firebase
App Check token in `X-Firebase-AppCheck` (`IDENTITY_CLIENTS`, `IDENTITY_UNNAMED_CLIENTS`; see `CLAUDE.md`). Refusals:
400 `UNKNOWN_CLIENT`, 400 `CLIENT_REQUIRED`, 401 `CLIENT_PROOF_REQUIRED`, 401 `CLIENT_PROOF_INVALID`, 401
`CLIENT_MISMATCH` (refresh), 503 `CLIENT_PROOF_UNAVAILABLE`.

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/register` | Public, client proof, 5/min | Register a customer account |
| `POST` | `/api/v1/auth/login` | Public, client proof, 5/min, per-account delay | Sign in; answers tokens, a two-factor challenge, or (an admin without two-factor) a 10-minute enrolment token |
| `POST` | `/api/v1/auth/2fa/verify` | Public, client proof, 5/min, per-account delay | Answer a two-factor challenge; five attempts per challenge; refusals are 401 `WRONG_CODE`, `CHALLENGE_EXHAUSTED`, `CHALLENGE_SPENT` or `CHALLENGE_INVALID` |
| `POST` | `/api/v1/auth/2fa/passkey/options` | Public, client proof, 5/min | WebAuthn request options for a challenge (body `challengeToken`); 120 s, a new call replaces them; 409 `NO_PASSKEYS` |
| `POST` | `/api/v1/auth/2fa/passkey/verify` | Public, client proof, 5/min, per-account delay | Answer a challenge with a passkey (body `challengeToken`, `credential`); the same attempts as `2fa/verify`; 401 `PASSKEY_REFUSED` keeps the challenge open |
| `POST` | `/api/v1/auth/refresh` | Public, client proof, 10/min | Rotate a refresh token; only the client that started the session renews it |
| `POST` | `/api/v1/auth/logout` | Signed in | Revoke the access token and the caller's session (or all its sessions) |
| `GET` | `/api/v1/auth/me` | Signed in | The caller's claims |
| `POST` | `/api/v1/auth/2fa/setup/:id` | Owner only, 5/min, per-account delay; takes the enrolment token | Issue a TOTP secret; body `password` with an access token |
| `POST` | `/api/v1/auth/2fa/enable/:id` | Owner only, 5/min, per-account delay; takes the enrolment token | Turn two-factor on; body `code`, and `password` with an access token; ends every other session (with the enrolment token, every session) |
| `POST` | `/api/v1/auth/2fa/disable/:id` | Owner only, 5/min, per-account delay | Turn two-factor off and forget the secret; body `code` and `password`; ends every other session (an admin's, every session) |
| `GET` | `/api/v1/auth/passkeys/:id` | Owner only | The account's passkeys: credential id, name, dates, device type, backup state |
| `POST` | `/api/v1/auth/passkeys/:id/options` | Owner only, 5/min, per-account delay | Body `password`, checked first; WebAuthn creation options and their `challengeId` (300 s); 409 `TWO_FACTOR_REQUIRED` without the code, 409 `PASSKEY_LIMIT` at ten |
| `POST` | `/api/v1/auth/passkeys/:id` | Owner only, 5/min | Add a passkey; body `challengeId`, `name`, `credential`; 201 with the passkey; other sessions stay |
| `DELETE` | `/api/v1/auth/passkeys/:id/:passkeyId` | Owner only, 5/min, per-account delay | Remove a passkey; body `password`; 204, 404 `PASSKEY_NOT_FOUND` |
| `GET` | `/api/v1/users/:id/profile` | Self or admin | Read a profile |
| `PUT` | `/api/v1/users/:id/profile` | Self or admin | Write a profile; a changed address is geocoded |
| `POST` | `/api/v1/sellers/:id/onboard` | Self or admin | File a seller application (`pending`) |
| `GET` | `/api/v1/sellers/:id/application` | Self or admin | Read a seller application and its status |
| `GET` | `/api/v1/sellers/applications` | Admin | List seller applications (`status`, `limit`, `after`) |
| `POST` | `/api/v1/sellers/:id/verify` | Admin | Approve a pending application |
| `POST` | `/api/v1/sellers/:id/reject` | Admin | Reject a pending application |
| `POST` | `/api/v1/couriers/register` | Public, client proof, 5/min, per-account delay | Create a courier account and file its vehicle |
| `GET` | `/api/v1/couriers/applications` | Admin | List courier applications (`status`, `limit`, `after`) |
| `POST` | `/api/v1/couriers/:principalId/approve` | Admin | Approve a courier and activate it in the fleet |
| `GET` | `/.well-known/jwks.json` | Public | The keys tokens are verified with |
| `GET` | `/health`, `/health/ready` | Public | Liveness and readiness |

### 2. gRPC (`identity.v1.IdentityService`, `geo.v1.GeocodingService` on `GRPC_PORT`, mTLS)

The contracts live in `kinetix-contracts`; each caller reaches only the methods `GRPC_ALLOWED_CALLERS` grants it.

| RPC | Callers |
| :--- | :--- |
| `ResolvePrincipal` | order |
| `GetUserProfile` | order, notification |
| `GetMerchantInfo` | order, warehouse, catalog, pricing |
| `MerchantsChangedSince` | search |
| `GetPrincipal`, `ValidateToken` | nobody |
| `geo.v1.GeocodingService/GeocodeAddress` | order |

---

## 📂 Repository File Directory Structure

```
kinetix-identity-service/
├── proto/
│   └── identity/
│       └── v1/
│           └── identity_service.proto  # Protobuf gRPC Contract
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── domain/
│   │   ├── entities/                   # Pure Domain Entities
│   │   │   ├── user.entity.ts
│   │   │   ├── profile.entity.ts
│   │   │   ├── merchant.entity.ts
│   │   │   └── merchant_verification.entity.ts
│   │   └── ports/                      # Abstract Repository Ports
│   │       ├── user_repository.port.ts
│   │       ├── profile_repository.port.ts
│   │       ├── merchant_repository.port.ts
│   │       └── merchant_verification_repository.port.ts
│   ├── application/
│   │   ├── dto/                        # Input/Output DTOs
│   │   │   ├── login_input.dto.ts
│   │   │   ├── register_user_input.dto.ts
│   │   │   ├── auth_token_output.dto.ts
│   │   │   ├── update_profile_input.dto.ts
│   │   │   └── onboard_seller_input.dto.ts
│   │   └── services/                   # Application Use Cases
│   │       ├── auth_usecase.service.ts
│   │       ├── user_profile_usecase.service.ts
│   │       └── seller_onboarding_usecase.service.ts
│   ├── infrastructure/
│   │   └── persistence/                # TypeORM Entities & Adapters
│   │       ├── entities/
│   │       │   ├── user_typeorm.entity.ts
│   │       │   ├── profile_typeorm.entity.ts
│   │       │   ├── merchant_typeorm.entity.ts
│   │       │   └── merchant_verification_typeorm.entity.ts
│   │       └── adapters/
│   │           ├── typeorm_user_repository.adapter.ts
│   │           ├── typeorm_profile_repository.adapter.ts
│   │           ├── typeorm_merchant_repository.adapter.ts
│   │           └── typeorm_merchant_verification_repository.adapter.ts
│   └── adapters/
│       └── controllers/                # Controllers
│           ├── auth.controller.ts
│           ├── user_profile.controller.ts
│           ├── seller_onboarding.controller.ts
│           └── identity_grpc.controller.ts
├── test/                               # Jest Test Suites
│   ├── auth_usecase.service.spec.ts
│   └── seller_onboarding.spec.ts
├── package.json
├── tsconfig.json
├── jest.config.cjs
└── Dockerfile
```

---

## ⚡ Local Execution & Test Commands

```bash
# 1. Run Jest Unit & Integration Test Suites
bun run test

# 2. Build Production Bundle
bun run build

# 3. Start Service
# Every variable in .env.example is required; the service refuses to start without one.
bun run dist/main.js
```
