import { DataSource } from "typeorm"

import { InitialSchema1788322826135 } from "./migrations/1788322826135-InitialSchema"
import { Principals1788512628577 } from "./migrations/1788512628577-Principals"
import { TokenLifecycle1788900000000 } from "./migrations/1788900000000-TokenLifecycle"

import MerchantTypeormEntity from "./infrastructure/persistence/entities/merchant_typeorm.entity"
import MerchantVerificationTypeormEntity from "./infrastructure/persistence/entities/merchant_verification_typeorm.entity"
import PrincipalAliasTypeormEntity from "./infrastructure/persistence/entities/principal_alias_typeorm.entity"
import PrincipalTypeormEntity from "./infrastructure/persistence/entities/principal_typeorm.entity"
import ProfileTypeormEntity from "./infrastructure/persistence/entities/profile_typeorm.entity"
import RefreshTokenTypeormEntity from "./infrastructure/persistence/entities/refresh_token_typeorm.entity"
import RevokedAccessTokenTypeormEntity from "./infrastructure/persistence/entities/revoked_access_token_typeorm.entity"
import UserTypeormEntity from "./infrastructure/persistence/entities/user_typeorm.entity"

const password = process.env.DB_PASSWORD
if (!password) {
  throw new Error("DB_PASSWORD is required and has no default. Set it in the environment.")
}

export default new DataSource({
  type: "postgres",
  host: process.env.DB_HOST ?? "localhost",
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME ?? "kinetix_identity_app",
  password,
  database: process.env.DB_DATABASE ?? "kinetix_identity_dev",
  entities: [
    PrincipalTypeormEntity,
    PrincipalAliasTypeormEntity,
    RefreshTokenTypeormEntity,
    RevokedAccessTokenTypeormEntity,
    UserTypeormEntity,
    ProfileTypeormEntity,
    MerchantVerificationTypeormEntity,
    MerchantTypeormEntity
  ],
  migrations: [InitialSchema1788322826135, Principals1788512628577, TokenLifecycle1788900000000],
  synchronize: false
})
