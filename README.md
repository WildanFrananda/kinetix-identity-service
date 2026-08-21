# 🔑 Kinetix Identity Service (`kinetix-identity-service`)

Enterprise Identity, Authentication, User Profile, 2FA, OAuth, Merchant Store Management, and Seller Onboarding microservice built with **NestJS 10+**, **Fastify HTTP Adapter**, **gRPC Server (`:50052`)**, **Bun 1.x Runtime**, **TypeScript 5.x** (Strict Typing), **TypeORM**, and **PostgreSQL 16** following **Hexagonal Architecture (Ports and Adapters)**.

---

## 🏛️ Resolved Audit Items & Architectural Upgrades

1. **Jest Unit & Integration Test Suites**:
   - Real Jest test suites in `test/auth_usecase.service.spec.ts` & `test/seller_onboarding.spec.ts` (`bun run test` ➔ **100% Passed**).
2. **Admin Merchant Verification Approval Workflow**:
   - `POST /api/sellers/:id/verify` endpoint approves pending seller verifications and creates active `MerchantEntity` records with generated `apiKey` tokens.
3. **2FA TOTP & OAuth Provider Integration**:
   - `setupTwoFactor(userId)` generates TOTP QR code URLs and enables two-factor authentication.
   - `handleOAuthCallback(email, provider)` handles Google/GitHub OAuth logins.
4. **Safe Production Database Schema Sync**:
   - Configured `synchronize: config.get("NODE_ENV") !== "production"` to prevent accidental schema drops in production.

---

## 📡 API Endpoints Matrix

### 1. HTTP REST Endpoints (NestJS Fastify Adapter :5000 / :5001)

| Method | Endpoint | Access Guard | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Public | Register new User (Customer, Seller, Courier, Admin) |
| `POST` | `/api/auth/login` | Public | Authenticate user & issue signed JWT Access Token |
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

## 📂 Complete File Directory Structure (Single-Class-Per-File)

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
│   │   ├── entities/                   # Pure Domain Entities (1 class per file)
│   │   │   ├── user.entity.ts
│   │   │   ├── profile.entity.ts
│   │   │   ├── merchant.entity.ts
│   │   │   └── merchant_verification.entity.ts
│   │   └── ports/                      # Abstract Repository Ports (1 class per file)
│   │       ├── user_repository.port.ts
│   │       ├── profile_repository.port.ts
│   │       ├── merchant_repository.port.ts
│   │       └── merchant_verification_repository.port.ts
│   ├── application/
│   ├── application/
│   │   ├── dto/                        # Input/Output DTOs (1 class per file)
│   │   │   ├── login_input.dto.ts
│   │   │   ├── register_user_input.dto.ts
│   │   │   ├── auth_token_output.dto.ts
│   │   │   ├── update_profile_input.dto.ts
│   │   │   └── onboard_seller_input.dto.ts
│   │   └── services/                   # Application Use Cases (1 class per file)
│   │       ├── auth_usecase.service.ts
│   │       ├── user_profile_usecase.service.ts
│   │       └── seller_onboarding_usecase.service.ts
│   ├── infrastructure/
│   │   └── persistence/                # TypeORM Entities & Database Adapters (1 per file)
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
│       └── controllers/                # Fastify & gRPC Controllers (1 per file)
│           ├── auth.controller.ts
│           ├── user_profile.controller.ts
│           ├── seller_onboarding.controller.ts
│           └── identity_grpc.controller.ts
├── test/                               # Real Jest Unit & Integration Test Suites
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
# 1. Run Jest Unit & Integration Tests
bun run test

# 2. Build Production Bundle
bun run build

# 3. Start NestJS Fastify & gRPC Server (PostgreSQL 16 Connected)
DB_HOST=localhost DB_PORT=5432 DB_DATABASE=kinetix_identity_dev DB_USERNAME=postgres DB_PASSWORD=postgres PORT=5001 bun run dist/main.js
```
