import { generateKeyPairSync } from "crypto"
import { APP_GUARD } from "@nestjs/core"
import { Test } from "@nestjs/testing"
import { ThrottlerModule } from "@nestjs/throttler"
import type { NestFastifyApplication } from "@nestjs/platform-fastify"
import AuthController from "../../src/adapters/controllers/auth.controller"
import CourierOnboardingController from "../../src/adapters/controllers/courier_onboarding.controller"
import PasskeyController from "../../src/adapters/controllers/passkey.controller"
import SellerOnboardingController from "../../src/adapters/controllers/seller_onboarding.controller"
import UserProfileController from "../../src/adapters/controllers/user_profile.controller"
import JwtAuthGuard from "../../src/adapters/guards/jwt_auth.guard"
import RolesGuard from "../../src/adapters/guards/roles.guard"
import SelfOrStaffGuard from "../../src/adapters/guards/self_or_staff.guard"
import AuthUsecaseService from "../../src/application/services/auth_usecase.service"
import ClientGateService from "../../src/application/services/client_gate.service"
import CourierOnboardingUsecaseService from "../../src/application/services/courier_onboarding_usecase.service"
import CourierRegistrationUsecaseService from "../../src/application/services/courier_registration_usecase.service"
import PasskeyUsecaseService from "../../src/application/services/passkey_usecase.service"
import SellerOnboardingUsecaseService from "../../src/application/services/seller_onboarding_usecase.service"
import SignInAttemptsService from "../../src/application/services/sign_in_attempts.service"
import TokenService from "../../src/application/services/token.service"
import UserProfileUsecaseService from "../../src/application/services/user_profile_usecase.service"
import JwtKeyProvider from "../../src/infrastructure/crypto/jwt_key_provider"
import { createFastifyAdapter } from "../../src/infrastructure/http/fastify_adapter"
import { configureHttpPipeline } from "../../src/infrastructure/http/http_pipeline"
import { DEFAULT_THROTTLE } from "../../src/infrastructure/http/throttle_policy"
import SimpleWebAuthnCeremonyAdapter from "../../src/infrastructure/webauthn/simple_webauthn_ceremony.adapter"
import { labClientGate } from "./client_gates"
import { fakeTokenRepository } from "./fake_token_repository"
import InMemoryPasskeyChallenges from "./in_memory_passkey_challenges"
import InMemoryPasskeys from "./in_memory_passkeys"
import InMemorySignInAttempts from "./in_memory_sign_in_attempts"
import InMemoryUsers from "./in_memory_users"
import { LAB_RELYING_PARTY } from "./lab_relying_party"

const PRINCIPAL_PREFIX = "00000000-0000-4000-8000-"

function principalOf(userId: number): string {
  return `${PRINCIPAL_PREFIX}${String(userId).padStart(12, "0")}`
}

function tokenServiceWithFakes(): {
  tokens: TokenService
  refreshRepo: ReturnType<typeof fakeTokenRepository>
  revokedRepo: ReturnType<typeof fakeTokenRepository>
} {
  const privateKey = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" }
  }).privateKey

  const settings: Record<string, string> = {
    KINETIX_IDENTITY_JWT_PRIVATE_KEY_B64: Buffer.from(privateKey).toString("base64"),
    JWT_ISSUER: "https://identity.kinetix.test",
    JWT_AUDIENCE: "kinetix",
    JWT_ACCESS_TTL_SECONDS: "900",
    JWT_REFRESH_TTL_SECONDS: "2592000"
  }

  const config = { get: (name: string) => settings[name] } as any
  const refreshRepo = fakeTokenRepository<any>()
  const revokedRepo = fakeTokenRepository<any>()
  const tokens = new TokenService(config, new JwtKeyProvider(config), refreshRepo as any, revokedRepo as any)

  return { tokens, refreshRepo, revokedRepo }
}

async function identityApp(gate: ClientGateService = labClientGate()) {
  const { tokens, refreshRepo, revokedRepo } = tokenServiceWithFakes()
  const users = new InMemoryUsers()
  const attempts = new InMemorySignInAttempts()
  const signInAttempts = new SignInAttemptsService(attempts)
  const principals = {
    resolveOrMintForUser: jest.fn(async (user: { id: number }) => principalOf(user.id)),
    syncKind: jest.fn().mockResolvedValue(undefined)
  }

  const passkeys = new InMemoryPasskeys()
  const passkeyChallenges = new InMemoryPasskeyChallenges()
  const auth = new AuthUsecaseService(users, tokens, principals as any, signInAttempts, gate, passkeys)
  const passkeyUsecase = new PasskeyUsecaseService(
    users,
    passkeys,
    passkeyChallenges,
    new SimpleWebAuthnCeremonyAdapter(LAB_RELYING_PARTY),
    auth,
    tokens,
    signInAttempts
  )

  const sellers = {
    listApplications: jest.fn().mockResolvedValue({ applications: [], nextAfterId: null }),
    applicationOf: jest.fn().mockResolvedValue({ userId: 7, status: "pending", principalId: principalOf(7) }),
    onboardSeller: jest.fn().mockResolvedValue({ userId: 7, status: "pending" }),
    approveVerification: jest.fn().mockResolvedValue({ userId: 7, status: "verified", principalId: principalOf(7) }),
    rejectVerification: jest.fn().mockResolvedValue({ userId: 7, status: "rejected", principalId: principalOf(7) })
  }

  const couriers = {
    listApplications: jest.fn().mockResolvedValue({ applications: [], nextAfterId: null }),
    approveCourier: jest.fn().mockResolvedValue({ principalId: principalOf(9) })
  }

  const profiles = {
    getProfile: jest.fn().mockResolvedValue({ userId: 7 }),
    updateProfile: jest.fn().mockResolvedValue({ userId: 7 })
  }

  const fleet = {
    registerDriver: jest.fn().mockResolvedValue({ driverId: 42, alreadyRegistered: false }),
    activateDriver: jest.fn()
  }

  const courierApplications = { recordFiled: jest.fn().mockResolvedValue(undefined) }
  const registration = new CourierRegistrationUsecaseService(
    auth,
    profiles as any,
    fleet as any,
    users,
    courierApplications as any
  )

  const moduleRef = await Test.createTestingModule({
    imports: [ThrottlerModule.forRoot([DEFAULT_THROTTLE])],
    controllers: [
      AuthController,
      PasskeyController,
      SellerOnboardingController,
      CourierOnboardingController,
      UserProfileController
    ],
    providers: [
      { provide: TokenService, useValue: tokens },
      { provide: ClientGateService, useValue: gate },
      { provide: AuthUsecaseService, useValue: auth },
      { provide: PasskeyUsecaseService, useValue: passkeyUsecase },
      { provide: SellerOnboardingUsecaseService, useValue: sellers },
      { provide: CourierOnboardingUsecaseService, useValue: couriers },
      { provide: CourierRegistrationUsecaseService, useValue: registration },
      { provide: UserProfileUsecaseService, useValue: profiles },
      RolesGuard,
      SelfOrStaffGuard,
      { provide: APP_GUARD, useClass: JwtAuthGuard }
    ]
  }).compile()

  const app = moduleRef.createNestApplication<NestFastifyApplication>(createFastifyAdapter(), { logger: false })
  configureHttpPipeline(app)
  await app.init()
  await app.getHttpAdapter().getInstance().ready()

  return {
    app,
    tokens,
    refreshRepo,
    revokedRepo,
    users,
    attempts,
    passkeys,
    passkeyChallenges,
    principals,
    sellers,
    couriers,
    profiles,
    fleet
  }
}

export { identityApp, principalOf, tokenServiceWithFakes }
