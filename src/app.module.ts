import { Module } from "@nestjs/common"
import { ConfigModule, ConfigService } from "@nestjs/config"
import { JwtModule } from "@nestjs/jwt"
import { TypeOrmModule } from "@nestjs/typeorm"

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
import UserProfileController from "./adapters/controllers/user_profile.controller"
import SellerOnboardingController from "./adapters/controllers/seller_onboarding.controller"
import IdentityGrpcController from "./adapters/controllers/identity_grpc.controller"

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: "postgres",
        host: config.get<string>("DB_HOST", "localhost"),
        port: Number(config.get<number>("DB_PORT", 5432)),
        username: config.get<string>("DB_USERNAME", "postgres"),
        password: config.get<string>("DB_PASSWORD", "postgrespassword"),
        database: config.get<string>("DB_DATABASE", "kinetix_identity_dev"),
        entities: [UserTypeormEntity, ProfileTypeormEntity, MerchantVerificationTypeormEntity, MerchantTypeormEntity],
        synchronize: config.get<string>("NODE_ENV") !== "production"
      })
    }),
    TypeOrmModule.forFeature([
      UserTypeormEntity,
      ProfileTypeormEntity,
      MerchantVerificationTypeormEntity,
      MerchantTypeormEntity
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>("JWT_SECRET", "kinetix_super_secret_jwt_key_2026"),
        signOptions: {
          expiresIn: config.get<string>("JWT_EXPIRES_IN", "86400s")
        }
      })
    })
  ],
  controllers: [AuthController, UserProfileController, SellerOnboardingController, IdentityGrpcController],
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
