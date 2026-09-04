import { Controller, Inject } from "@nestjs/common"
import { GrpcMethod } from "@nestjs/microservices"
import { InjectRepository } from "@nestjs/typeorm"
import { Repository } from "typeorm"
import PrincipalAliasTypeormEntity from "../../infrastructure/persistence/entities/principal_alias_typeorm.entity"
import PrincipalTypeormEntity from "../../infrastructure/persistence/entities/principal_typeorm.entity"
import TokenService from "../../application/services/token.service"
import type {
  GetMerchantInfoRequest,
  GetMerchantInfoResponse,
  GetPrincipalRequest,
  GetPrincipalResponse,
  GetUserProfileRequest,
  GetUserProfileResponse,
  ResolvePrincipalRequest,
  ResolvePrincipalResponse,
  ValidateTokenRequest,
  ValidateTokenResponse
} from "../../types/identity_grpc.type"
import UserProfileUsecaseService from "../../application/services/user_profile_usecase.service"
import UserRepositoryPort from "../../domain/ports/user_repository.port"
import MerchantRepositoryPort from "../../domain/ports/merchant_repository.port"
import ProfileEntity from "../../domain/entities/profile.entity"
import UserEntity from "../../domain/entities/user.entity"
import MerchantEntity from "../../domain/entities/merchant.entity"

const GRPC_TIMEOUT_MS = 5000

function withTimeout<T>(promise: Promise<T>, timeoutMs: number = GRPC_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`gRPC database execution timed out after ${timeoutMs}ms`)), timeoutMs)
    )
  ])
}

@Controller()
class IdentityGrpcController {
  constructor(
    private readonly profileUsecase: UserProfileUsecaseService,
    @Inject("UserRepositoryPort")
    private readonly userRepository: UserRepositoryPort,
    @Inject("MerchantRepositoryPort")
    private readonly merchantRepository: MerchantRepositoryPort,
    private readonly tokenService: TokenService,
    @InjectRepository(PrincipalAliasTypeormEntity)
    private readonly aliasRepository: Repository<PrincipalAliasTypeormEntity>,
    @InjectRepository(PrincipalTypeormEntity)
    private readonly principalRepository: Repository<PrincipalTypeormEntity>
  ) {}

  @GrpcMethod("IdentityService", "ResolvePrincipal")
  async resolvePrincipal(data: ResolvePrincipalRequest): Promise<ResolvePrincipalResponse> {
    const key = data.serviceLocalId ?? data.service_local_id
    const service: string = key?.service ?? ""
    const localId: string = key?.localId ?? key?.local_id ?? ""

    if (service === "" || localId === "") {
      return { found: false, principal_id: "", kind: "PRINCIPAL_KIND_UNSPECIFIED", display_name: "" }
    }

    const alias = await withTimeout(
      this.aliasRepository.findOne({
        where: { service, localId },
        relations: { principal: true }
      })
    )

    if (!alias || !alias.principal) {
      return { found: false, principal_id: "", kind: "PRINCIPAL_KIND_UNSPECIFIED", display_name: "" }
    }

    return {
      found: true,
      principal_id: alias.principal.id,
      kind: alias.principal.kind,
      display_name: alias.principal.displayName ?? ""
    }
  }

  @GrpcMethod("IdentityService", "GetPrincipal")
  async getPrincipal(data: GetPrincipalRequest): Promise<GetPrincipalResponse> {
    const principalId: string = data.principalId ?? data.principal_id ?? ""

    if (principalId === "") {
      return { found: false, principal_id: "", kind: "PRINCIPAL_KIND_UNSPECIFIED", display_name: "", aliases: [] }
    }

    const principal = await withTimeout(this.principalRepository.findOne({ where: { id: principalId } }))

    if (!principal) {
      return { found: false, principal_id: "", kind: "PRINCIPAL_KIND_UNSPECIFIED", display_name: "", aliases: [] }
    }

    const aliases = await withTimeout(this.aliasRepository.find({ where: { principalId } }))

    return {
      found: true,
      principal_id: principal.id,
      kind: principal.kind,
      display_name: principal.displayName ?? "",
      aliases: aliases.map((a) => ({ service: a.service, local_id: a.localId }))
    }
  }

  @GrpcMethod("IdentityService", "GetUserProfile")
  async getUserProfile(data: GetUserProfileRequest): Promise<GetUserProfileResponse> {
    const userId: number = Number(data.user_id)
    try {
      const user: UserEntity | null = await withTimeout(this.userRepository.findById(userId))
      const profile: ProfileEntity | null = await withTimeout(this.profileUsecase.getProfile(userId)).catch(() => null)

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
    } catch {
      return {
        user_id: userId,
        email: "",
        full_name: "",
        phone_number: "",
        street_address: "",
        city: "",
        postal_code: "",
        role: "customer"
      }
    }
  }

  @GrpcMethod("IdentityService", "GetMerchantInfo")
  async getMerchantInfo(data: GetMerchantInfoRequest): Promise<GetMerchantInfoResponse> {
    const userId: number = Number(data.user_id)
    try {
      const merchant: MerchantEntity | null = await withTimeout(this.merchantRepository.findByUserId(userId))

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
    } catch {
      return {
        user_id: userId,
        store_name: "",
        business_registration_number: "",
        tax_id: "",
        status: "timeout"
      }
    }
  }

  @GrpcMethod("IdentityService", "ValidateToken")
  async validateToken(data: ValidateTokenRequest): Promise<ValidateTokenResponse> {
    const token: string = data.accessToken ?? data.access_token ?? ""
    if (token === "") {
      return { valid: false, principal_id: "", kind: "PRINCIPAL_KIND_UNSPECIFIED", reason: "no token supplied" }
    }

    let claims
    try {
      claims = await this.tokenService.verifyAccess(token)
    } catch {
      return { valid: false, principal_id: "", kind: "PRINCIPAL_KIND_UNSPECIFIED", reason: "invalid token" }
    }

    const principal = await withTimeout(this.principalRepository.findOne({ where: { id: claims.sub } }))
    if (!principal) {
      return { valid: false, principal_id: "", kind: "PRINCIPAL_KIND_UNSPECIFIED", reason: "unknown principal" }
    }

    return { valid: true, principal_id: principal.id, kind: principal.kind, reason: "" }
  }
}

export default IdentityGrpcController
