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

### 1. HTTP REST Endpoints (NestJS Fastify Adapter :5000 / :5001)

| Method | Endpoint | Access Guard | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Rate Limited (5/min) | Register new User (Customer, Seller, Courier, Admin) |
| `POST` | `/api/auth/login` | Rate Limited (5/min) | Authenticate user & issue signed JWT Access Token |
| `POST` | `/api/auth/2fa/setup/:id` | JWT Protected | Setup 2FA TOTP secret & QR code |
| `POST` | `/api/auth/oauth/callback` | Public | Google / GitHub OAuth callback authentication |
| `GET` | `/api/users/:id/profile` | JWT Protected | Retrieve User Profile and Shipping Address |
| `PUT` | `/api/users/:id/profile` | JWT Protected | Update User Profile, Address, or Avatar |
| `POST` | `/api/sellers/:id/onboard` | JWT Protected | Submit seller onboarding request (Status: `pending`) |
| `POST` | `/api/sellers/:id/verify` | Admin Guard | Approve seller verification & issue active `MerchantEntity` |

### 2. gRPC RPC Protocol (`proto/identity/v1/identity_service.proto` :50052)

| RPC Name | Input Message | Output Message | Consumer Services |
| :--- | :--- | :--- | :--- |
| `GetUserProfile` | `GetUserProfileRequest` (`user_id`) | `GetUserProfileResponse` | `kinetix-warehouse-service`, `kinetix-matching-service` |
| `GetMerchantInfo` | `GetMerchantInfoRequest` (`user_id`) | `GetMerchantInfoResponse` | `kinetix-warehouse-service` |
| `ValidateToken` | `ValidateTokenRequest` (`access_token`) | `ValidateTokenResponse` | `kinetix-api-gateway` |

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
DB_HOST=localhost DB_PORT=5432 DB_DATABASE=kinetix_identity_dev DB_USERNAME=postgres DB_PASSWORD=postgres PORT=5000 bun run dist/main.js
```
