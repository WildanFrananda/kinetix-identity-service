import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
  UnprocessableEntityException
} from "@nestjs/common"
import * as bcrypt from "bcrypt"
import UserEntity from "../src/domain/entities/user.entity"
import AuthUsecaseService from "../src/application/services/auth_usecase.service"
import { codeAt } from "../src/infrastructure/crypto/totp"
import type { CallContext } from "../src/types/call_context.type"
import type { AccessClaims, SessionClaims } from "../src/types/token.type"
import type { TwoFactorSetup } from "../src/types/two_factor.type"

const PRINCIPAL = "11111111-2222-3333-4444-555555555555"

const CONTEXT: CallContext = { requestId: "req-auth", client: { kind: "unnamed" } }

const PASSWORD = "account-fixture-password"

const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4)

const CALLER: AccessClaims = {
  sub: PRINCIPAL,
  jti: "99999999-2222-3333-4444-555555555555",
  iss: "https://identity.kinetix.test",
  aud: "kinetix",
  exp: Math.floor(Date.now() / 1000) + 900,
  iat: Math.floor(Date.now() / 1000),
  token_use: "access",
  fam: "aaaaaaaa-0000-4000-8000-000000000001",
  uid: 1,
  email: "user@kinetix.com",
  role: "customer"
}

describe("AuthUsecaseService Unit Tests", () => {
  let service: AuthUsecaseService
  let mockUserRepository: any
  let mockTokenService: any
  let mockPrincipalResolver: any
  let mockSignInAttempts: any
  let mockClientGate: any
  let user: UserEntity

  beforeEach(() => {
    user = new UserEntity(1, "user@kinetix.com", PASSWORD_HASH, "customer")
    mockUserRepository = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      save: jest.fn(),
      acceptTwoFactorStep: jest.fn().mockResolvedValue(true)
    }
    mockTokenService = {
      issuePair: jest.fn().mockResolvedValue({
        accessToken: "mocked_access_token",
        refreshToken: "mocked_refresh_token",
        expiresIn: 900
      }),
      rotate: jest.fn(),
      peekRefresh: jest.fn(),
      peekMfaChallenge: jest.fn(),
      issueMfaChallenge: jest.fn().mockReturnValue({ token: "mocked_challenge", expiresIn: 300 }),
      consumeMfaChallenge: jest.fn().mockResolvedValue(undefined),
      refuseSpentMfaChallenge: jest.fn().mockResolvedValue(undefined),
      revokeOtherSessions: jest.fn().mockResolvedValue(undefined),
      logout: jest.fn().mockResolvedValue(undefined)
    }
    mockPrincipalResolver = {
      resolveOrMintForUser: jest.fn().mockResolvedValue("11111111-2222-3333-4444-555555555555"),
      syncKind: jest.fn().mockResolvedValue(undefined)
    }

    mockSignInAttempts = {
      admit: jest.fn().mockResolvedValue({ attempts: 1 }),
      admitChallengeAttempt: jest.fn().mockResolvedValue({ attempts: 1 }),
      failed: jest.fn(),
      succeeded: jest.fn().mockResolvedValue(undefined)
    }

    mockClientGate = {
      mismatch: jest.fn().mockReturnValue(new UnauthorizedException({ error: "CLIENT_MISMATCH" })),
      bound: jest.fn()
    }

    service = new AuthUsecaseService(
      mockUserRepository,
      mockTokenService,
      mockPrincipalResolver,
      mockSignInAttempts,
      mockClientGate
    )
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("should register a new user successfully", async () => {
    mockUserRepository.findByEmail.mockResolvedValue(null)
    mockUserRepository.save.mockImplementation(async (user: UserEntity) => {
      return new UserEntity(1, user.email, user.passwordHash, user.role)
    })

    const result = await service.register(
      {
        email: "newuser@kinetix.com",
        password: "password12345"
      },
      CONTEXT
    )

    expect(result.accessToken).toBe("mocked_access_token")
    expect(result.refreshToken).toBe("mocked_refresh_token")
    expect(result.expiresIn).toBe(900)
    expect(result.user.email).toBe("newuser@kinetix.com")
    expect(mockUserRepository.save).toHaveBeenCalled()
  })

  it("should always register as customer, ignoring any role supplied by the caller", async () => {
    mockUserRepository.findByEmail.mockResolvedValue(null)
    mockUserRepository.save.mockImplementation(async (user: UserEntity) => {
      return new UserEntity(1, user.email, user.passwordHash, user.role)
    })

    const result = await service.register(
      {
        email: "attacker@kinetix.com",
        password: "password123",
        role: "admin"
      } as any,
      CONTEXT
    )

    const persisted: UserEntity = mockUserRepository.save.mock.calls[0][0]
    expect(persisted.role).toBe("customer")
    expect(result.user.role).toBe("customer")
    expect(mockTokenService.issuePair).toHaveBeenCalledWith(
      expect.objectContaining({ role: "customer" }),
      "11111111-2222-3333-4444-555555555555",
      null
    )
  })

  it("should mint against the principal UUID, never the account id", async () => {
    mockUserRepository.findByEmail.mockResolvedValue(null)
    mockUserRepository.save.mockImplementation(async (user: UserEntity) => {
      return new UserEntity(7, user.email, user.passwordHash, user.role)
    })

    const result = await service.register({ email: "seven@kinetix.com", password: "password123" }, CONTEXT)

    expect(result.user.principalId).toBe("11111111-2222-3333-4444-555555555555")
    expect(mockTokenService.issuePair.mock.calls[0][1]).toBe("11111111-2222-3333-4444-555555555555")
    expect(mockTokenService.issuePair.mock.calls[0][1]).not.toBe(7)
  })

  it("should keep the principal kind in step with the account role on every login", async () => {
    const user = new UserEntity(3, "seller@kinetix.com", "hash", "seller")
    mockUserRepository.findByEmail.mockResolvedValue(user)
    jest.spyOn(require("bcrypt"), "compare").mockResolvedValue(true as never)

    await service.login({ email: "seller@kinetix.com", password: "password123" }, CONTEXT)

    expect(mockPrincipalResolver.syncKind).toHaveBeenCalledWith("11111111-2222-3333-4444-555555555555", "seller")
  })

  it("should reject an unknown email without revealing that it is unknown", async () => {
    mockUserRepository.findByEmail.mockResolvedValue(null)

    await expect(service.login({ email: "nobody@kinetix.com", password: "whatever" }, CONTEXT)).rejects.toThrow(
      "Invalid email or password credentials"
    )
  })

  describe("email addresses", () => {
    it("stores a new account's email in lower case", async () => {
      mockUserRepository.findByEmail.mockResolvedValue(null)
      mockUserRepository.save.mockImplementation(async (u: UserEntity) => u)

      const result = await service.register({ email: "  New.User@Kinetix.COM ", password: "password12345" }, CONTEXT)

      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith("new.user@kinetix.com")
      expect(mockUserRepository.save.mock.calls[0][0].email).toBe("new.user@kinetix.com")
      expect(result.user.email).toBe("new.user@kinetix.com")
    })

    it("looks an account up by its lower-cased email at login", async () => {
      mockUserRepository.findByEmail.mockResolvedValue(user)
      jest.spyOn(require("bcrypt"), "compare").mockResolvedValue(true as never)

      await service.login({ email: "User@Kinetix.Com", password: "password123" }, CONTEXT)

      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith("user@kinetix.com")
    })
  })

  describe("logout", () => {
    it("revokes the session the caller names with its own refresh token", async () => {
      mockTokenService.peekRefresh.mockReturnValue({ sub: PRINCIPAL, fam: "family-1", token_use: "refresh" })

      await service.logout(CALLER, "refresh-token")

      expect(mockTokenService.logout).toHaveBeenCalledWith(CALLER, "family-1")
    })

    it("refuses another principal's refresh token and revokes nothing", async () => {
      mockTokenService.peekRefresh.mockReturnValue({
        sub: "ffffffff-2222-3333-4444-555555555555",
        fam: "someone-elses-family",
        token_use: "refresh"
      })

      await expect(service.logout(CALLER, "someone-elses-refresh-token")).rejects.toBeInstanceOf(ForbiddenException)
      expect(mockTokenService.logout).not.toHaveBeenCalled()
    })

    it("fails when the revocation could not be written, rather than answering success", async () => {
      mockTokenService.logout.mockRejectedValue(new Error("connection terminated unexpectedly"))

      await expect(service.logout(CALLER)).rejects.toThrow("connection terminated")
    })
  })

  describe("two-factor authentication", () => {
    function currentCode(secret: string): string {
      return codeAt(secret, Math.floor(Date.now() / 1000 / 30))
    }

    function setup(): Promise<TwoFactorSetup> {
      return service.setupTwoFactor(CALLER, 1, { password: PASSWORD }, CONTEXT)
    }

    function enable(code: string, claims: SessionClaims = CALLER): Promise<{ enabled: true }> {
      return service.enableTwoFactor(claims, 1, { code, password: PASSWORD }, CONTEXT)
    }

    function disable(code: string): Promise<{ enabled: false }> {
      return service.disableTwoFactor(CALLER, 1, { code, password: PASSWORD }, CONTEXT)
    }

    async function setUpSecret(): Promise<string> {
      const res = await setup()
      return res.twoFactorSecret
    }

    async function enabledSecret(): Promise<string> {
      const secret = await setUpSecret()
      await enable(currentCode(secret))
      jest.clearAllMocks()
      mockUserRepository.acceptTwoFactorStep.mockResolvedValue(true)
      return secret
    }

    beforeEach(() => {
      mockUserRepository.findById.mockResolvedValue(user)
      mockUserRepository.save.mockImplementation(async (u: UserEntity) => u)
      mockTokenService.peekMfaChallenge.mockReturnValue({
        uid: 1,
        sub: PRINCIPAL,
        jti: "challenge-jti",
        exp: Math.floor(Date.now() / 1000) + 300,
        token_use: "mfa_challenge"
      })
    })

    it("returns a scannable secret and leaves it disabled", async () => {
      const res = await setup()

      expect(res.twoFactorSecret).toMatch(/^[A-Z2-7]+$/)
      expect(res.qrCodeUrl).toContain("otpauth://totp/")
      expect(res.enabled).toBe(false)
      expect(user.isTwoFactorEnabled).toBe(false)
    })

    it("refuses to re-issue a secret for an account that already has it on", async () => {
      user.isTwoFactorEnabled = true
      await expect(setup()).rejects.toThrow("already enabled")
    })

    it("refuses to enable on a wrong code with 422, so a signed-in client does not sign out", async () => {
      await setUpSecret()

      await expect(enable("000000")).rejects.toBeInstanceOf(UnprocessableEntityException)
      expect(user.isTwoFactorEnabled).toBe(false)
    })

    it("enables on a correct code", async () => {
      const secret = await setUpSecret()
      await expect(enable(currentCode(secret))).resolves.toEqual({ enabled: true })
      expect(user.isTwoFactorEnabled).toBe(true)
    })

    it("ends every other session of the account when it is enabled", async () => {
      const secret = await setUpSecret()

      await enable(currentCode(secret))

      expect(mockTokenService.revokeOtherSessions).toHaveBeenCalledWith(
        PRINCIPAL,
        CALLER.fam,
        "two_factor_enabled"
      )
    })

    it("does not turn it on when the other sessions could not be ended", async () => {
      const secret = await setUpSecret()
      mockTokenService.revokeOtherSessions.mockRejectedValue(new Error("connection terminated"))

      await expect(enable(currentCode(secret))).rejects.toThrow("connection terminated")
      expect(user.isTwoFactorEnabled).toBe(false)
    })

    it("refuses to enable before a secret has been issued", async () => {
      user.twoFactorSecret = null
      await expect(enable("123456")).rejects.toThrow("Request a two-factor secret")
    })

    it("refuses to act on another account's second factor", async () => {
      await expect(enable("123456", { ...CALLER, uid: 2 })).rejects.toBeInstanceOf(ForbiddenException)
    })

    it("refuses a code whose time step was already accepted", async () => {
      const secret = await setUpSecret()
      mockUserRepository.acceptTwoFactorStep.mockResolvedValue(false)

      await expect(enable(currentCode(secret))).rejects.toThrow("already been used")
      expect(user.isTwoFactorEnabled).toBe(false)
    })

    it("answers a password with a challenge, not tokens, once it is on", async () => {
      await enabledSecret()
      mockUserRepository.findByEmail.mockResolvedValue(user)
      jest.spyOn(require("bcrypt"), "compare").mockResolvedValue(true as never)

      const res: any = await service.login({ email: user.email, password: "password123" }, CONTEXT)

      expect(res.mfaRequired).toBe(true)
      expect(res.challengeToken).toBeDefined()
      expect(res.accessToken).toBeUndefined()
      expect(mockTokenService.issuePair).not.toHaveBeenCalled()
    })

    it("issues tokens only when the challenge is answered with a valid code", async () => {
      const secret = await enabledSecret()

      await expect(service.verifyTwoFactor("challenge", "000000", CONTEXT)).rejects.toThrow("not valid")
      expect(mockTokenService.issuePair).not.toHaveBeenCalled()

      const out = await service.verifyTwoFactor("challenge", currentCode(secret), CONTEXT)
      expect(out.accessToken).toBe("mocked_access_token")
    })

    it("spends the challenge when it is answered, and only then", async () => {
      const secret = await enabledSecret()

      await expect(service.verifyTwoFactor("challenge", "000000", CONTEXT)).rejects.toThrow("not valid")
      expect(mockTokenService.consumeMfaChallenge).not.toHaveBeenCalled()

      await service.verifyTwoFactor("challenge", currentCode(secret), CONTEXT)
      expect(mockTokenService.consumeMfaChallenge).toHaveBeenCalledWith(
        expect.objectContaining({ jti: "challenge-jti" })
      )
    })

    it("issues nothing for a challenge that was already answered", async () => {
      const secret = await enabledSecret()
      mockTokenService.consumeMfaChallenge.mockRejectedValue(
        new UnauthorizedException("This challenge has already been answered; sign in again")
      )

      await expect(service.verifyTwoFactor("challenge", currentCode(secret), CONTEXT)).rejects.toThrow(
        "already been answered"
      )
      expect(mockTokenService.issuePair).not.toHaveBeenCalled()
    })

    it("issues nothing for a code whose time step was already accepted", async () => {
      const secret = await enabledSecret()
      mockUserRepository.acceptTwoFactorStep.mockResolvedValue(false)

      await expect(service.verifyTwoFactor("challenge", currentCode(secret), CONTEXT)).rejects.toBeInstanceOf(
        UnauthorizedException
      )
      expect(mockTokenService.issuePair).not.toHaveBeenCalled()
    })

    it("refuses a challenge for an account that has since turned 2FA off", async () => {
      user.isTwoFactorEnabled = false
      user.twoFactorSecret = null

      await expect(service.verifyTwoFactor("challenge", "123456", CONTEXT)).rejects.toThrow("does not have two-factor")
    })

    it("requires a current code to turn it off, and forgets the secret", async () => {
      const secret = await enabledSecret()

      await expect(disable("000000")).rejects.toBeInstanceOf(UnprocessableEntityException)
      expect(user.isTwoFactorEnabled).toBe(true)

      await expect(disable(currentCode(secret))).resolves.toEqual({ enabled: false })
      expect(user.isTwoFactorEnabled).toBe(false)
      expect(user.twoFactorSecret).toBeNull()
      expect(mockUserRepository.save.mock.calls.at(-1)[0].twoFactorSecret).toBeNull()
    })

    it("ends every other session of the account when it is disabled", async () => {
      const secret = await enabledSecret()

      await disable(currentCode(secret))

      expect(mockTokenService.revokeOtherSessions).toHaveBeenCalledWith(
        PRINCIPAL,
        CALLER.fam,
        "two_factor_disabled"
      )
    })
  })
})
