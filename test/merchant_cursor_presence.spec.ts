import { loadSync } from "@grpc/proto-loader"
import { contractProto, contractProtoRoot } from "../src/infrastructure/mesh/contract_proto"

function merchantsChangedSince() {
  const definition = loadSync(contractProto("identity/v1/identity.proto"), {
    keepCase: true,
    includeDirs: [contractProtoRoot()]
  })
  const service = definition["identity.v1.IdentityService"] as Record<
    string,
    {
      requestSerialize: (value: object) => Buffer
      requestDeserialize: (bytes: Buffer) => { cursor?: Record<string, unknown> }
      responseSerialize: (value: object) => Buffer
      responseDeserialize: (bytes: Buffer) => { next?: Record<string, unknown> }
    }
  >

  return service.MerchantsChangedSince
}

describe("a merchant cursor on the wire, read the way the server loads the contract", () => {
  it("keeps a transaction of zero, which is how a reader asks for the start", () => {
    const method = merchantsChangedSince()

    const request = method.requestDeserialize(method.requestSerialize({ cursor: { transaction_id: 0 } }))

    expect(request.cursor?.transaction_id).toBeDefined()
    expect(String(request.cursor?.transaction_id)).toBe("0")
  })

  it("leaves the transaction out when the reader did not name one", () => {
    const method = merchantsChangedSince()

    const request = method.requestDeserialize(
      method.requestSerialize({ cursor: { last_principal_id: "p-1" } })
    )

    expect(request.cursor?.transaction_id).toBeUndefined()
  })

  it("carries a transaction beyond what a double holds", () => {
    const method = merchantsChangedSince()

    const response = method.responseDeserialize(
      method.responseSerialize({ next: { transaction_id: "18446744073709551615" } })
    )

    expect(String(response.next?.transaction_id)).toBe("18446744073709551615")
  })
})
