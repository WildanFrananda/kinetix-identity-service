import UserEntity from "../src/domain/entities/user.entity"
import AuthUsecaseService from "../src/application/services/auth_usecase.service"

describe("AuthUsecaseService Unit Tests", () => {
  let service: AuthUsecaseService
  let mockUserRepository: any
  let mockJwtService: any

  beforeEach(() => {
    mockUserRepository = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      save: jest.fn()
    }
    mockJwtService = {
      sign: jest.fn().mockReturnValue("mocked_jwt_token")
    }

    service = new AuthUsecaseService(mockUserRepository, mockJwtService)
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

    expect(result.accessToken).toBe("mocked_jwt_token")
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
    expect(mockJwtService.sign).toHaveBeenCalledWith(
      expect.objectContaining({ role: "customer" })
    )
  })

  it("should setup 2FA secret and return totp QR code URL", async () => {
    const user = new UserEntity(1, "user@kinetix.com", "hash", "customer")
    mockUserRepository.findById.mockResolvedValue(user)
    mockUserRepository.save.mockResolvedValue(user)

    const result = await service.setupTwoFactor(1)

    expect(result.twoFactorSecret).toBeDefined()
    expect(result.qrCodeUrl).toContain("otpauth://totp/Kinetix")
    expect(user.isTwoFactorEnabled).toBe(true)
  })
})
