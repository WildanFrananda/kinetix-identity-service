import { Controller, Inject } from "@nestjs/common"
import { GrpcMethod } from "@nestjs/microservices"
import { JwtService } from "@nestjs/jwt"
import UserProfileUsecaseService from "../../application/services/user_profile_usecase.service"
import UserRepositoryPort from "../../domain/ports/user_repository.port"
import MerchantRepositoryPort from "../../domain/ports/merchant_repository.port"
import ProfileEntity from "../../domain/entities/profile.entity"
import UserEntity from "../../domain/entities/user.entity"
import MerchantEntity from "../../domain/entities/merchant.entity"

@Controller()
class IdentityGrpcController {
  constructor(
    private readonly profileUsecase: UserProfileUsecaseService,
    @Inject("UserRepositoryPort")
    private readonly userRepository: UserRepositoryPort,
    @Inject("MerchantRepositoryPort")
    private readonly merchantRepository: MerchantRepositoryPort,
    private readonly jwtService: JwtService
  ) {}

  @GrpcMethod("IdentityService", "GetUserProfile")
  async getUserProfile(data: { user_id: number }): Promise<{
    user_id: number
    email: string
    full_name: string
    phone_number: string
    street_address: string
    city: string
    postal_code: string
    role: string
  }> {
    const userId: number = Number(data.user_id)
    const user: UserEntity | null = await this.userRepository.findById(userId)
    const profile: ProfileEntity | null = await this.profileUsecase.getProfile(userId).catch(() => null)

    return {
      user_id: userId,
      email: user ? user.email : "",
      full_name: profile ? profile.fullName : "",
      phone_number: profile ? profile.phoneNumber : "",
      street_address: profile ? profile.streetAddress : "",
      city: profile ? profile.city : "",
      postal_code: profile ? profile.postalCode : "",
      role: user ? user.role : "customer"
    }
  }

  @GrpcMethod("IdentityService", "GetMerchantInfo")
  async getMerchantInfo(data: { user_id: number }): Promise<{
    user_id: number
    store_name: string
    business_registration_number: string
    tax_id: string
    status: string
  }> {
    const userId: number = Number(data.user_id)
    const merchant: MerchantEntity | null = await this.merchantRepository.findByUserId(userId)

    if (!merchant) {
      return {
        user_id: userId,
        store_name: "",
        business_registration_number: "",
        tax_id: "",
        status: "not_found"
      }
    }

    return {
      user_id: merchant.userId,
      store_name: merchant.storeName,
      business_registration_number: merchant.businessRegistrationNumber,
      tax_id: merchant.taxId,
      status: merchant.status
    }
  }

  @GrpcMethod("IdentityService", "ValidateToken")
  async validateToken(data: { access_token: string }): Promise<{
    valid: boolean
    user_id: number
    email: string
    role: string
  }> {
    try {
      const payload = this.jwtService.verify(data.access_token)
      return {
        valid: true,
        user_id: payload.sub,
        email: payload.email,
        role: payload.role
      }
    } catch {
      return {
        valid: false,
        user_id: 0,
        email: "",
        role: ""
      }
    }
  }
}

export default IdentityGrpcController
