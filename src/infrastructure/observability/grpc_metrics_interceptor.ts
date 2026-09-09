import { ServerInterceptingCall, status as grpcStatus } from "@grpc/grpc-js"
import type { PartialStatusObject } from "@grpc/grpc-js/build/src/call-interface"
import type {
  ServerInterceptingCallInterface,
  ServerInterceptor,
  ServerListener
} from "@grpc/grpc-js/build/src/server-interceptors"
import type { ServerMethodDefinition } from "@grpc/grpc-js/build/src/make-client"
import { recordGrpcServerCall } from "./metrics_registry"

const UNRECOGNISED_CODE = "UNKNOWN_CODE"

function grpcMetricsInterceptor(): ServerInterceptor {
  return (
    methodDescriptor: ServerMethodDefinition<unknown, unknown>,
    call: ServerInterceptingCallInterface
  ): ServerInterceptingCall => {
    const grpcMethod = methodDescriptor.path
    let counted = false

    const count = (code: number): void => {
      if (counted) {
        return
      }
      counted = true
      recordGrpcServerCall({ grpcMethod, grpcCode: codeNameOf(code) })
    }

    return new ServerInterceptingCall(call, {
      start: (next: (listener?: ServerListener) => void): void => {
        next({
          onCancel: (): void => {
            count(grpcStatus.CANCELLED)
          }
        })
      },
      sendStatus: (
        status: PartialStatusObject,
        next: (status: PartialStatusObject) => void
      ): void => {
        count(status.code)
        next(status)
      }
    })
  }
}

function codeNameOf(code: number): string {
  const name: string | undefined = grpcStatus[code]
  return name ?? UNRECOGNISED_CODE
}

export { grpcMetricsInterceptor }
