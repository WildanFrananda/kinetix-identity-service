const GRPC_TIMEOUT_MS = 5000

function withTimeout<T>(promise: Promise<T>, timeoutMs: number = GRPC_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`gRPC database execution timed out after ${timeoutMs}ms`)), timeoutMs)
    )
  ])
}

export { withTimeout, GRPC_TIMEOUT_MS }
