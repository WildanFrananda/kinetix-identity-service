import { Logger } from "@nestjs/common"
import { Metadata, ServerInterceptingCall, status } from "@grpc/grpc-js"
import type {
  ServerInterceptingCallInterface,
  ServerInterceptor
} from "@grpc/grpc-js/build/src/server-interceptors"
import type { ServerMethodDefinition } from "@grpc/grpc-js/build/src/make-client"
import { peerService } from "./spiffe"

const logger = new Logger("PeerAuthorization")

function peerAuthorizationInterceptor(allowed: ReadonlySet<string>): ServerInterceptor {
  return (
    methodDescriptor: ServerMethodDefinition<unknown, unknown>,
    call: ServerInterceptingCallInterface
  ): ServerInterceptingCall => {
    const method = methodDescriptor.path
    const service = peerService(call.getAuthContext())

    if (service === null) {
      logger.warn(`refused a gRPC call to ${method} from a peer with no SPIFFE identity`)
      return refuse(call, status.UNAUTHENTICATED, "a client certificate carrying a SPIFFE id is required")
    }

    if (!allowed.has(service)) {
      logger.warn(`refused a gRPC call to ${method} from ${service}, which is not on the allow list`)
      return refuse(call, status.PERMISSION_DENIED, `service '${service}' may not call this server`)
    }

    return new ServerInterceptingCall(call)
  }
}

function refuse(
  call: ServerInterceptingCallInterface,
  code: number,
  details: string
): ServerInterceptingCall {
  return new ServerInterceptingCall(call, {
    start: (next) => {
      next({
        onReceiveMetadata: (_metadata, _n) => {
          call.sendStatus({ code, details, metadata: new Metadata() })
        }
      })
    }
  })
}

function allowedCallers(): ReadonlySet<string> {
  const raw = process.env.GRPC_ALLOWED_CALLERS ?? ""
  const allowed = new Set(
    raw
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
  )

  if (allowed.size === 0) {
    throw new Error(
      "GRPC_ALLOWED_CALLERS is empty. Name the services permitted to call this server, or the " +
        "gRPC surface is unreachable."
    )
  }

  logger.log(`gRPC callers allowed on this server: ${[...allowed].join(", ")}`)
  return allowed
}

export { peerAuthorizationInterceptor, allowedCallers }
