import UserEntity from "../src/domain/entities/user.entity"
import AuthUsecaseService from "../src/application/services/auth_usecase.service"
import { codeAt } from "../src/infrastructure/crypto/totp"

describe("AuthUsecaseService Unit Tests", () => {
  let service: AuthUsecaseService
  let mockUserRepository: any
  let mockTokenService: any
  let mockPrincipalResolver: any
  let user: UserEntity

  beforeEach(() => {
    user = new UserEntity(1, "user@kinetix.com", "hash", "customer")
    mockUserRepository = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      save: jest.fn()
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
      logout: jest.fn()
    }
    mockPrincipalResolver = {
      resolveOrMintForUser: jest.fn().mockResolvedValue("11111111-2222-3333-4444-555555555555"),
      syncKind: jest.fn().mockResolvedValue(undefined)
    }

    service = new AuthUsecaseService(mockUserRepository, mockTokenService, mockPrincipalResolver)
  })

  it("should register a new user successfully", async () => {
    mockUserRepository.findByEmail.mockResolvedValue(null)
    mockUserRepository.save.mockImplementation(async (user: UserEntity) => {
      return new UserEntity(1, user.email, user.passwordHash, user.role)
    })

    const result = await service.register({
      email: "newuser@kinetix.com",
      password: "password123"
    })

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

    const result = await service.register({
      email: "attacker@kinetix.com",
      password: "password123",
      role: "admin"
    } as any)

    const persisted: UserEntity = mockUserRepository.save.mock.calls[0][0]
    expect(persisted.role).toBe("customer")
    expect(result.user.role).toBe("customer")
    expect(mockTokenService.issuePair).toHaveBeenCalledWith(
      expect.objectContaining({ role: "customer" }),
      "11111111-2222-3333-4444-555555555555"
    )
  })

  it("should mint against the principal UUID, never the account id", async () => {
    mockUserRepository.findByEmail.mockResolvedValue(null)
    mockUserRepository.save.mockImplementation(async (user: UserEntity) => {
      return new UserEntity(7, user.email, user.passwordHash, user.role)
    })

    const result = await service.register({ email: "seven@kinetix.com", password: "password123" })

    expect(result.user.principalId).toBe("11111111-2222-3333-4444-555555555555")
    expect(mockTokenService.issuePair.mock.calls[0][1]).toBe("11111111-2222-3333-4444-555555555555")
    expect(mockTokenService.issuePair.mock.calls[0][1]).not.toBe(7)
  })

  it("should keep the principal kind in step with the account role on every login", async () => {
    const user = new UserEntity(3, "seller@kinetix.com", "hash", "seller")
    mockUserRepository.findByEmail.mockResolvedValue(user)
    jest.spyOn(require("bcrypt"), "compare").mockResolvedValue(true as never)

    await service.login({ email: "seller@kinetix.com", password: "password123" })

    expect(mockPrincipalResolver.syncKind).toHaveBeenCalledWith("11111111-2222-3333-4444-555555555555", "seller")
  })

  it("should reject an unknown email without revealing that it is unknown", async () => {
    mockUserRepository.findByEmail.mockResolvedValue(null)

    await expect(service.login({ email: "nobody@kinetix.com", password: "whatever" })).rejects.toThrow(
      "Invalid email or password credentials"
    )
  })

  describe("two-factor authentication", () => {
    function currentCode(secret: string): string {
      return codeAt(secret, Math.floor(Date.now() / 1000 / 30))
    }

    async function setUpSecret(): Promise<string> {
      const res = await service.setupTwoFactor(1)
      return res.twoFactorSecret
    }

    beforeEach(() => {
      mockUserRepository.findById.mockResolvedValue(user)
      mockUserRepository.save.mockImplementation(async (u: UserEntity) => u)
    })

    it("returns a scannable secret and leaves it disabled", async () => {
      const res = await service.setupTwoFactor(1)

      expect(res.twoFactorSecret).toMatch(/^[A-Z2-7]+$/)
      expect(res.qrCodeUrl).toContain("otpauth://totp/")
      expect(res.enabled).toBe(false)
      expect(user.isTwoFactorEnabled).toBe(false)
    })

    it("refuses to re-issue a secret for an account that already has it on", async () => {
      user.isTwoFactorEnabled = true
      await expect(service.setupTwoFactor(1)).rejects.toThrow("already enabled")
    })

    it("refuses to enable on a wrong code, and stays off", async () => {
      await setUpSecret()
      await expect(service.enableTwoFactor(1, "000000")).rejects.toThrow("not valid")
      expect(user.isTwoFactorEnabled).toBe(false)
    })

    it("enables on a correct code", async () => {
      const secret = await setUpSecret()
      await expect(service.enableTwoFactor(1, currentCode(secret))).resolves.toEqual({ enabled: true })
      expect(user.isTwoFactorEnabled).toBe(true)
    })

    it("refuses to enable before a secret has been issued", async () => {
      user.twoFactorSecret = undefined
      await expect(service.enableTwoFactor(1, "123456")).rejects.toThrow("Request a two-factor secret")
    })

    it("answers a password with a challenge, not tokens, once it is on", async () => {
      const secret = await setUpSecret()
      await service.enableTwoFactor(1, currentCode(secret))
      mockUserRepository.findByEmail.mockResolvedValue(user)
      jest.spyOn(require("bcrypt"), "compare").mockResolvedValue(true as never)

      const res: any = await service.login({ email: user.email, password: "password123" })

      expect(res.mfaRequired).toBe(true)
      expect(res.challengeToken).toBeDefined()
      expect(res.accessToken).toBeUndefined()
      expect(mockTokenService.issuePair).not.toHaveBeenCalled()
    })

    it("issues tokens only when the challenge is answered with a valid code", async () => {
      const secret = await setUpSecret()
      await service.enableTwoFactor(1, currentCode(secret))
      mockTokenService.peekMfaChallenge.mockReturnValue({ uid: 1, sub: "p", token_use: "mfa_challenge" })

      await expect(service.verifyTwoFactor("challenge", "000000")).rejects.toThrow("not valid")
      expect(mockTokenService.issuePair).not.toHaveBeenCalled()

      const out = await service.verifyTwoFactor("challenge", currentCode(secret))
      expect(out.accessToken).toBe("mocked_access_token")
    })

    it("refuses a challenge for an account that has since turned 2FA off", async () => {
      user.isTwoFactorEnabled = false
      user.twoFactorSecret = undefined
      mockTokenService.peekMfaChallenge.mockReturnValue({ uid: 1, sub: "p", token_use: "mfa_challenge" })

      await expect(service.verifyTwoFactor("challenge", "123456")).rejects.toThrow("does not have two-factor")
    })

    it("requires a current code to turn it off", async () => {
      const secret = await setUpSecret()
      await service.enableTwoFactor(1, currentCode(secret))

      await expect(service.disableTwoFactor(1, "000000")).rejects.toThrow("not valid")
      expect(user.isTwoFactorEnabled).toBe(true)

      await expect(service.disableTwoFactor(1, currentCode(secret))).resolves.toEqual({ enabled: false })
      expect(user.isTwoFactorEnabled).toBe(false)
      expect(user.twoFactorSecret).toBeUndefined()
    })
  })
})
