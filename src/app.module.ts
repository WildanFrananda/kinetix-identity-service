import { Module } from "@nestjs/common"
import { ConfigModule, ConfigService } from "@nestjs/config"
import { JwtModule } from "@nestjs/jwt"
import { TypeOrmModule } from "@nestjs/typeorm"
import { ThrottlerModule } from "@nestjs/throttler"

import UserTypeormEntity from "./infrastructure/persistence/entities/user_typeorm.entity"
import ProfileTypeormEntity from "./infrastructure/persistence/entities/profile_typeorm.entity"
import MerchantVerificationTypeormEntity from "./infrastructure/persistence/entities/merchant_verification_typeorm.entity"
import MerchantTypeormEntity from "./infrastructure/persistence/entities/merchant_typeorm.entity"

import TypeormUserRepositoryAdapter from "./infrastructure/persistence/adapters/typeorm_user_repository.adapter"
import TypeormProfileRepositoryAdapter from "./infrastructure/persistence/adapters/typeorm_profile_repository.adapter"
import TypeormMerchantVerificationRepositoryAdapter from "./infrastructure/persistence/adapters/typeorm_merchant_verification_repository.adapter"
import TypeormMerchantRepositoryAdapter from "./infrastructure/persistence/adapters/typeorm_merchant_repository.adapter"

import AuthUsecaseService from "./application/services/auth_usecase.service"
import UserProfileUsecaseService from "./application/services/user_profile_usecase.service"
import SellerOnboardingUsecaseService from "./application/services/seller_onboarding_usecase.service"

import AuthController from "./adapters/controllers/auth.controller"
import HealthController from "./adapters/controllers/health.controller"
import UserProfileController from "./adapters/controllers/user_profile.controller"
import SellerOnboardingController from "./adapters/controllers/seller_onboarding.controller"
import IdentityGrpcController from "./adapters/controllers/identity_grpc.controller"
import PrincipalAliasTypeormEntity from "./infrastructure/persistence/entities/principal_alias_typeorm.entity"
import PrincipalTypeormEntity from "./infrastructure/persistence/entities/principal_typeorm.entity"

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 10
      }
    ]),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const dbPassword = config.get<string>("DB_PASSWORD") || process.env.DB_PASSWORD
        if (!dbPassword) {
          throw new Error("DB_PASSWORD is required and has no default. Set it in the environment.")
        }
        return {
          type: "postgres",
          host: config.get<string>("DB_HOST", "localhost"),
          port: Number(config.get<number>("DB_PORT", 5432)),
          username: config.get<string>("DB_USERNAME", "postgres"),
          password: dbPassword,
          database: config.get<string>("DB_DATABASE", "kinetix_identity_dev"),
          entities: [
            PrincipalTypeormEntity,
            PrincipalAliasTypeormEntity,
            UserTypeormEntity,
            ProfileTypeormEntity,
            MerchantVerificationTypeormEntity,
            MerchantTypeormEntity
          ],
          synchronize: false
        }
      }
    }),
    TypeOrmModule.forFeature([
      PrincipalTypeormEntity,
      PrincipalAliasTypeormEntity,
      UserTypeormEntity,
      ProfileTypeormEntity,
      MerchantVerificationTypeormEntity,
      MerchantTypeormEntity
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const jwtSecret = config.get<string>("JWT_SECRET") || process.env.JWT_SECRET
        if (!jwtSecret) {
          throw new Error("JWT_SECRET is required and has no default. Set it in the environment.")
        }
        if (jwtSecret.length < 32) {
          throw new Error("JWT_SECRET must be at least 32 characters.")
        }
        return {
          secret: jwtSecret,
          signOptions: {
            expiresIn: 86400
          }
        }
      }
    })
  ],
  controllers: [
    HealthController,
    AuthController,
    UserProfileController,
    SellerOnboardingController,
    IdentityGrpcController
  ],
  providers: [
    AuthUsecaseService,
    UserProfileUsecaseService,
    SellerOnboardingUsecaseService,
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
    }
  ]
})
class AppModule {}

export default AppModule
