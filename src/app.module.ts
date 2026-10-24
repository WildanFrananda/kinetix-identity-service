import { Module } from "@nestjs/common"
import { APP_GUARD } from "@nestjs/core"
import { ConfigModule, ConfigService } from "@nestjs/config"
import { TypeOrmModule } from "@nestjs/typeorm"
import { ThrottlerModule } from "@nestjs/throttler"

import UserTypeormEntity from "./infrastructure/persistence/entities/user_typeorm.entity"
import ProfileTypeormEntity from "./infrastructure/persistence/entities/profile_typeorm.entity"
import MerchantVerificationTypeormEntity from "./infrastructure/persistence/entities/merchant_verification_typeorm.entity"
import GeocodedAddressTypeormEntity from "./infrastructure/persistence/entities/geocoded_address_typeorm.entity"
import MerchantTypeormEntity from "./infrastructure/persistence/entities/merchant_typeorm.entity"
import CourierApplicationTypeormEntity from "./infrastructure/persistence/entities/courier_application_typeorm.entity"
import AccountSignInAttemptTypeormEntity from "./infrastructure/persistence/entities/account_sign_in_attempt_typeorm.entity"
import TwoFactorChallengeAttemptTypeormEntity from "./infrastructure/persistence/entities/two_factor_challenge_attempt_typeorm.entity"

import TypeormUserRepositoryAdapter from "./infrastructure/persistence/adapters/typeorm_user_repository.adapter"
import TypeormProfileRepositoryAdapter from "./infrastructure/persistence/adapters/typeorm_profile_repository.adapter"
import TypeormMerchantVerificationRepositoryAdapter from "./infrastructure/persistence/adapters/typeorm_merchant_verification_repository.adapter"
import TypeormMerchantRepositoryAdapter from "./infrastructure/persistence/adapters/typeorm_merchant_repository.adapter"
import TypeormCourierApplicationRepositoryAdapter from "./infrastructure/persistence/adapters/typeorm_courier_application_repository.adapter"
import TypeormSignInAttemptRepositoryAdapter from "./infrastructure/persistence/adapters/typeorm_sign_in_attempt_repository.adapter"

import AuthUsecaseService from "./application/services/auth_usecase.service"
import UserProfileUsecaseService from "./application/services/user_profile_usecase.service"
import SellerOnboardingUsecaseService from "./application/services/seller_onboarding_usecase.service"
import CourierOnboardingUsecaseService from "./application/services/courier_onboarding_usecase.service"
import CourierRegistrationUsecaseService from "./application/services/courier_registration_usecase.service"
import SignInAttemptsService from "./application/services/sign_in_attempts.service"
import ExpiredRecordSweeperService from "./application/services/expired_record_sweeper.service"
import FleetRegistryGrpcAdapter from "./infrastructure/mesh/fleet_registry_grpc.adapter"

import AuthController from "./adapters/controllers/auth.controller"
import HealthController from "./adapters/controllers/health.controller"
import UserProfileController from "./adapters/controllers/user_profile.controller"
import SellerOnboardingController from "./adapters/controllers/seller_onboarding.controller"
import CourierOnboardingController from "./adapters/controllers/courier_onboarding.controller"
import GeoGrpcController from "./adapters/controllers/geo_grpc.controller"
import GeocodingUsecaseService from "./application/services/geocoding_usecase.service"
import NominatimGeocodingAdapter from "./infrastructure/geocoding/nominatim_geocoding.adapter"
import TypeormGeocodedAddressRepositoryAdapter from "./infrastructure/persistence/adapters/typeorm_geocoded_address_repository.adapter"
import IdentityGrpcController from "./adapters/controllers/identity_grpc.controller"
import MetricsController from "./adapters/controllers/metrics.controller"
import PrincipalAliasTypeormEntity from "./infrastructure/persistence/entities/principal_alias_typeorm.entity"
import PrincipalTypeormEntity from "./infrastructure/persistence/entities/principal_typeorm.entity"
import RefreshTokenTypeormEntity from "./infrastructure/persistence/entities/refresh_token_typeorm.entity"
import RevokedAccessTokenTypeormEntity from "./infrastructure/persistence/entities/revoked_access_token_typeorm.entity"

import JwtKeyProvider from "./infrastructure/crypto/jwt_key_provider"
import TokenService from "./application/services/token.service"
import PrincipalResolverService from "./application/services/principal_resolver.service"
import JwtAuthGuard from "./adapters/guards/jwt_auth.guard"
import RolesGuard from "./adapters/guards/roles.guard"
import SelfOrStaffGuard from "./adapters/guards/self_or_staff.guard"
import JwksController from "./adapters/controllers/jwks.controller"
import { CLIENT_GATE_PROVIDER } from "./infrastructure/attestation/client_gate.provider"
import { positiveIntegerSetting, requiredSetting } from "./infrastructure/config/required_setting"
import { DEFAULT_THROTTLE } from "./infrastructure/http/throttle_policy"

const DATABASE_CONNECT_TIMEOUT_MS = 5000

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([DEFAULT_THROTTLE]),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        return {
          type: "postgres",
          host: requiredSetting("DB_HOST", config.get<string>("DB_HOST")),
          port: positiveIntegerSetting("DB_PORT", config.get<string>("DB_PORT")),
          username: requiredSetting("DB_USERNAME", config.get<string>("DB_USERNAME")),
          password: requiredSetting("DB_PASSWORD", config.get<string>("DB_PASSWORD")),
          database: requiredSetting("DB_DATABASE", config.get<string>("DB_DATABASE")),
          connectTimeoutMS: DATABASE_CONNECT_TIMEOUT_MS,
          entities: [
            PrincipalTypeormEntity,
            PrincipalAliasTypeormEntity,
            RefreshTokenTypeormEntity,
            RevokedAccessTokenTypeormEntity,
            UserTypeormEntity,
            ProfileTypeormEntity,
            MerchantVerificationTypeormEntity,
            MerchantTypeormEntity,
            GeocodedAddressTypeormEntity,
            CourierApplicationTypeormEntity,
            AccountSignInAttemptTypeormEntity,
            TwoFactorChallengeAttemptTypeormEntity
          ],
          synchronize: false
        }
      }
    }),
    TypeOrmModule.forFeature([
      PrincipalTypeormEntity,
      PrincipalAliasTypeormEntity,
      RefreshTokenTypeormEntity,
      RevokedAccessTokenTypeormEntity,
      UserTypeormEntity,
      ProfileTypeormEntity,
      MerchantVerificationTypeormEntity,
      MerchantTypeormEntity,
      GeocodedAddressTypeormEntity,
      CourierApplicationTypeormEntity,
      AccountSignInAttemptTypeormEntity,
      TwoFactorChallengeAttemptTypeormEntity
    ])
  ],
  controllers: [
    HealthController,
    MetricsController,
    JwksController,
    AuthController,
    UserProfileController,
    SellerOnboardingController,
    CourierOnboardingController,
    IdentityGrpcController,
    GeoGrpcController
  ],
  providers: [
    JwtKeyProvider,
    TokenService,
    PrincipalResolverService,
    CLIENT_GATE_PROVIDER,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard
    },
    RolesGuard,
    SelfOrStaffGuard,
    AuthUsecaseService,
    SignInAttemptsService,
    ExpiredRecordSweeperService,
    UserProfileUsecaseService,
    GeocodingUsecaseService,
    SellerOnboardingUsecaseService,
    CourierOnboardingUsecaseService,
    CourierRegistrationUsecaseService,
    {
      provide: "UserRepositoryPort",
      useClass: TypeormUserRepositoryAdapter
    },
    {
      provide: "ProfileRepositoryPort",
      useClass: TypeormProfileRepositoryAdapter
    },
    {
      provide: "MerchantVerificationRepositoryPort",
      useClass: TypeormMerchantVerificationRepositoryAdapter
    },
    {
      provide: "MerchantRepositoryPort",
      useClass: TypeormMerchantRepositoryAdapter
    },
    {
      provide: "CourierApplicationRepositoryPort",
      useClass: TypeormCourierApplicationRepositoryAdapter
    },
    {
      provide: "SignInAttemptRepositoryPort",
      useClass: TypeormSignInAttemptRepositoryAdapter
    },
    {
      provide: "FleetRegistryPort",
      useClass: FleetRegistryGrpcAdapter
    },
    {
      provide: "GeocodingProviderPort",
      useClass: NominatimGeocodingAdapter
    },
    {
      provide: "GeocodedAddressRepositoryPort",
      useClass: TypeormGeocodedAddressRepositoryAdapter
    }
  ]
})
class AppModule {}

export default AppModule
