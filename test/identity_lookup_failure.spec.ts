import { INestMicroservice, NotFoundException, UnauthorizedException } from "@nestjs/common"
import { MicroserviceOptions, RpcException, Transport } from "@nestjs/microservices"
import { Test } from "@nestjs/testing"
import { getRepositoryToken } from "@nestjs/typeorm"
import * as grpc from "@grpc/grpc-js"
import * as protoLoader from "@grpc/proto-loader"
import IdentityGrpcController from "../src/adapters/controllers/identity_grpc.controller"
import UserProfileUsecaseService from "../src/application/services/user_profile_usecase.service"
import TokenService from "../src/application/services/token.service"
import MerchantEntity from "../src/domain/entities/merchant.entity"
import UserEntity from "../src/domain/entities/user.entity"
import PrincipalAliasTypeormEntity from "../src/infrastructure/persistence/entities/principal_alias_typeorm.entity"
import PrincipalTypeormEntity from "../src/infrastructure/persistence/entities/principal_typeorm.entity"
import { contractProto, contractProtoRoot } from "../src/infrastructure/mesh/contract_proto"
import { MERCHANT_ALIAS_SERVICE } from "../src/application/services/seller_onboarding_usecase.service"
import type {
  IdentityClient,
  LoadedIdentityPackage,
  LookupStubs,
  MerchantAnswer
} from "./types/identity_lookup.type"

const databaseDown = () => Promise.reject(new Error("connection terminated unexpectedly"))

function aliasFor(service: string) {
  return async () => ({
    principalId: "p-1",
    service,
    localId: "1",
    principal: { id: "p-1", kind: "merchant", displayName: "Toko" }
  })
}

function providersFor(stubs: LookupStubs) {
  return {
    profileUsecase: { getProfile: stubs.profile ?? (async () => null) },
    userRepository: { findById: stubs.user ?? (async () => new UserEntity(1, "a@kinetix.test", "h", "customer")) },
    merchantRepository: { findById: stubs.merchant ?? (async () => null) },
    tokenService: { verifyAccess: stubs.verifyAccess ?? (async () => ({ sub: "p-1" })) },
    aliasRepository: { findOne: stubs.alias ?? aliasFor(MERCHANT_ALIAS_SERVICE), find: async () => [] },
    principalRepository: { findOne: async () => ({ id: "p-1", kind: "customer" }) }
  }
}

function controllerWith(stubs: LookupStubs): IdentityGrpcController {
  const p = providersFor(stubs)
  return new IdentityGrpcController(
    p.profileUsecase as never,
    p.userRepository as never,
    p.merchantRepository as never,
    p.tokenService as never,
    p.aliasRepository as never,
    p.principalRepository as never
  )
}

function merchant(): MerchantEntity {
  return new MerchantEntity(
    1,
    9,
    "Toko",
    "toko",
    "brn",
    "tax",
    "verified",
    undefined,
    undefined,
    "Jl. A",
    "Jakarta",
    "10110"
  )
}

async function codeOf(call: Promise<unknown>): Promise<number | undefined> {
  try {
    await call
  } catch (error) {
    if (error instanceof RpcException) {
      return (error.getError() as { code: number }).code
    }

    throw error
  }

  return undefined
}

describe("an identity lookup that cannot be answered", () => {
  it("is UNAVAILABLE for a merchant when the database fails, not a merchant that does not exist", async () => {
    const code = await codeOf(controllerWith({ alias: databaseDown }).getMerchantInfo({ principal_id: "p-1" }))
    expect(code).toBe(grpc.status.UNAVAILABLE)
  })

  it("is UNAVAILABLE for a merchant when reading the merchant row fails", async () => {
    const code = await codeOf(controllerWith({ merchant: databaseDown }).getMerchantInfo({ principal_id: "p-1" }))
    expect(code).toBe(grpc.status.UNAVAILABLE)
  })

  it("still answers not found for a merchant that really does not exist", async () => {
    const response = await controllerWith({ merchant: async () => null }).getMerchantInfo({ principal_id: "p-1" })
    expect(response.found).toBe(false)
    expect(response.may_sell).toBe(false)
  })

  it("is UNAVAILABLE for a profile when the database fails", async () => {
    const code = await codeOf(
      controllerWith({ alias: databaseDown }).getUserProfile({ principal_id: "p-1" })
    )
    expect(code).toBe(grpc.status.UNAVAILABLE)
  })

  it("is UNAVAILABLE when the profile cannot be read, rather than a user with no address", async () => {
    const code = await codeOf(
      controllerWith({ alias: aliasFor("identity"), profile: databaseDown }).getUserProfile({ principal_id: "p-1" })
    )
    expect(code).toBe(grpc.status.UNAVAILABLE)
  })

  it("answers a user who never filled in a profile with the account and empty fields", async () => {
    const response = await controllerWith({
      alias: aliasFor("identity"),
      profile: () => Promise.reject(new NotFoundException("no profile"))
    }).getUserProfile({ principal_id: "p-1" })

    expect(response.found).toBe(true)
    expect(response.email).toBe("a@kinetix.test")
    expect(response.street_address).toBe("")
    expect(response.location).toBeUndefined()
  })

  it("calls a token invalid only when it is", async () => {
    const response = await controllerWith({
      verifyAccess: () => Promise.reject(new UnauthorizedException("This token has been revoked"))
    }).validateToken({ access_token: "t" })

    expect(response.valid).toBe(false)
  })

  it("is UNAVAILABLE when the revocation list cannot be read, rather than calling the token invalid", async () => {
    const code = await codeOf(controllerWith({ verifyAccess: databaseDown }).validateToken({ access_token: "t" }))
    expect(code).toBe(grpc.status.UNAVAILABLE)
  })
})

describe("on the wire", () => {
  const port = 41000 + Math.floor(Math.random() * 2000)
  let app: INestMicroservice
  let failing = true
  let client: IdentityClient

  beforeAll(async () => {
    const p = providersFor({
      alias: () => (failing ? databaseDown() : aliasFor(MERCHANT_ALIAS_SERVICE)()),
      merchant: async () => merchant()
    })

    const moduleRef = await Test.createTestingModule({
      controllers: [IdentityGrpcController],
      providers: [
        { provide: UserProfileUsecaseService, useValue: p.profileUsecase },
        { provide: "UserRepositoryPort", useValue: p.userRepository },
        { provide: "MerchantRepositoryPort", useValue: p.merchantRepository },
        { provide: TokenService, useValue: p.tokenService },
        { provide: getRepositoryToken(PrincipalAliasTypeormEntity), useValue: p.aliasRepository },
        { provide: getRepositoryToken(PrincipalTypeormEntity), useValue: p.principalRepository }
      ]
    }).compile()

    app = moduleRef.createNestMicroservice<MicroserviceOptions>({
      transport: Transport.GRPC,
      options: {
        package: ["identity.v1"],
        protoPath: [contractProto("identity/v1/identity.proto")],
        loader: { keepCase: true, includeDirs: [contractProtoRoot()] },
        url: `127.0.0.1:${port}`
      }
    })

    app.useLogger(false)
    await app.listen()

    const definition = protoLoader.loadSync(
      contractProto("identity/v1/identity.proto"),
      {
        keepCase: true,
        includeDirs: [contractProtoRoot()]
      }
    )

    const loaded = grpc.loadPackageDefinition(definition) as unknown as LoadedIdentityPackage

    client = new loaded.identity.v1.IdentityService(
      `127.0.0.1:${port}`,
      grpc.credentials.createInsecure()
    )
  })

  afterAll(async () => {
    client?.close()
    await app?.close()
  })

  function getMerchantInfo(): Promise<MerchantAnswer> {
    return new Promise((resolve, reject) => {
      client.GetMerchantInfo({ principal_id: "p-1" }, (error: grpc.ServiceError | null, response: never) =>
        error ? reject(error) : resolve(response)
      )
    })
  }

  it("reaches the caller as status UNAVAILABLE, which every caller already treats as unknown", async () => {
    failing = true
    await expect(getMerchantInfo()).rejects.toMatchObject({ code: grpc.status.UNAVAILABLE })
  })

  it("reaches the caller as a found merchant once the database answers", async () => {
    failing = false
    await expect(getMerchantInfo()).resolves.toMatchObject({ found: true, may_sell: true })
  })
})
