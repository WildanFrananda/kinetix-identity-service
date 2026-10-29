import { DataSource } from "typeorm"

import { InitialSchema1788322826135 } from "./migrations/1788322826135-InitialSchema"
import { Principals1788512628577 } from "./migrations/1788512628577-Principals"
import { TokenLifecycle1788900000000 } from "./migrations/1788900000000-TokenLifecycle"
import { ProfileProvenance1788950000000 } from "./migrations/1788950000000-ProfileProvenance"
import { PrincipalForEveryUser1789000000000 } from "./migrations/1789000000000-PrincipalForEveryUser"
import { GeocodedAddresses1789100000000 } from "./migrations/1789100000000-GeocodedAddresses"
import { ProfileCoordinates1789200000000 } from "./migrations/1789200000000-ProfileCoordinates"
import { MerchantStoreAddress1789300000000 } from "./migrations/1789300000000-MerchantStoreAddress"
import { MerchantCursorPrecision1789400000000 } from "./migrations/1789400000000-MerchantCursorPrecision"
import { MerchantChangeTransaction1789500000000 } from "./migrations/1789500000000-MerchantChangeTransaction"
import { CaseInsensitiveEmail1789600000000 } from "./migrations/1789600000000-CaseInsensitiveEmail"
import { TwoFactorLastStep1789610000000 } from "./migrations/1789610000000-TwoFactorLastStep"
import { CourierApplications1789620000000 } from "./migrations/1789620000000-CourierApplications"
import { NoPlaceholderStoreDescription1789630000000 } from "./migrations/1789630000000-NoPlaceholderStoreDescription"
import { SignInAttempts1789640000000 } from "./migrations/1789640000000-SignInAttempts"
import { RefreshTokenClient1789650000000 } from "./migrations/1789650000000-RefreshTokenClient"
import { CourierApplicationRejection1789660000000 } from "./migrations/1789660000000-CourierApplicationRejection"
import { SellerApplicationRejectedAt1789670000000 } from "./migrations/1789670000000-SellerApplicationRejectedAt"
import { Passkeys1789680000000 } from "./migrations/1789680000000-Passkeys"

import AccountSignInAttemptTypeormEntity from "./infrastructure/persistence/entities/account_sign_in_attempt_typeorm.entity"
import CourierApplicationTypeormEntity from "./infrastructure/persistence/entities/courier_application_typeorm.entity"
import GeocodedAddressTypeormEntity from "./infrastructure/persistence/entities/geocoded_address_typeorm.entity"
import MerchantTypeormEntity from "./infrastructure/persistence/entities/merchant_typeorm.entity"
import MerchantVerificationTypeormEntity from "./infrastructure/persistence/entities/merchant_verification_typeorm.entity"
import PasskeyChallengeTypeormEntity from "./infrastructure/persistence/entities/passkey_challenge_typeorm.entity"
import PasskeyTypeormEntity from "./infrastructure/persistence/entities/passkey_typeorm.entity"
import PrincipalAliasTypeormEntity from "./infrastructure/persistence/entities/principal_alias_typeorm.entity"
import PrincipalTypeormEntity from "./infrastructure/persistence/entities/principal_typeorm.entity"
import ProfileTypeormEntity from "./infrastructure/persistence/entities/profile_typeorm.entity"
import RefreshTokenTypeormEntity from "./infrastructure/persistence/entities/refresh_token_typeorm.entity"
import RevokedAccessTokenTypeormEntity from "./infrastructure/persistence/entities/revoked_access_token_typeorm.entity"
import TwoFactorChallengeAttemptTypeormEntity from "./infrastructure/persistence/entities/two_factor_challenge_attempt_typeorm.entity"
import UserTypeormEntity from "./infrastructure/persistence/entities/user_typeorm.entity"
import { positiveIntegerSetting, requiredSetting } from "./infrastructure/config/required_setting"

export default new DataSource({
  type: "postgres",
  host: requiredSetting("DB_HOST", process.env.DB_HOST),
  port: positiveIntegerSetting("DB_PORT", process.env.DB_PORT),
  username: requiredSetting("DB_USERNAME", process.env.DB_USERNAME),
  password: requiredSetting("DB_PASSWORD", process.env.DB_PASSWORD),
  database: requiredSetting("DB_DATABASE", process.env.DB_DATABASE),
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
    TwoFactorChallengeAttemptTypeormEntity,
    PasskeyTypeormEntity,
    PasskeyChallengeTypeormEntity
  ],
  migrations: [
    InitialSchema1788322826135,
    Principals1788512628577,
    TokenLifecycle1788900000000,
    ProfileProvenance1788950000000,
    PrincipalForEveryUser1789000000000,
    GeocodedAddresses1789100000000,
    ProfileCoordinates1789200000000,
    MerchantStoreAddress1789300000000,
    MerchantCursorPrecision1789400000000,
    MerchantChangeTransaction1789500000000,
    CaseInsensitiveEmail1789600000000,
    TwoFactorLastStep1789610000000,
    CourierApplications1789620000000,
    NoPlaceholderStoreDescription1789630000000,
    SignInAttempts1789640000000,
    RefreshTokenClient1789650000000,
    CourierApplicationRejection1789660000000,
    SellerApplicationRejectedAt1789670000000,
    Passkeys1789680000000
  ],
  synchronize: false
})
