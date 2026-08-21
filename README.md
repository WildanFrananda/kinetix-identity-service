# 🔑 Kinetix Identity Service (`kinetix-identity-service`)

Enterprise Identity, Authentication, User Profile, 2FA, OAuth, and Seller/Merchant Onboarding microservice built with **NestJS 10+**, **Fastify HTTP Adapter**, **Bun 1.x Runtime**, **TypeScript 5.x** (Strict Typing), **TypeORM**, and **PostgreSQL 16** following **Hexagonal Architecture (Ports and Adapters)**.

---

## 🏛️ Stack & Runtime Performance Highlights

- **Framework**: NestJS 10+ with **`FastifyAdapter`** (`@nestjs/platform-fastify`) for 3x-5x higher HTTP throughput than Express.
- **Runtime**: **Bun 1.x** for sub-second container startup, native TypeScript execution, and ultra-fast dependency resolution.
- **Architecture**: Hexagonal Architecture (Ports & Adapters) with **Strict Single-Class-Per-File** rules.
- **Type Checking**: 100% Strict Type Safety (`strict: true`) with zero semicolons, double quotes, and clean default exports.

---

## 📂 Complete File Directory Structure (Single-Class-Per-File)

```
kinetix-identity-service/src/
├── main.ts
├── app.module.ts
├── domain/
│   ├── entities/                       # Pure Domain Entities (1 class per file)
│   │   ├── user.entity.ts
│   │   ├── profile.entity.ts
│   │   └── merchant_verification.entity.ts
│   └── ports/                          # Abstract Repository Interfaces (1 interface per file)
│       ├── user_repository.port.ts
│       ├── profile_repository.port.ts
│       └── merchant_verification_repository.port.ts
├── application/
│   ├── dto/                            # Input/Output DTOs (1 class per file)
│   │   ├── login_input.dto.ts
│   │   ├── register_user_input.dto.ts
│   │   ├── auth_token_output.dto.ts
│   │   ├── update_profile_input.dto.ts
│   │   └── onboard_seller_input.dto.ts
│   └── services/                       # Application Use Cases (1 class per file)
│       ├── auth_usecase.service.ts
│       ├── user_profile_usecase.service.ts
│       └── seller_onboarding_usecase.service.ts
├── infrastructure/
│   └── persistence/                    # TypeORM Entities & Database Adapters (1 per file)
│       ├── entities/
│       │   ├── user_typeorm.entity.ts
│       │   ├── profile_typeorm.entity.ts
│       │   └── merchant_verification_typeorm.entity.ts
│       └── adapters/
│           ├── typeorm_user_repository.adapter.ts
│           ├── typeorm_profile_repository.adapter.ts
│           └── typeorm_merchant_verification_repository.adapter.ts
└── adapters/
    └── controllers/                    # NestJS Fastify HTTP Controllers (1 per file)
        ├── auth.controller.ts
        ├── user_profile.controller.ts
        └── seller_onboarding.controller.ts
```

---

## ⚡ Local Execution & Build Guide with Bun

```bash
# 1. Install Dependencies with Bun
bun install

# 2. Start NestJS Fastify Server in Development Mode with Bun Watcher
bun run start:dev

# 3. Build & Run Docker Container (Bun 1.x Base Image)
docker-compose up --build -d
```
