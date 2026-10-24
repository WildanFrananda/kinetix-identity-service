type ErrorResponse = {
  error: string
  message: string
  traceId: string
}

type DelayedResponse = ErrorResponse & {
  retryAfterSeconds: number
}

export type { DelayedResponse, ErrorResponse }
