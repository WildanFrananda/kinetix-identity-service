import type * as grpc from "@grpc/grpc-js"
import type MerchantEntity from "../../src/domain/entities/merchant.entity"
import type UserEntity from "../../src/domain/entities/user.entity"

type LookupStubs = {
  alias?: () => Promise<unknown>
  user?: () => Promise<UserEntity | null>
  profile?: () => Promise<unknown>
  merchant?: () => Promise<MerchantEntity | null>
  verifyAccess?: () => Promise<unknown>
}

type IdentityClient = grpc.Client & Record<string, (...args: unknown[]) => unknown>

type IdentityClientConstructor = new (address: string, credentials: grpc.ChannelCredentials) => IdentityClient

type LoadedIdentityPackage = {
  identity: {
    v1: {
      IdentityService: IdentityClientConstructor
    }
  }
}

type MerchantAnswer = {
  found: boolean
  may_sell: boolean
}

export type { IdentityClient, IdentityClientConstructor, LoadedIdentityPackage, LookupStubs, MerchantAnswer }
