import { Metadata, status } from "@grpc/grpc-js"
import type { StatusObject } from "@grpc/grpc-js"
import type { ServerInterceptingCallInterface } from "@grpc/grpc-js/build/src/server-interceptors"
import type { ServerMethodDefinition } from "@grpc/grpc-js/build/src/make-client"
import { parsePeerAllowList } from "../src/infrastructure/mesh/peer_allow_list"
import { peerAuthorizationInterceptor } from "../src/infrastructure/mesh/peer_authorization_interceptor"

const LIST = [
  "search@identity.v1.IdentityService/MerchantsChangedSince",
  "notification@identity.v1.IdentityService/GetUserProfile"
].join(",")

function call(subjectAltName: string, path: string) {
  const statuses: StatusObject[] = []
  const handled: Metadata[] = []
  const downstream: Array<{ onReceiveMetadata: (metadata: Metadata) => void }> = []

  const transport = {
    getAuthContext: () => ({ sslPeerCertificate: { subjectaltname: subjectAltName } }),
    start: (listener: { onReceiveMetadata: (metadata: Metadata) => void }) => {
      downstream.push(listener)
    },
    sendStatus: (sent: StatusObject) => {
      statuses.push(sent)
    }
  }

  const intercept = peerAuthorizationInterceptor(parsePeerAllowList(LIST))

  const intercepted = intercept(
    { path } as ServerMethodDefinition<unknown, unknown>,
    transport as unknown as ServerInterceptingCallInterface
  )

  intercepted.start({
    onReceiveMetadata: (metadata) => {
      handled.push(metadata)
    },
    onReceiveMessage: () => undefined,
    onReceiveHalfClose: () => undefined,
    onCancel: () => undefined
  })

  downstream[0].onReceiveMetadata(new Metadata())

  return { handled: handled.length > 0, status: statuses[0] ?? null }
}

function spiffe(service: string): string {
  return `URI:spiffe://kinetix.local/service/${service}`
}

describe("the interceptor in front of identity's gRPC surface", () => {
  it("passes a caller through to the method it is granted", () => {
    const outcome = call(spiffe("search"), "/identity.v1.IdentityService/MerchantsChangedSince")

    expect(outcome).toEqual({ handled: true, status: null })
  })

  it("refuses a listed caller a method it is not granted, before the handler runs", () => {
    const outcome = call(spiffe("search"), "/identity.v1.IdentityService/GetUserProfile")

    expect(outcome.handled).toBe(false)
    expect(outcome.status?.code).toBe(status.PERMISSION_DENIED)
    expect(outcome.status?.details).toBe(
      "service 'search' may not call /identity.v1.IdentityService/GetUserProfile"
    )
  })

  it("refuses a service that is not on the list at all", () => {
    const outcome = call(spiffe("payment"), "/identity.v1.IdentityService/GetMerchantInfo")

    expect(outcome.handled).toBe(false)
    expect(outcome.status?.code).toBe(status.PERMISSION_DENIED)
    expect(outcome.status?.details).toBe("service 'payment' may not call this server")
  })

  it("refuses a certificate that carries no SPIFFE id", () => {
    const outcome = call("DNS:kinetix-search-service", "/identity.v1.IdentityService/MerchantsChangedSince")

    expect(outcome.handled).toBe(false)
    expect(outcome.status?.code).toBe(status.UNAUTHENTICATED)
  })
})
