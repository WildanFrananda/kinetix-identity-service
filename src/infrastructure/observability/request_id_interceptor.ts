import { Logger } from "@nestjs/common"
import { ServerInterceptingCall } from "@grpc/grpc-js"
import type { Metadata } from "@grpc/grpc-js"
import type {
  ServerInterceptingCallInterface,
  ServerInterceptor
} from "@grpc/grpc-js/build/src/server-interceptors"
import type { ServerMethodDefinition } from "@grpc/grpc-js/build/src/make-client"

const REQUEST_ID_KEY = "x-request-id"

const logger = new Logger("RequestId")

function requestIdInterceptor(): ServerInterceptor {
  return (
    methodDescriptor: ServerMethodDefinition<unknown, unknown>,
    call: ServerInterceptingCallInterface
  ): ServerInterceptingCall => {
    const method = methodDescriptor.path

    return new ServerInterceptingCall(call, {
      start: (next) => {
        next({
          onReceiveMetadata: (metadata, forward) => {
            logger.log(`gRPC ${method} (request_id=${requestIdOf(metadata)})`)
            forward(metadata)
          }
        })
      }
    })
  }
}

function requestIdOf(metadata: Metadata): string {
  const value = metadata.get(REQUEST_ID_KEY)[0]
  return typeof value === "string" && value.length > 0 ? value : "-"
}

export { requestIdInterceptor, REQUEST_ID_KEY }
