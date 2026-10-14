const GRPC_TIMEOUT_MS = 5000

function withTimeout<T>(promise: Promise<T>, timeoutMs: number = GRPC_TIMEOUT_MS): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const deadline = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`gRPC database execution timed out after ${timeoutMs}ms`)), timeoutMs)
  })

  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer))
}

export { withTimeout, GRPC_TIMEOUT_MS }
