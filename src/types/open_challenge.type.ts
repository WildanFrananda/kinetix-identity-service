import type UserEntity from "../domain/entities/user.entity"
import type { MfaChallengeClaims } from "./two_factor.type"

type OpenChallenge = {
  claims: MfaChallengeClaims
  user: UserEntity
  twoFactorSecret: string
}

export type { OpenChallenge }
