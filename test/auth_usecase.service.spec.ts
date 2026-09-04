import UserEntity from "../src/domain/entities/user.entity"
import AuthUsecaseService from "../src/application/services/auth_usecase.service"

describe("AuthUsecaseService Unit Tests", () => {
  let service: AuthUsecaseService
  let mockUserRepository: any
  let mockTokenService: any
  let mockPrincipalResolver: any

  beforeEach(() => {
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

  it("should setup 2FA secret and return totp QR code URL", async () => {
    const user = new UserEntity(1, "user@kinetix.com", "hash", "customer")
    mockUserRepository.findById.mockResolvedValue(user)
    mockUserRepository.save.mockResolvedValue(user)

    const result = await service.setupTwoFactor(1)

    expect(result.twoFactorSecret).toBeDefined()
    expect(result.qrCodeUrl).toContain("otpauth://totp/")
    expect(user.isTwoFactorEnabled).toBe(true)
  })

  it("should generate a 2FA secret that is unpredictable and valid base32", async () => {
    const seen = new Set<string>()

    for (let i = 0; i < 25; i += 1) {
      const user = new UserEntity(1, "user@kinetix.com", "hash", "customer")
      mockUserRepository.findById.mockResolvedValue(user)
      mockUserRepository.save.mockResolvedValue(user)

      const result = await service.setupTwoFactor(1)
      expect(result.twoFactorSecret).toMatch(/^[A-Z2-7]+$/)
      expect(result.twoFactorSecret.length).toBeGreaterThanOrEqual(32)
      expect(result.twoFactorSecret).not.toContain("KINETIX_2FA")
      seen.add(result.twoFactorSecret)
    }

    expect(seen.size).toBe(25)
  })
})
